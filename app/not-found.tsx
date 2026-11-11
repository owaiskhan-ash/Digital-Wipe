import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-line bg-mist text-moss">
          <SearchX className="size-5" strokeWidth={1.6} aria-hidden />
        </span>
        <p className="mt-6 text-[0.6875rem] uppercase tracking-[0.2em] text-muted">
          Error 404
        </p>
        <h1 className="mt-3 text-[2.2rem] leading-tight sm:text-[2.6rem]">
          This page has already been removed.
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
          We couldn&apos;t find that one. The pages below are still where they
          should be.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn btn-primary">
            <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
            Back home
          </Link>
          <Link href="/scan" className="btn btn-secondary">
            Start a scan
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
