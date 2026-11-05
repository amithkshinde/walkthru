import Link from "next/link";

export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
      <span
        aria-hidden
        className="grid h-6 w-6 place-items-center rounded-full border-2 border-brand"
      >
        <span className="rec-dot h-2 w-2 rounded-full bg-record" />
      </span>
      Walkthru
    </Link>
  );
}
