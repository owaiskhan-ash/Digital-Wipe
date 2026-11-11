import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ScanFlow } from "@/components/scan/scan-flow";

export const metadata: Metadata = {
  title: "Start a scan",
  description:
    "Check the people-search sites, marketing databases and ad profiles that publish your name, address and phone number.",
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
            This takes a few seconds. Only your name and city are required —
            everything else makes the report sharper.
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
