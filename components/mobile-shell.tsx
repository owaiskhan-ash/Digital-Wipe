"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  FileText,
  Home,
  LogIn,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { SOURCE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Home", icon: Home, match: (path: string) => path === "/" },
  { href: "/scan", label: "Scan", icon: Search, match: (path: string) => path.startsWith("/scan") },
  {
    href: "/dashboard",
    label: "Report",
    icon: FileText,
    match: (path: string) => path.startsWith("/dashboard"),
  },
] as const;

const DRAWER_SECTIONS = [
  {
    title: "Untrace",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#sources", label: "The landscape" },
      { href: "/#laws", label: "Legal rights" },
      { href: "/#questions", label: "Questions" },
    ],
  },
  {
    title: "Account & legal",
    links: [
      { href: "/privacy", label: "Privacy note" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

/**
 * The phone experience: one screen, a dock at the bottom, everything else
 * behind a drawer. Desktop keeps the header and footer it already had.
 */
export function MobileShell() {
  const pathname = usePathname() || "/";
  const { user, authLoading, signIn, signOut } = useStore();
  const [open, setOpen] = useState(false);
  // Kept mounted through the closing animation so the panel slides out
  // instead of vanishing.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), 300);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-50 max-w-[100vw] animate-dock-in overflow-x-hidden border-t border-line bg-paper"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[3.75rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[0.6875rem] font-medium tracking-wide transition-[color,transform] duration-200 active:scale-[0.94] active:text-ink",
                  active ? "text-moss-deep" : "text-muted"
                )}
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-full transition-[background-color,color,transform] duration-200",
                    active ? "bg-moss-soft text-moss-deep" : "text-muted"
                  )}
                >
                  <tab.icon className="size-[1.15rem]" strokeWidth={active ? 2.1 : 1.7} aria-hidden />
                </span>
                {tab.label}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-haspopup="dialog"
            className="flex min-h-[3.75rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[0.6875rem] font-medium tracking-wide text-muted transition-[color,transform] duration-200 active:scale-[0.94] active:text-ink"
          >
            <span className="grid size-9 place-items-center rounded-full">
              <Menu className="size-[1.15rem]" strokeWidth={1.7} aria-hidden />
            </span>
            Menu
          </button>
        </div>
      </nav>

      {mounted ? (
        <div
          className={cn("fixed inset-0 z-[60]", open ? "pointer-events-auto" : "pointer-events-none")}
        >
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={open ? 0 : -1}
            onClick={() => setOpen(false)}
            className={cn(
              "absolute inset-0 bg-ink/35 transition-opacity duration-300 ease-out",
              open ? "opacity-100" : "opacity-0"
            )}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            aria-hidden={!open}
            inert={!open}
            className={cn(
              "absolute inset-y-0 right-0 flex w-[84%] max-w-sm flex-col border-l border-line bg-paper shadow-2xl transition-transform duration-300 ease-out will-change-transform",
              open ? "translate-x-0" : "translate-x-full"
            )}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-muted">Menu</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-full border border-line text-ink-soft"
                aria-label="Close"
              >
                <X className="size-4" strokeWidth={1.8} aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-5">
              <Link
                href="/scan"
                className="btn btn-primary w-full"
                onClick={() => setOpen(false)}
              >
                Start a free scan
                <ArrowUpRight className="size-4" strokeWidth={1.8} aria-hidden />
              </Link>

              {DRAWER_SECTIONS.map((section) => (
                <div key={section.title} className="mt-7">
                  <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-muted">
                    {section.title}
                  </p>
                  <ul className="mt-2">
                    {section.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center justify-between border-b border-line/70 py-3 text-sm text-ink-soft"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="mt-7">
                <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-muted">Account</p>
                {user ? (
                  <div className="mt-3 rounded-xl border border-line bg-mist/60 p-3">
                    <p className="truncate text-xs text-muted">Signed in</p>
                    <p className="mt-1 truncate text-sm font-medium text-ink">{user.email}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        await signOut();
                        setOpen(false);
                      }}
                      className="btn btn-secondary btn-sm mt-3 w-full"
                    >
                      <LogOut className="size-4" strokeWidth={1.8} aria-hidden />
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={async () => {
                      await signIn();
                      setOpen(false);
                    }}
                    className="btn btn-secondary btn-sm mt-3 w-full"
                  >
                    <LogIn className="size-4" strokeWidth={1.8} aria-hidden />
                    Sign in with Google
                  </button>
                )}
              </div>

              <div className="mt-7 rounded-xl border border-line bg-moss-soft/50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-moss-deep">
                  <ShieldCheck className="size-3.5" strokeWidth={1.8} aria-hidden />
                  Your report is tied to your account
                </p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-ink-soft">
                  Signing in is what runs the scan. Clear the report from the
                  dashboard whenever you like.
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <a
                  href={SOURCE_URL}
                  className="inline-flex items-center gap-1 text-xs text-muted"
                  target="_blank"
                  rel="noreferrer"
                >
                  Source on GitHub
                  <ArrowUpRight className="size-3" strokeWidth={1.8} aria-hidden />
                </a>
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="text-[0.6875rem] tracking-[0.06em] text-muted/70 transition-colors hover:text-ink"
                >
                  Admin
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
