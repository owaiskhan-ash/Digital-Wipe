import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
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
  "public-records",
  "search",
];

const TICKER = [
  "Caller-ID Apps",
  "Agency Portfolios",
  "Contact Footers",
  "People Directories",
  "B2B Lead Lists",
  "Public Registries",
  "Case Studies",
  "Blog Mentions",
];

const EXPOSURE = [
  {
    icon: Search,
    title: "A number, reverse-looked",
    body: "Caller-ID apps and lookup sites tie a phone number to a name, a city and sometimes a photo. The spam calls are only the part you can hear.",
  },
  {
    icon: Layers,
    title: "An email, indexed",
    body: "Business databases file addresses by name, role and employer, then resell the index to recruiters, insurers and anyone with a scraper.",
  },
  {
    icon: FileCheck2,
    title: "A profile, sold",
    body: "People-search directories rebuild you from public records and sell lookups. Some also sell a paid removal, which is the same business twice.",
  },
];

const STEPS = [
  {
    icon: Search,
    title: "Start with one identifier",
    body: "A phone number or an email address is enough. A name is optional and only used to sign the letters.",
  },
  {
    icon: Layers,
    title: "Search the open web",
    body: "A grounded AI search reads the pages that mention your identifier: directories, contact footers, case studies, agency sites and blogs. Each page is opened to confirm it publishes your details, and the contact address is pulled from the site.",
  },
  {
    icon: Mail,
    title: "Write to each owner",
    body: "Every request names the fields to delete, the statute for your country, a deadline and the regulator to escalate to.",
  },
  {
    icon: Send,
    title: "Send and keep the clock",
    body: "Send through your own Gmail, copy the text, or open it in your mail app. Each request gets a status and a follow-up date.",
  },
];

const PROMISES = [
  {
    icon: FileCheck2,
    title: "Written, not shouted",
    body: "A polite demand that cites the specific law, the fields you want gone and a deadline gets answered. An angry note does not.",
  },
  {
    icon: Clock3,
    title: "Followed up, not forgotten",
    body: "Most directories act in one to three weeks. Statutory limits run to 30 or 45 days. Untrace drafts the reminder and names where to escalate.",
  },
  {
    icon: Lock,
    title: "Yours, and only yours",
    body: "The report stays in your browser. Sign in with Google only if you want it synced across devices and ready to send from Gmail.",
  },
];

const LAWS = [
  {
    country: "United States",
    law: "CCPA, as amended by the CPRA",
    deadline: "45 days",
    escalation: "California Privacy Protection Agency or your state attorney general",
  },
  {
    country: "United Kingdom",
    law: "UK GDPR, Article 17, and the Data Protection Act 2018",
    deadline: "One month",
    escalation: "Information Commissioner's Office",
  },
  {
    country: "European Union",
    law: "GDPR, Article 17, right to erasure",
    deadline: "One month",
    escalation: "Your national supervisory authority",
  },
  {
    country: "India",
    law: "Digital Personal Data Protection Act 2023, sections 12 and 13",
    deadline: "30 days",
    escalation: "Data Protection Board of India",
  },
  {
    country: "Canada",
    law: "PIPEDA, Principle 4.9 and section 8(8)",
    deadline: "30 days",
    escalation: "Office of the Privacy Commissioner",
  },
  {
    country: "Australia",
    law: "Privacy Act 1988, Australian Privacy Principles 11 and 13",
    deadline: "30 days",
    escalation: "Office of the Australian Information Commissioner",
  },
];

