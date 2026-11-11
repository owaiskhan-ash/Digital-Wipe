import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  FileCheck2,
  Layers,
  Lock,
  Mail,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CategoryIcon, SectionLabel } from "@/components/ui";
import { BROKERS } from "@/lib/brokers";
import { BREACH_COUNT } from "@/lib/breaches";
import { runScan } from "@/lib/scan";
import { SAMPLE_PROFILE } from "@/lib/sample";
import { buildRemovalEmail } from "@/lib/removal";
import { CATEGORIES, type Category } from "@/lib/types";

export const metadata: Metadata = {
  title: "Untrace — find and remove your personal data online",
};

const CATEGORY_ORDER: Category[] = [
  "people-search",
  "marketing",
  "adtech",
  "breach",
  "public-records",
  "search",
];

const TICKER = [
  "Spokeo",
  "Whitepages",
  "BeenVerified",
  "Radaris",
  "Acxiom",
  "ZoomInfo",
  "LexisNexis",
  "MyLife",
  "Oracle",
  "FastPeopleSearch",
  "LiveRamp",
  "PeekYou",
];

const STEPS = [
  {
    icon: Search,
    title: "Tell us three things",
    body: "Your name, the city you live in, and an email address. Add a phone number or a username if you want a deeper scan.",
  },
  {
    icon: Layers,
    title: "See your exposure",
    body: "We check 45 directories, databases and archives — and group what we find by how sensitive it is.",
  },
  {
    icon: Send,
    title: "Ask each owner to delete it",
    body: "Every listing gets a deletion request written for that company, citing the law in your country. You review, send, and track the reply.",
  },
];

const PROMISES = [
  {
    icon: FileCheck2,
    title: "Written, not shouted",
    body: "Each email cites the specific law, the fields you want gone, and a deadline. That's what gets answers.",
  },
  {
    icon: Clock3,
    title: "Followed up",
    body: "Companies get 30–45 days. If nothing happens, Untrace drafts the follow-up — and tells you where to escalate.",
  },
  {
    icon: Lock,
    title: "Held in your browser",
    body: "Your report and request history live in this browser's storage. There is no account and no server copy.",
  },
];

const QUESTIONS = [
  {
    q: "Am I allowed to do this?",
    a: "Yes. Privacy laws in California, across the EU and UK, and in a growing number of US states give you the right to demand deletion of your personal data and to opt out of its sale. Most data brokers also run an opt-out page of their own because the law requires it. Untrace just does the tedious part.",
  },
  {
    q: "Does Untrace send emails on my behalf?",
    a: "No. You review every message and send it from your own mailbox — either with the one-click email link or by pasting it into the company's opt-out form. Nothing leaves your computer unless you press send.",
  },
  {
    q: "How long does a removal take?",
    a: "Most people-search sites act within one to three weeks. Companies have 45 days under California law and one month under GDPR to answer. Untrace keeps a follow-up date for each request so nothing quietly expires.",
  },
  {
    q: "What if a company ignores me or says no?",
    a: "Two moves. First, send the follow-up — it restates the request and names a deadline. If that's ignored too, you can complain to your data protection authority (or state attorney general) and ask Google to de-index the page. Both paths are one click from your report.",
  },
  {
    q: "Why do listings come back after removal?",
    a: "Brokers re-scrape public records and licensed data on a schedule, so a removed profile can reappear months later. Rescan every quarter and treat suppression as maintenance, not a one-time fix.",
  },
  {
    q: "Where do the results come from?",
    a: "This build ships with a curated directory of 45 real public directories and their official opt-out pages. Scan results are illustrative — a modelled view of what a live scan returns. Removal links, legal templates and the request tracker are fully functional.",
  },
];

