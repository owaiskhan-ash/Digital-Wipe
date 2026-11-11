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
import { buildRemovalEmail } from "@/lib/removal";
import { CATEGORIES, type Category } from "@/lib/types";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
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
    title: "Enter your client's details",
    body: "Provide a name, city, and optional email, phone, or username. Add any extra context to guide the search.",
  },
  {
    icon: Layers,
    title: "Deploy the 4-Agent AI Swarm",
    body: "Four specialized AI agents search across the entire internet via Google Search to find directories, B2B brokers, and public records, plus each site's DPO email.",
  },
  {
    icon: Send,
    title: "Send removal emails in one click",
    body: "Every discovered source gets a tailored GDPR, CCPA, or DPDP deletion notice addressed to its privacy officer. Review and send straight from your Gmail.",
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
    body: "Companies get 30 to 45 days. If nothing happens, Untrace drafts the follow-up, and tells you where to escalate.",
  },
  {
    icon: Lock,
    title: "Private & synced to your account",
    body: "Your scan reports and removal queue stay private in your browser or synced securely to your authenticated account.",
  },
];

const QUESTIONS = [
  {
    q: "Am I allowed to do this?",
    a: "Yes. Privacy laws in California (CCPA), across the EU and UK (GDPR), India (DPDP Act), and dozens of other jurisdictions give individuals the right to demand deletion of their personal data and opt out of its sale.",
  },
  {
    q: "How does the AI Agent Swarm find exposures?",
    a: "When you start a scan, four specialized Gemini AI agents run live Google Search reconnaissance across the entire internet, checking global and regional people-search directories, caller-ID apps, B2B lead databases, social archives, and Data Protection Officer (DPO) registries.",
  },
  {
    q: "Does Untrace send emails automatically without my review?",
    a: "No. Every deletion email is drafted for your review first. You can dispatch it with one click via your connected Gmail account (with confirmation) or open it pre-filled in Gmail Web or your mail app.",
  },
  {
    q: "How long does a removal take?",
    a: "Most people-search sites and B2B brokers act within one to three weeks. Companies have 30 to 45 days under statutory privacy laws to respond. Untrace tracks a follow-up date for each sent request.",
  },
  {
    q: "What if a company ignores me or says no?",
    a: "First, send a follow-up restating the statutory deadline. If ignored, you can escalate to your national data protection authority (or state attorney general) and request search engine de-indexing.",
  },
];

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.svg`,
    },
    {
      "@type": "WebApplication",
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "SecurityApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      description: SITE_DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Open-web AI Agent Swarm across people-search sites, B2B brokers and archives worldwide",
        "Automatic DPO and privacy officer email resolution",
        "Generate statutory GDPR, CCPA, and DPDP deletion requests",
        "1-click Gmail dispatch and follow-up tracking",
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: QUESTIONS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

const PREVIEW_EMAIL = {
  contactEmail: "privacy-requests@spokeo.com",
  subject: "Request to delete personal data and opt out of sale (CCPA / GDPR)",
  body: `To the Privacy & Compliance Team,

I am writing to formally request the permanent deletion and suppression of all personal information concerning me held across your directory.

Details to identify and suppress:
- Full Legal Name: [Your Name]
- Location: [Your City, Region]
- Associated Email: [Your Email]

Legal Basis:
Under applicable privacy legislation (including CCPA / GDPR / DPDP), I hereby exercise my right to erasure and request that you cease selling, licensing, or publishing my personal records.

Please confirm suppression within the statutory response window.`,
};

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="container-page grid items-center gap-14 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:py-24">
            <div className="animate-fade-up">
              <SectionLabel>AI-Powered Personal Data Removal</SectionLabel>

              <h1 className="mt-5 text-[2.5rem] leading-[1.04] tracking-[-0.02em] text-ink sm:text-[3rem] lg:text-[3.5rem]">
                Hundreds of sites sell
                <span className="block">your personal data</span>
                <span className="block text-muted">to anyone who asks.</span>
              </h1>

              <p className="mt-7 max-w-xl text-[1.0625rem] leading-[1.7] text-ink-soft">
                Untrace deploys a 4-agent AI reconnaissance swarm across the open
                internet to find every directory, data broker, and archive holding
                your details, resolving their privacy emails so you can send legal
                deletion requests in one click via Gmail.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/scan" className="btn btn-primary">
                  Deploy AI Agent Swarm
                  <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
                </Link>
                <Link href="/dashboard" className="btn btn-secondary">
                  View report
                </Link>
              </div>

              <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-[0.8125rem] text-muted">
                {[
                  "Open-web Google Search AI Swarm",
                  "Resolves DPO & privacy emails",
                  "1-click Gmail removal dispatch",
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
                  <dd className="text-ink-soft">{PREVIEW_EMAIL.contactEmail}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-14 shrink-0 text-muted">Subject</dt>
                  <dd className="line-clamp-1 text-ink-soft">{PREVIEW_EMAIL.subject}</dd>
                </div>
              </dl>

              <div className="max-h-[22rem] overflow-hidden px-5 py-5 text-[0.78rem] leading-[1.75] text-ink-soft">
                <p className="whitespace-pre-line">
                  {PREVIEW_EMAIL.body}
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-line bg-mist/50 px-5 py-3.5">
                <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted">
                  <ShieldCheck className="size-3.5 text-moss" strokeWidth={1.7} aria-hidden />
                  Cites statutory privacy law · 45-day deadline
                </span>
                <span className="text-[0.6875rem] text-muted">Gmail API · Email · Track</span>
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
                  You can go around Untrace entirely. We won&apos;t mind.
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
