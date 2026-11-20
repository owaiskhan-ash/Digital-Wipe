"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "./logo";
import { AuthButton } from "./auth-button";

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#sources", label: "The landscape" },
  { href: "/#laws", label: "Legal rights" },
  { href: "/#questions", label: "Questions" },
];

export function SiteHeader() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const update = () => setCompact(window.scrollY > 36);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={`site-header sticky top-0 z-40 border-b transition-all duration-300 ${compact ? "is-compact border-line bg-paper/95 shadow-[0_8px_30px_rgba(28,30,26,0.06)] backdrop-blur-xl" : "border-line/80 bg-paper md:bg-paper/85 md:backdrop-blur-md"}`}>
      <div className={`container-page flex items-center justify-between gap-4 transition-[height] duration-300 md:gap-6 ${compact ? "h-14 md:h-16" : "h-16 md:h-[4.5rem]"}`}>
        <Logo />

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 lg:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-full px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-mist hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/privacy" className="hidden text-sm text-muted transition-colors hover:text-ink xl:block">Privacy</Link>
          <AuthButton />
          <Link href="/scan" className="btn btn-primary btn-sm hidden sm:inline-flex">
            Start a free scan
            <ArrowUpRight className="cta-arrow size-4" strokeWidth={1.8} aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