const sampleFinding = runScan(SAMPLE_PROFILE);
const sampleRequest = (() => {
  const finding = sampleFinding.findings.find((item) => item.contactEmail) ?? sampleFinding.findings[0];
  const email = buildRemovalEmail({ profile: SAMPLE_PROFILE, finding });
  return { finding, email };
})();

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="container-page grid items-center gap-14 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:py-24">
            <div className="animate-fade-up">
              <SectionLabel>Personal data removal</SectionLabel>

              <h1 className="mt-5 text-[2.75rem] leading-[1.03] tracking-[-0.02em] text-ink sm:text-[3.5rem] lg:text-[4rem]">
                Every place the internet keeps your data.
                <span className="block text-muted">In one calm list.</span>
              </h1>

              <p className="mt-7 max-w-xl text-[1.0625rem] leading-[1.7] text-ink-soft">
                Untrace checks the people-search sites, marketing databases and
                advertising profiles that hold your name, address and phone
                number — then writes a deletion request to each owner, ready for
                you to send.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/scan" className="btn btn-primary">
                  Start a free scan
                  <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
                </Link>
                <Link href="/dashboard?sample=1" className="btn btn-secondary">
                  See an example report
                </Link>
              </div>

              <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-[0.8125rem] text-muted">
                {[
                  `${BROKERS.length} sources checked`,
                  "No account needed",
                  "Nothing sent without you",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Check className="size-3.5 text-moss" strokeWidth={2.2} aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="animate-fade-in lg:pl-4">
              <figure className="overflow-hidden rounded-[1.5rem] border border-line bg-surface">
                <Image
                  src="/hero.png"
                  alt="A person gathers floating cards of personal data into a folder as the furthest cards dissolve into dots."
                  width={1456}
                  height={720}
                  priority
                  className="h-auto w-full"
                  sizes="(max-width: 1024px) 100vw, 620px"
                />
                <figcaption className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
                  <span className="text-xs text-muted">
                    A trace is a record someone else kept.
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                    <span className="size-1.5 rounded-full bg-moss" aria-hidden />
                    Gather it, then let it go
                  </span>
                </figcaption>
              </figure>
            </div>
          </div>

          {/* Quiet source ticker */}
          <div className="border-y border-line bg-surface/60">
            <div className="container-page flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
              <span className="shrink-0 text-[0.6875rem] uppercase tracking-[0.18em] text-muted">
                Checked
              </span>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {TICKER.map((name) => (
                  <span
                    key={name}
                    className="shrink-0 text-[0.8125rem] text-ink-soft/80"
                  >
                    {name}
                  </span>
                ))}
              </div>
              <span className="ml-auto hidden shrink-0 text-[0.8125rem] text-muted sm:block">
                and {BROKERS.length - TICKER.length} more
              </span>
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <section id="how" className="scroll-mt-24 py-20 md:py-28">
          <div className="container-page">
            <div className="max-w-2xl">
              <SectionLabel>How it works</SectionLabel>
              <h2 className="mt-4 text-[2.1rem] leading-tight sm:text-[2.6rem]">
                Three quiet steps, then the internet forgets a little.
              </h2>
            </div>

            <ol className="mt-12 grid gap-5 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="card group flex flex-col p-7 transition-colors duration-300 hover:border-line-strong"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-xl border border-line bg-mist text-moss">
                      <step.icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
                    </span>
                    <span className="font-display text-2xl text-line-strong">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-6 text-xl text-ink">{step.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── What we find ─────────────────────────────────────────────── */}
        <section id="sources" className="scroll-mt-24 border-y border-line bg-surface/60 py-20 md:py-28">
          <div className="container-page">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <SectionLabel>What we find</SectionLabel>
                <h2 className="mt-4 text-[2.1rem] leading-tight sm:text-[2.6rem]">
                  Six kinds of footprint. Different owners, different rules.
                </h2>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-muted">
                Each category needs a different request, a different legal route
                and a different amount of patience.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CATEGORY_ORDER.map((category) => {
                const meta = CATEGORIES[category];
                const count =
                  category === "breach"
                    ? BREACH_COUNT
                    : BROKERS.filter((broker) => broker.category === category).length;
                return (
                  <article
                    key={category}
                    className="card flex flex-col p-6 transition-colors duration-300 hover:border-line-strong"
                  >
                    <span className="grid size-9 place-items-center rounded-lg border border-line bg-mist text-ink-soft">
                      <CategoryIcon category={category} className="size-4" />
                    </span>
                    <h3 className="mt-5 text-lg text-ink">{meta.label}</h3>
                    <p className="mt-2 flex-1 text-[0.8125rem] leading-relaxed text-muted">
                      {meta.blurb}
                    </p>
                    <p className="mt-5 text-[0.6875rem] uppercase tracking-[0.14em] text-muted">
                      {count} sources
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── The request itself ──────────────────────────────────────── */}
        <section className="py-20 md:py-28">
          <div className="container-page grid items-center gap-14 lg:grid-cols-[0.92fr_1.08fr]">
            <div>
              <SectionLabel>The removal request</SectionLabel>
              <h2 className="mt-4 text-[2.1rem] leading-tight sm:text-[2.6rem]">
                The email is the hard part. It&apos;s already written.
              </h2>
              <p className="mt-5 max-w-lg text-[0.9375rem] leading-relaxed text-ink-soft">
                A vague &ldquo;please delete my data&rdquo; note gets ignored.
                Untrace writes the version that works: named fields, the right
                statute for your country, a firm deadline and an escalation path.
              </p>

              <ul className="mt-9 space-y-5">
                {PROMISES.map((item) => (
                  <li key={item.title} className="flex gap-3.5">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-mist text-moss">
                      <item.icon className="size-4" strokeWidth={1.6} aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink">{item.title}</p>
                      <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">
                        {item.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <span className="flex items-center gap-2 text-xs text-muted">
                  <Mail className="size-3.5" strokeWidth={1.7} aria-hidden />
                  New request
                </span>
                <span className="chip py-1 text-[0.6875rem]">Editable before sending</span>
              </div>

              <dl className="space-y-1.5 border-b border-line px-5 py-4 text-[0.75rem]">
                <div className="flex gap-2">
                  <dt className="w-14 shrink-0 text-muted">To</dt>
                  <dd className="text-ink-soft">{sampleRequest.finding.contactEmail}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-14 shrink-0 text-muted">Subject</dt>
                  <dd className="line-clamp-1 text-ink-soft">{sampleRequest.email.subject}</dd>
                </div>
              </dl>

              <div className="max-h-[22rem] overflow-hidden px-5 py-5 text-[0.78rem] leading-[1.75] text-ink-soft">
                <p className="whitespace-pre-line">
                  {sampleRequest.email.body.split("\n").slice(0, 16).join("\n")}
                </p>
                <p className="mt-3 text-muted">…</p>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-line bg-mist/50 px-5 py-3.5">
                <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted">
                  <ShieldCheck className="size-3.5 text-moss" strokeWidth={1.7} aria-hidden />
                  Cites {SAMPLE_PROFILE.country} law · 45-day deadline
                </span>
                <span className="text-[0.6875rem] text-muted">Copy · Email · Track</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Coverage ────────────────────────────────────────────────── */}
        <section
          id="coverage"
          className="scroll-mt-24 border-y border-line bg-surface/60 py-20 md:py-28"
        >
          <div className="container-page">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <SectionLabel>Coverage</SectionLabel>
                <h2 className="mt-4 text-[2.1rem] leading-tight sm:text-[2.6rem]">
                  {BROKERS.length} sources on the first pass.
                </h2>
                <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-ink-soft">
                  Every name below links to that company&apos;s own opt-out page.
                  You can go around Untrace entirely — we won&apos;t mind.
                </p>
              </div>
              <Link href="/scan" className="btn btn-secondary btn-sm self-start md:self-auto">
                Check your name
                <ArrowUpRight className="size-4" strokeWidth={1.8} aria-hidden />
              </Link>
            </div>

            <ul className="mt-12 grid grid-cols-1 gap-x-8 gap-y-0 sm:grid-cols-2 lg:grid-cols-3">
              {BROKERS.map((broker) => (
                <li key={broker.id}>
                  <a
                    href={broker.removalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between gap-3 border-b border-line py-3 transition-colors hover:border-line-strong"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="size-1.5 shrink-0 rounded-full bg-line-strong transition-colors group-hover:bg-moss" aria-hidden />
                      <span className="truncate text-sm text-ink-soft transition-colors group-hover:text-ink">
                        {broker.name}
                      </span>
                    </span>
                    <ArrowUpRight
                      className="size-3.5 shrink-0 text-line-strong transition-colors group-hover:text-moss"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                  </a>
                </li>
              ))}
            </ul>

            <p className="mt-8 max-w-2xl text-xs leading-relaxed text-muted">
              Opt-out pages change address now and then. Every link opens the
              company&apos;s current privacy or suppression page, and your report
              always shows the destination before you send anything.
            </p>
          </div>
        </section>

        {/* ── Questions ───────────────────────────────────────────────── */}
        <section id="questions" className="scroll-mt-24 py-20 md:py-28">
          <div className="container-page grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <SectionLabel>Questions</SectionLabel>
              <h2 className="mt-4 text-[2.1rem] leading-tight sm:text-[2.4rem]">
                The things people ask before they start.
              </h2>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
                Still unsure? Read our own{" "}
                <Link href="/privacy" className="text-moss underline decoration-moss/30 underline-offset-4 hover:decoration-moss">
                  privacy note
                </Link>
                .
              </p>
            </div>

            <div className="border-t border-line">
              {QUESTIONS.map((item) => (
                <details key={item.q} className="group border-b border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[0.9375rem] font-medium text-ink [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown
                      className="size-4 shrink-0 text-muted transition-transform duration-300 group-open:rotate-180"
                      strokeWidth={1.8}
                      aria-hidden
                    />
                  </summary>
                  <p className="max-w-2xl pb-6 pr-8 text-sm leading-relaxed text-muted">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing ─────────────────────────────────────────────────── */}
        <section className="pb-4">
          <div className="container-page">
            <div className="card flex flex-col items-center gap-6 px-6 py-16 text-center md:py-20">
              <span className="grid size-11 place-items-center rounded-xl border border-line bg-moss-soft text-moss">
                <ShieldCheck className="size-5" strokeWidth={1.6} aria-hidden />
              </span>
              <h2 className="max-w-xl text-[2.1rem] leading-tight sm:text-[2.8rem]">
                Start with your own name.
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-muted">
                A scan takes a few seconds. Knowing exactly who holds your data
                is the part almost nobody has done.
              </p>
              <Link href="/scan" className="btn btn-primary mt-1">
                Start a free scan
                <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
              </Link>
              <p className="text-xs text-muted">
                No account. Nothing sent without your review.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
