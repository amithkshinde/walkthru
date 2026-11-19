import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Recordings stored in a user's Google Drive have storage_path = "gdrive:<file id>".
// Walkthru only gets the narrow drive.file scope: it can see files it created, nothing else.
export const DRIVE_PREFIX = "gdrive:";
export const isDrivePath = (p: string | null | undefined): p is string => !!p && p.startsWith(DRIVE_PREFIX);
export const driveFileId = (p: string) => p.slice(DRIVE_PREFIX.length);

const SCOPE = "https://www.googleapis.com/auth/drive.file";

export function driveConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && /^[0-9a-f]{64}$/i.test(process.env.DRIVE_TOKEN_KEY ?? "");
}

function key() {
  return Buffer.from(process.env.DRIVE_TOKEN_KEY ?? "", "hex");
}

export function encryptToken(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptToken(blob: string) {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function authUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: `${origin}/api/drive/callback`,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(origin: string, code: string): Promise<{ refresh_token?: string; access_token?: string } | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${origin}/api/drive/callback`,
      grant_type: "authorization_code",
    }),
  });
  return res.ok ? res.json() : null;
}

const cache = new Map<string, { token: string; exp: number }>();

/** Short-lived access token from an encrypted refresh token. Null if Google rejects it (revoked). */
export async function accessTokenFor(encrypted: string): Promise<string | null> {
  const hit = cache.get(encrypted);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  let refresh: string;
  try {
    refresh = decryptToken(encrypted);
  } catch {
    return null;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  cache.set(encrypted, { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

export async function revokeToken(encrypted: string) {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptToken(encrypted))}`, { method: "POST" });
  } catch {}
}

export async function createFolder(access: string, name: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { id?: string }).id ?? null;
}

/** Starts a resumable upload. Passing the site origin lets the browser PUT the file straight to Google. */
export async function startUpload(access: string, o: { name: string; mime: string; size: number; folderId: string | null; origin: string }) {
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": o.mime,
      "x-upload-content-length": String(o.size),
      origin: o.origin,
    },
    body: JSON.stringify({ name: o.name, ...(o.folderId ? { parents: [o.folderId] } : {}) }),
  });
  return res.ok ? res.headers.get("location") : null;
}

export async function fileInfo(access: string, id: string): Promise<{ id: string; size?: string; mimeType?: string; trashed?: boolean } | null> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,size,mimeType,trashed`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  return res.ok ? res.json() : null;
}

export async function deleteFiles(access: string, ids: string[]) {
  await Promise.all(
    ids.map((id) =>
      fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${access}` } }).catch(() => null),
    ),
  );
}

/** Streams a file's bytes, forwarding the browser's Range header so seeking works. */
export function fetchMedia(access: string, id: string, range: string | null) {
  return fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, {
    headers: { Authorization: `Bearer ${access}`, ...(range ? { Range: range } : {}) },
  });
}
