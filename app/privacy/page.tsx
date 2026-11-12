import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock, MailCheck, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SectionLabel } from "@/components/ui";
import { SITE_DOMAIN } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Untrace handles your personal information, Google account authentication, Gmail API permissions, and cloud synchronization.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS = [
  {
    title: "Overview & Scope",
    body: [
      `This Privacy Policy explains how Untrace (${SITE_DOMAIN}) collects, processes, stores, and protects information when you run a personal data exposure scan, review the pages it returns, or send deletion requests.`,
      "Untrace is designed around strict data minimisation: you remain in full control of the personal details you search for and the removal notices you choose to send.",
    ],
  },
  {
    title: "Information You Provide During a Scan",
    body: [
      "When you run a scan, you may provide your full name, city, state/region, country, email addresses, phone numbers, and public usernames. These inputs are used solely to run a live open-web search for pages that publish them, to open those pages and confirm the details appear there, and to resolve the contact address of the site that owns each page.",
      "A scan requires a Google account, because the scan is the service's only costly action and it is run on your behalf rather than on demand for any visitor. Your scan report and drafted requests are held in your browser's localStorage (under untrace.state.v1) first, and can be cleared at any time with a single click.",
    ],
  },
  {
    title: "Google Sign-In & Cloud Backup (Firebase)",
    body: [
      "Signing in with Google is how a scan starts. Through Firebase Authentication we receive your basic Google profile identifiers (name, email address, and profile avatar URL) and a stable account identifier; we never receive your Google password.",
      "When signed in, your scan reports and removal request tracker are stored in Google Cloud Firestore under your authenticated user ID, protected by strict security rules so that only you can view, update, or delete your records.",
    ],
  },
  {
    title: "Google Workspace & Gmail API Limited Use Disclosure",
    body: [
      "Untrace optionally integrates with the Gmail API (scope: https://www.googleapis.com/auth/gmail.send) solely to allow you to send formal personal data deletion and opt-out emails (under GDPR, CCPA, DPDP, and similar privacy statutes) directly from your own email address to the company that publishes the listing.",
      "Untrace never reads your inbox, never accesses your existing emails or contacts, and never sends an email without your explicit confirmation on each message. OAuth access tokens for Gmail are held strictly in volatile browser memory during your active session and are never persisted to a database or shared with third parties.",
      "Untrace's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
    ],
  },
  {
    title: "Open-web search & third-party sites",
    body: [
      "When you run a scan, our server-side endpoint queries Google Search for publicly indexed pages that publish the number or address you entered, opens those pages to confirm the details appear, and reads the contact address the site publishes. We do not sell, rent or monetise your personal information or search queries.",
      "When you click an external opt-out portal link or dispatch a removal email to a third-party data broker, that company receives your deletion request directly under their respective privacy policy and statutory obligations.",
    ],
  },
  {
    title: "Data Retention & Deletion Rights",
    body: [
      "You can delete your scan data and removal request history at any time using the “Clear” button on your dashboard. You may also revoke Untrace's Google OAuth permissions at any time from your Google Account Security Settings (myaccount.google.com/permissions).",
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
          Back to home
        </Link>

        <div className="mt-8 grid gap-14 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="lg:sticky lg:top-28">
              <SectionLabel>Privacy Policy</SectionLabel>
              <h1 className="mt-4 text-[2.4rem] leading-[1.05] sm:text-[2.9rem]">
                Privacy, for a change.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
                A tool that asks other companies to delete your personal data
                should be unusually careful with it. Here is exactly how Untrace
                works.
              </p>

              <div className="mt-8 space-y-3">
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Lock className="size-3.5 text-moss" strokeWidth={1.8} aria-hidden />
                  No ad trackers, no data resale, no inbox reading
                </p>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <ShieldCheck className="size-3.5 text-moss" strokeWidth={1.8} aria-hidden />
                  Private per-user Firestore isolation when signed in
                </p>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <MailCheck className="size-3.5 text-moss" strokeWidth={1.8} aria-hidden />
                  Send-only Gmail permission with explicit confirmation
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
              <h2 className="text-lg">Contact &amp; Legal Terms</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                For questions regarding this Privacy Policy or our data practices,
                please review our{" "}
                <Link href="/terms" className="underline text-ink hover:text-moss">
                  Terms of Service
                </Link>{" "}
                or reach out via{" "}
                <span className="font-medium text-ink">privacy@{SITE_DOMAIN}</span>.
              </p>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
