import Link from "next/link";
import { Logo } from "@/components/Logo";

export function PublicHeader({ badge }: { badge: string }) {
  return (
    <header className="h-16 border-b border-[#2a2a2a] px-4 md:px-8 flex items-center justify-between gap-2 bg-[#000000]">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <Logo className="h-6 shrink-0" />
        <Link
          href="/"
          className="font-extrabold text-sm tracking-tight text-white uppercase truncate"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Blue Beacon Research
        </Link>
        <span className="hidden md:inline text-[12px] md:text-[10px] text-[#4edea3] font-mono px-2 py-0.5 border border-[#3c4a42] bg-[#131313] shrink-0">
          {badge}
        </span>
      </div>
      <Link
        href="/dashboard"
        className="text-xs font-bold text-[#4edea3] hover:underline uppercase tracking-wider flex items-center gap-1 shrink-0 min-h-[44px] md:min-h-0"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        Terminal <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>arrow_forward</span>
      </Link>
    </header>
  );
}
