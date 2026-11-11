import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileCheck2, Scale, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SectionLabel } from "@/components/ui";
import { SITE_DOMAIN } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service governing your use of Untrace, personal data reconnaissance scans, and automated deletion request workflows.",
  alternates: { canonical: "/terms" },
};

const SECTIONS = [
  {
    title: "Acceptance of Terms",
    body: [
      `By accessing or using Untrace (${SITE_DOMAIN}), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, please do not use the service.`,
    ],
  },
  {
    title: "Authorized Use & Identity Representation",
    body: [
      "You may only use Untrace to scan for and request the removal of personal data belonging to yourself, or for individuals who have granted you explicit written authority to act as their authorized agent.",
      "You agree not to use Untrace, its directory index, or its AI Agent Swarm for stalking, harassment, doxxing, unauthorized background screening, or any unlawful purpose.",
    ],
  },
  {
    title: "Email Dispatch & User Responsibility",
    body: [
      "Untrace generates formal data deletion and opt-out notices citing applicable privacy frameworks (such as GDPR Article 17, CCPA/CPRA, and India's DPDP Act). You are solely responsible for reviewing the recipient address, subject line, and message body before sending any email.",
      "When you connect your Google account to send removal requests via Gmail, each email is dispatched directly from your account only after your explicit confirmation.",
    ],
  },
  {
    title: "No Legal Advice & Third-Party Compliance",
    body: [
      "Untrace is a software utility and privacy automation tool, not a law firm, and does not provide legal advice or legal representation.",
      "While Untrace identifies public listings and resolves Data Protection Officer (DPO) contact details, third-party data brokers are independent entities. We cannot guarantee that every third-party organization will comply with a deletion request or remove records within statutory deadlines.",
    ],
  },
  {
    title: "Disclaimer of Warranties & Limitation of Liability",
    body: [
      "Untrace is provided on an “as is” and “as available” basis without warranties of any kind, whether express or implied. To the fullest extent permitted by law, Untrace and its creators shall not be liable for any indirect, incidental, consequential, or punitive damages arising out of your use of the service.",
    ],
  },
  {
    title: "Changes to These Terms",
    body: [
      "We may update these Terms of Service from time to time to reflect product improvements or regulatory requirements. Continued use of Untrace following any updates constitutes acceptance of the revised terms.",
    ],
  },
];

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="container-page py-12 md:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.8} aria-hidden />
          Back to home
        </Link>

        <div className="mt-8 grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="lg:sticky lg:top-28">
              <SectionLabel>Terms of Service</SectionLabel>
              <h1 className="mt-4 text-[2.4rem] leading-[1.05] sm:text-[2.9rem]">
                Clear terms, plain language.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
                The rules for using Untrace to discover exposed personal listings
                and send formal removal requests.
              </p>

              <div className="mt-8 space-y-3">
                <p className="flex items-center gap-2 text-xs text-muted">
                  <ShieldCheck className="size-3.5 text-moss" strokeWidth={1.8} aria-hidden />
                  For your own records or authorized clients only
                </p>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <FileCheck2 className="size-3.5 text-moss" strokeWidth={1.8} aria-hidden />
                  You review and approve every deletion request
                </p>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Scale className="size-3.5 text-moss" strokeWidth={1.8} aria-hidden />
                  Software tool, not formal legal representation
                </p>
              </div>

              <p className="mt-10 text-xs text-muted">
                Effective date: 11 November 2026
              </p>
            </div>
          </div>

          <div className="max-w-2xl">
            {SECTIONS.map((section, index) => (
              <section
                key={section.title}
                className="border-t border-line py-8 first:border-t-0 first:pt-0"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-sm text-line-strong">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-xl text-ink">{section.title}</h2>
                </div>
                <div className="mt-3 space-y-3 pl-8">
                  {section.body.map((paragraph) => (
                    <p
                      key={paragraph.slice(0, 24)}
                      className="text-sm leading-[1.75] text-ink-soft"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            <div className="mt-6 rounded-2xl border border-line bg-surface p-6">
              <h2 className="text-lg">Privacy &amp; Data Handling</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Read our{" "}
                <Link href="/privacy" className="underline text-ink hover:text-moss">
                  Privacy Policy
                </Link>{" "}
                for full details on how we protect your data and comply with the
                Google API Services User Data Policy.
              </p>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
