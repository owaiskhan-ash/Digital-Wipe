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
  return (
    // Solid on phones: a frosted header re-blurs on every scroll frame, which is
    // the difference between smooth and stuttery on a mid-range Android.
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper md:bg-paper/85 md:backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4 md:h-[4.5rem] md:gap-6">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-mist hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/privacy" className="hidden text-sm text-muted transition-colors hover:text-ink sm:block">
            Privacy
          </Link>
          <AuthButton />
          <Link href="/scan" className="btn btn-primary btn-sm hidden sm:inline-flex">
            Start a free scan
            <ArrowUpRight className="size-4" strokeWidth={1.8} aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}

