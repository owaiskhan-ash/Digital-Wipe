import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ScanFlow } from "@/components/scan/scan-flow";

export const metadata: Metadata = {
  title: "Find the sites publishing your number",
  description:
    "Enter a phone number or an email address. Untrace searches the open web, then shows every page that publishes it and who to write to.",
  alternates: { canonical: "/scan" },
  openGraph: {
    url: "/scan",
    title: "Find the sites publishing your number | Untrace",
    description:
      "See which directories publish your number or address, and who to write to about it.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Untrace: hundreds of sites sell your personal data to anyone who asks, and we write the deletion request for each owner",
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
            Find every page that has your number or address.
          </h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
            One field is enough: a phone number or an email address. A name is
            optional and only used to sign the letters.
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
