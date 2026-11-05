import { Fragment } from "react";

function toSeconds(stamp: string) {
  return stamp.split(":").reduce((a, p) => a * 60 + Number(p), 0);
}

function inline(text: string, onSeek?: (t: number) => void) {
  return text.split(/(\*\*[^*]+\*\*|\[\d+(?::\d+)+\])/g).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    const m = p.match(/^\[(\d+(?::\d+)+)\]$/);
    if (m && onSeek) {
      return (
        <button key={i} type="button" onClick={() => onSeek(toSeconds(m[1]))} className="mx-0.5 rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs tabular-nums text-brand hover:bg-brand hover:text-on-brand">
          {m[1]}
        </button>
      );
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/** Small, safe markdown subset: headings, bullets, numbered lists, checkboxes, bold. No raw HTML. */
export default function Markdown({ source, onSeek }: { source: string; onSeek?: (t: number) => void }) {
  const lines = source.split("\n");
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: React.ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(
      <Tag key={out.length} className={`my-2 space-y-1 pl-5 ${list.ordered ? "list-decimal" : "list-disc"}`}>
        {list.items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) {
      flush();
      const cls = h[1].length === 1 ? "mt-1 text-lg font-semibold" : "mt-4 text-[15px] font-semibold";
      out.push(
        <p key={out.length} className={cls} role="heading" aria-level={h[1].length + 1}>
          {inline(h[2], onSeek)}
        </p>,
      );
    } else if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      const text = (ul ?? ol)![1];
      const box = text.match(/^\[( |x|X)\]\s+(.*)$/);
      list.items.push(
        box ? (
          <span className="flex items-baseline gap-2">
            <input type="checkbox" defaultChecked={box[1] !== " "} disabled className="translate-y-0.5" aria-hidden />
            {inline(box[2], onSeek)}
          </span>
        ) : (
          inline(text, onSeek)
        ),
      );
    } else if (!line.trim()) {
      flush();
    } else {
      flush();
      out.push(
        <p key={out.length} className="my-2 leading-relaxed">
          {inline(line, onSeek)}
        </p>,
      );
    }
  }
  flush();
  return <div className="max-w-prose text-[15px]">{out}</div>;
}
