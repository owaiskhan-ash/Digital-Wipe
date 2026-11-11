import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ScanFlow } from "@/components/scan/scan-flow";

export const metadata: Metadata = {
  title: "Start a free scan",
  description:
    "Check 45 people-search sites, marketing databases and ad profiles for your name, address and phone number. Free, no account, results in seconds.",
  alternates: { canonical: "/scan" },
  openGraph: {
    url: "/scan",
    title: "Start a free scan | Untrace",
    description:
      "See which directories publish your name, address and phone number, and who to write to about it.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Untrace: every place the internet keeps your data, in one calm list",
      },
    ],
  },
};

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <SiteHeader />
      <main className="container-page py-10 md:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.8} aria-hidden />
          Back
        </Link>

        <div className="mt-8 max-w-2xl">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-muted">
            Step one of three
          </p>
          <h1 className="mt-4 text-[2.4rem] leading-[1.06] sm:text-[3rem]">
            Let&apos;s find where you live online.
          </h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
            This takes a few seconds. Only your name and city are required.
            Everything else makes the report sharper.
          </p>
        </div>

        <div className="mt-10">
          <ScanFlow initialEmail={params.email ?? ""} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
