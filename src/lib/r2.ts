import { AwsClient } from "aws4fetch";

// Recordings stored in Cloudflare R2 have storage_path = "r2:<user>/<id>.<ext>".
// Older recordings (and thumbnails) stay in Supabase Storage with a plain path.
export const R2_PREFIX = "r2:";
export const isR2Path = (p: string | null | undefined): p is string => !!p && p.startsWith(R2_PREFIX);
export const r2Key = (p: string) => p.slice(R2_PREFIX.length);

function config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export const r2Configured = () => !!config();

function objectUrl(c: NonNullable<ReturnType<typeof config>>, key: string) {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `https://${c.accountId}.r2.cloudflarestorage.com/${c.bucket}/${path}`;
}

function client(c: NonNullable<ReturnType<typeof config>>) {
  return new AwsClient({ accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, service: "s3", region: "auto" });
}

async function presign(method: "GET" | "PUT", key: string, expires: number, query: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const c = config();
  if (!c) return null;
  const url = new URL(objectUrl(c, key));
  url.searchParams.set("X-Amz-Expires", String(expires));
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const signed = await client(c).sign(new Request(url, { method, headers }), { aws: { signQuery: true } });
  return signed.url;
}

export function r2UploadUrl(key: string, contentType: string) {
  return presign("PUT", key, 60 * 60, {}, { "content-type": contentType });
}

export function r2ReadUrl(key: string, expires: number, downloadName?: string) {
  return presign(
    "GET",
    key,
    expires,
    downloadName ? { "response-content-disposition": `attachment; filename="${downloadName.replace(/"/g, "")}"` } : {},
  );
}

export async function r2Delete(keys: string[]) {
  const c = config();
  if (!c) return;
  const aws = client(c);
  await Promise.all(keys.map((k) => aws.fetch(objectUrl(c, k), { method: "DELETE" }).catch(() => null)));
}

/** Total bytes per key under a prefix (e.g. "<user id>/"). */
export async function r2Sizes(prefix: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const c = config();
  if (!c) return out;
  const aws = client(c);
  let token: string | null = null;
  for (let i = 0; i < 20; i++) {
    const url = new URL(`https://${c.accountId}.r2.cloudflarestorage.com/${c.bucket}`);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    if (token) url.searchParams.set("continuation-token", token);
    const res = await aws.fetch(url.toString());
    if (!res.ok) break;
    const xml = await res.text();
    for (const m of xml.matchAll(/<Contents>[\s\S]*?<Key>([^<]+)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g)) {
      out.set(`${R2_PREFIX}${m[1]}`, Number(m[2]));
    }
    const next = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    if (!next) break;
    token = next[1];
  }
  return out;
}
