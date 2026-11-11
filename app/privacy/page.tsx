import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SectionLabel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Our privacy note",
  description:
    "A short, honest account of what Untrace does with your details: the short version is that it keeps them where they belong — with you.",
};

const SECTIONS = [
  {
    title: "What a scan does",
    body: [
      "When you press “Run the scan”, the name, city, country, email addresses, phone numbers and usernames you typed are sent to a stateless scan endpoint. That endpoint matches them against a curated directory of public data-broker opt-out pages and returns a report.",
      "The request is not written to a database, a log file or a queue. Once the response is returned, the server keeps nothing. There is no account and no analytics attached to any of it.",
    ],
  },
  {
    title: "What your browser keeps",
    body: [
      "The report and your request history are saved in this browser's local storage under the key untrace.state.v1. That is what lets you close the tab and come back to the same list.",
      "It also means the data lives on your device, not ours. “Delete” on the report page erases it, and clearing site data does the same thing. Nothing is synced, backed up or shared between browsers.",
    ],
  },
  {
    title: "What we don't do",
    body: [
      "No account, no tracking pixels, no advertising, no analytics scripts, no third-party fonts or CDNs. The fonts are self-hosted and the illustrations are served from the same origin as this page.",
      "We never send an email for you. A request leaves only when you press “Open in mail app” or paste it into a company's opt-out form — from your own mailbox.",
    ],
  },
  {
    title: "Other people who see your data",
    body: [
      "When you open an opt-out page, that company's own site receives the request — under its privacy policy, not ours. When you email a company, your mail provider and theirs carry the message.",
      "The only external links in the product go to those companies, to search engines, and to Have I Been Pwned for breach checks. None of them are loaded inside our pages unless you click.",
    ],
  },
  {
    title: "About the results",
    body: [
      "This build is a prototype. The sources, opt-out links and legal templates are real; the listings are modelled so the full flow can be used before any live data provider is connected. Treat the report as a demonstration, not a legal record.",
      "Nothing here is legal advice. If a company refuses a valid deletion request, a privacy lawyer or your data protection authority is the next step — both options are linked from your report.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="container-page py-12 md:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.8} aria-hidden />
          Back
        </Link>

        <div className="mt-8 grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="lg:sticky lg:top-28">
              <SectionLabel>Our own privacy note</SectionLabel>
              <h1 className="mt-4 text-[2.4rem] leading-[1.05] sm:text-[2.9rem]">
                Privacy, for a change.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
                A tool that asks other people to delete your data should be
                unusually careful with it. Here is exactly what happens.
              </p>

              <div className="mt-8 space-y-3">
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Lock className="size-3.5 text-moss" strokeWidth={1.8} aria-hidden />
                  No accounts, no analytics, no cookies
                </p>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <ShieldCheck className="size-3.5 text-moss" strokeWidth={1.8} aria-hidden />
                  Reports stay in your browser
                </p>
              </div>

              <p className="mt-10 text-xs text-muted">
                Last updated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>

          <div className="max-w-2xl">
            {SECTIONS.map((section, index) => (
              <section key={section.title} className="border-t border-line py-8 first:border-t-0 first:pt-0">
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-sm text-line-strong">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-xl text-ink">{section.title}</h2>
                </div>
                <div className="mt-3 space-y-3 pl-8">
                  {section.body.map((paragraph) => (
                    <p key={paragraph.slice(0, 24)} className="text-sm leading-[1.75] text-ink-soft">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            <div className="mt-6 rounded-2xl border border-line bg-surface p-6">
              <h2 className="text-lg">Questions about this note</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                This is an independent prototype, so there is no support desk —
                but every claim above can be checked in the source. The scan
                endpoint lives in{" "}
                <code className="rounded bg-mist px-1.5 py-0.5 text-[0.75rem] text-ink-soft">
                  app/api/scan/route.ts
                </code>{" "}
                and the matching model in{" "}
                <code className="rounded bg-mist px-1.5 py-0.5 text-[0.75rem] text-ink-soft">
                  lib/scan.ts
                </code>
                .
              </p>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