const QUESTIONS = [
  {
    q: "How do I remove my phone number from the internet?",
    a: "Three things have to happen. The caller-ID apps and reverse-lookup sites have to unlist the number, the directories that cached it have to remove the page, and any lead database that resold it has to suppress the record. Untrace finds those pages for a number or an email address, then writes one deletion request per owner, with the contact address already resolved.",
  },
  {
    q: "Is it legal to demand that my data be deleted?",
    a: "Yes. Privacy law in California, across the EU and UK, in India, Canada and Australia gives you the right to demand deletion of your personal data and to object to its sale. Most brokers run an opt-out page precisely because the law requires one. Untrace does the tedious part: finding them, naming the right statute and keeping the clock.",
  },
  {
    q: "How does the AI search find my listings?",
    a: "The scan runs a live grounded web search for the exact phone number or email address you enter, reading the pages that mention it: directories, agency sites, contact footers, case studies, blogs and B2B indexes. Each result is checked against the contact address published on that site.",
  },
  {
    q: "Does Untrace send emails without my review?",
    a: "Never. Each message is drafted for you first. You can send it through your connected Gmail with one click, copy it into your own client, or open it pre-filled in your mail app. Nothing leaves your device until you press send.",
  },
  {
    q: "How long does a removal take?",
    a: "Most people-search sites act within one to three weeks. The statutory maximum is 30 days in India, Canada and Australia, one month under GDPR and the UK GDPR, and 45 days under the CCPA. Untrace tracks a follow-up date for every request so nothing quietly expires.",
  },
  {
    q: "What if a company ignores the request?",
    a: "Send the follow-up first. It restates the demand and the statutory deadline. If the deadline passes with no answer, the request already names the regulator for your country, so escalating is a letter you have the address for rather than a search you have to start.",
  },
  {
    q: "Do I need an account?",
    a: "No. A scan runs without signing in and the report is kept in your browser. Signing in with Google is optional: it syncs your report to a private record only you can read and unlocks one-click sending through the Gmail API, which requests the send-only scope.",
  },
  {
    q: "What does it cost?",
    a: "Nothing to scan, and no card is requested. You keep the report, the letters and the tracker whether or not you ever connect an account.",
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
      logo: `${SITE_URL}/brand/logo.png`,
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "SecurityApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      description: SITE_DESCRIPTION,
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: [
        "Phone number and email address exposure scan across the open web",
        "Automated extraction of website owner and privacy contact emails",
        "Statutory deletion requests for CCPA, GDPR, UK GDPR, DPDP, PIPEDA and the Australian Privacy Act",
        "One-click sending through the connected Gmail account",
        "Request tracking with follow-up reminders and CSV export",
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
  contactEmail: "privacy@directory-site.org",
  subject: "Erasure request under Article 17 GDPR (phone number and listing URL)",
  body: `To the Privacy Team,

I am the data subject identified below. I am writing to exercise my right to erasure under Article 17(1) of the GDPR, and my right to object to processing under Article 21.

Records to erase:
- Full name: [Your name]
- Phone number: [Your number]
- Listing URL: [The profile found by the scan]

Please delete the listing, stop publishing it, and confirm in writing within one month, as Article 12(3) requires. If you sell or share this record with third parties, tell me who received it so I can write to them as well.

If I do not hear from you by [date], I will complain to my national supervisory authority.`,
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
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* A wash of paper and sage with the ghost of a sweep in it: the
              background is felt, not read, so the type keeps the page. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <Image
              src="/hero-texture.jpg"
              alt=""
              fill
              sizes="100vw"
              className="object-cover object-[76%_16%] opacity-75 sm:opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-paper via-paper/60 to-paper/0" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-paper to-paper/0" />
          </div>

          <div data-reveal className="container-page relative grid items-center gap-14 py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:py-24">
            <div className="animate-fade-blur">
              <SectionLabel>AI-powered personal data removal</SectionLabel>

              <h1 className="mt-5 text-[2.5rem] leading-[1.04] tracking-[-0.02em] text-ink sm:text-[3rem] lg:text-[3.5rem]">
                Hundreds of sites sell
                <span className="block">your personal data</span>
                <span className="block text-muted">to anyone who asks.</span>
              </h1>

              <p className="mt-7 max-w-xl text-[1.0625rem] leading-[1.7] text-ink-soft">
                Start with the phone number or email address that keeps turning
                up. Untrace searches the open web, shows every page that carries
                your details, and writes the deletion letter to each owner in the
                law that applies to you.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/scan" className="btn btn-primary">
                  Run a free scan
                  <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
                </Link>
                <Link href="#how" className="btn btn-secondary">
                  See how it works
                </Link>
              </div>

              <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-[0.8125rem] text-muted">
                {[
                  "Phone Number Scan & Email Scan",
                  "Live open-web discovery",
                  "Send from your own Gmail",
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

          {/* Source strip */}
          <div className="border-y border-line bg-surface/60">
            <div className="container-page flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
              <span className="shrink-0 text-[0.6875rem] uppercase tracking-[0.18em] text-muted">
                Checked
              </span>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {TICKER.map((name) => (
                  <span key={name} className="shrink-0 text-[0.8125rem] text-ink-soft/80">
                    {name}
                  </span>
                ))}
              </div>
              <span className="ml-auto hidden shrink-0 text-[0.8125rem] text-muted sm:block">
                across the entire open web
              </span>
            </div>
          </div>
        </section>

        {/* The exposure */}
        <section className="py-20 md:py-28">
          <div data-reveal className="container-page">
            <div className="max-w-2xl">
              <SectionLabel>The exposure</SectionLabel>
              <h2 className="mt-4 text-[2.1rem] leading-tight sm:text-[2.6rem]">
                One identifier is enough to find you.
              </h2>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
                Reverse-lookup sites, caller-ID apps, agency footers and lead
                databases all key off the same two things: a phone number and an
                email address. None of them asked you first.
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {EXPOSURE.map((item) => (
                <article
                  key={item.title}
                  className="card flex flex-col p-7 transition-colors duration-300 hover:border-line-strong"
                >
                  <span className="grid size-10 place-items-center rounded-xl border border-line bg-mist text-moss">
                    <item.icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
                  </span>
                  <h3 className="mt-6 text-xl text-ink">{item.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-24 border-y border-line bg-surface/60 py-20 md:py-28">
          <div data-reveal className="container-page">
            <div className="max-w-2xl">
              <SectionLabel>How it works</SectionLabel>
              <h2 className="mt-4 text-[2.1rem] leading-tight sm:text-[2.6rem]">
                Four steps, and only the first one is yours.
              </h2>
            </div>

            <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
                  <h3 className="mt-6 text-lg text-ink">{step.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* What we find */}
        <section id="sources" className="scroll-mt-24 py-20 md:py-28">
          <div data-reveal className="container-page">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <SectionLabel>The landscape</SectionLabel>
                <h2 className="mt-4 text-[2.1rem] leading-tight sm:text-[2.6rem]">
                  Five kinds of footprint. Different owners, different rules.
                </h2>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-muted">
                Each category needs a different request, a different legal route
                and a different amount of patience. The scan finds the pages that
                publish you, then writes to whoever owns each page.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CATEGORY_ORDER.map((category) => {
                const meta = CATEGORIES[category];
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
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* The request */}
        <section className="border-y border-line bg-surface/60 py-20 md:py-28">
          <div data-reveal className="container-page grid items-center gap-14 lg:grid-cols-[0.92fr_1.08fr]">
            <div>
              <SectionLabel>The deletion request</SectionLabel>
              <h2 className="mt-4 text-[2.1rem] leading-tight sm:text-[2.6rem]">
                The letter is the hard part. It is already written.
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
                <p className="whitespace-pre-line">{PREVIEW_EMAIL.body}</p>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-line bg-mist/50 px-5 py-3.5">
                <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted">
                  <ShieldCheck className="size-3.5 text-moss" strokeWidth={1.7} aria-hidden />
                  Names the statute · Sets a deadline
                </span>
                <span className="text-[0.6875rem] text-muted">Gmail · Copy · Mail app</span>
              </div>
            </div>
          </div>
        </section>

        {/* Laws */}
        <section id="laws" className="scroll-mt-24 py-20 md:py-28">
          <div data-reveal className="container-page">
            <div className="max-w-2xl">
              <SectionLabel>The legal footing</SectionLabel>
              <h2 className="mt-4 text-[2.1rem] leading-tight sm:text-[2.6rem]">
                The right law, cited by name.
              </h2>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
                Deletion is a statutory right in more places than most people
                realise. The letter adapts to your country and names the authority
                you can escalate to if the deadline passes.
              </p>
            </div>

            {/* Phones: the same rows as cards. A table this wide can only be
                read by dragging it sideways, and half of it hangs off the edge. */}
            <div className="mt-10 grid gap-3 md:hidden">
              {LAWS.map((row) => (
                <div key={row.country} data-reveal className="card min-w-0 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-medium text-ink">{row.country}</p>
                    <span className="shrink-0 rounded-full border border-line bg-mist px-2.5 py-1 text-[0.6875rem] font-medium text-ink-soft">
                      {row.deadline}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-ink-soft">{row.law}</p>
                  <p className="mt-2.5 text-xs leading-relaxed text-muted">
                    <span className="text-[0.625rem] uppercase tracking-[0.12em] text-muted">
                      If ignored
                    </span>{" "}
                    · {row.escalation}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-10 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line-strong text-[0.6875rem] uppercase tracking-[0.14em] text-muted">
                    <th scope="col" className="py-3 pr-6 font-medium">Country</th>
                    <th scope="col" className="py-3 pr-6 font-medium">Law cited</th>
                    <th scope="col" className="py-3 pr-6 font-medium">Answer due</th>
                    <th scope="col" className="py-3 font-medium">If ignored</th>
                  </tr>
                </thead>
                <tbody>
                  {LAWS.map((row) => (
                    <tr key={row.country} className="border-b border-line">
                      <th scope="row" className="py-4 pr-6 font-medium text-ink">
                        {row.country}
                      </th>
                      <td className="py-4 pr-6 text-ink-soft">{row.law}</td>
                      <td className="py-4 pr-6 text-ink-soft">{row.deadline}</td>
                      <td className="py-4 text-muted">{row.escalation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-muted">
              Those are statutory maximums, not typical waits. People-search
              directories usually act within one to three weeks.
            </p>
          </div>
        </section>

        {/* Where your data lives */}
        <section className="py-20 md:py-28">
          <div data-reveal className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <SectionLabel>Your data</SectionLabel>
              <h2 className="mt-4 text-[2.1rem] leading-tight sm:text-[2.4rem]">
                The report is yours. So is the choice.
              </h2>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
                Untrace runs without an account, and works the same way if you
                never create one. Read the{" "}
                <Link href="/privacy" className="text-moss underline decoration-moss/30 underline-offset-4 hover:decoration-moss">
                  privacy note
                </Link>{" "}
                for the full version.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div data-reveal className="card p-6">
                <span className="grid size-9 place-items-center rounded-lg border border-line bg-mist text-ink-soft">
                  <Lock className="size-4" strokeWidth={1.7} aria-hidden />
                </span>
                <h3 className="mt-5 text-lg text-ink">In your browser</h3>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
                  The default. Your report and request history sit in local
                  storage, on this device, with no server copy and no account.
                </p>
              </div>

              <div data-reveal className="card p-6">
                <span className="grid size-9 place-items-center rounded-lg border border-line bg-mist text-ink-soft">
                  <ShieldCheck className="size-4" strokeWidth={1.7} aria-hidden />
                </span>
                <h3 className="mt-5 text-lg text-ink">With a Google account</h3>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
                  Optional. Signing in syncs the report to a private record only
                  you can read and unlocks one-click sending through Gmail, with
                  the send-only scope.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Questions */}
        <section id="questions" className="scroll-mt-24 border-y border-line bg-surface/60 py-20 md:py-28">
          <div data-reveal className="container-page grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <SectionLabel>Questions</SectionLabel>
              <h2 className="mt-4 text-[2.1rem] leading-tight sm:text-[2.4rem]">
                The things people ask before they start.
              </h2>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
                Anything else? Write to the address in the{" "}
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

        {/* Closing */}
        <section className="pb-4 pt-20 md:pt-28">
          <div className="container-page">
            <div className="card flex flex-col items-center gap-6 px-6 py-16 text-center md:py-20">
              <span className="grid size-11 place-items-center rounded-xl border border-line bg-moss-soft text-moss">
                <ShieldCheck className="size-5" strokeWidth={1.6} aria-hidden />
              </span>
              <h2 className="max-w-xl text-[2.1rem] leading-tight sm:text-[2.8rem]">
                Start with the number that keeps ringing.
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-muted">
                A scan takes a few seconds. Knowing exactly who holds your data
                is the part almost nobody has done.
              </p>
              <Link href="/scan" className="btn btn-primary mt-1">
                Run a free scan
                <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden />
              </Link>
              <p className="text-xs text-muted">
                Free. No card. Nothing sent without your review.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
