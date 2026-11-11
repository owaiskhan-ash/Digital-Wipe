import Link from "next/link";
import { Logo } from "./logo";
import { SITE_DOMAIN, SITE_URL, SOURCE_URL } from "@/lib/site";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/scan", label: "Start a scan" },
      { href: "/dashboard", label: "Your report" },
      { href: "/dashboard?tab=swarm", label: "AI Agent Swarm" },
      { href: "/dashboard?tab=requests", label: "Removal requests" },
    ],
  },
  {
    title: "Learn & Legal",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#coverage", label: "Covered sources" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-paper">
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr]">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Find the places that hold your personal data, then ask each one to
              delete it, in writing, with the right legal wording.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                {column.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-soft transition-colors hover:text-moss"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-line pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-muted">
            Untrace helps you locate exposed personal listings across public data
            brokers and send formal deletion notices. Removal links open each
            company&apos;s own opt-out page; emails are drafted for you to review
            and approve before anything is sent.
          </p>
          <div className="mt-5 flex flex-col gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Untrace. Made for people, not profiles.</p>
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.75rem]">
              <Link href="/privacy" className="transition-colors hover:text-ink">
                Privacy Policy
              </Link>
              <span aria-hidden>·</span>
              <Link href="/terms" className="transition-colors hover:text-ink">
                Terms of Service
              </Link>
              <span aria-hidden>·</span>
              <a href={SITE_URL} className="transition-colors hover:text-ink">
                {SITE_DOMAIN}
              </a>
              <span aria-hidden>·</span>
              <a
                href={`${SOURCE_URL}/blob/main/LICENSE`}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-ink"
              >
                Source, AGPL-3.0
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
