import { Fragment } from "react";

function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>,
  );
}

/** Small, safe markdown subset: headings, bullets, numbered lists, checkboxes, bold. No raw HTML. */
export default function Markdown({ source }: { source: string }) {
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
          {inline(h[2])}
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
            {inline(box[2])}
          </span>
        ) : (
          inline(text)
        ),
      );
    } else if (!line.trim()) {
      flush();
    } else {
      flush();
      out.push(
        <p key={out.length} className="my-2 leading-relaxed">
          {inline(line)}
        </p>,
      );
    }
  }
  flush();
  return <div className="max-w-prose text-[15px]">{out}</div>;
}
