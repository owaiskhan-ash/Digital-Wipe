"use client";

import { ExternalLink, KeyRound, ShieldAlert } from "lucide-react";
import type { BreachExposure } from "@/lib/types";
import { DATA_LABELS } from "@/lib/types";
import { plural } from "@/lib/utils";
import { EmptyState } from "@/components/ui";

export function BreachesPanel({ breaches }: { breaches: BreachExposure[] }) {
  if (breaches.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title="No breach records checked"
        description="Add an email address to your scan and Untrace can check whether your credentials appear in known breach archives."
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-line bg-mist/60 px-4 py-3.5">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber" strokeWidth={1.8} aria-hidden />
        <p className="text-xs leading-relaxed text-ink-soft">
          Breach records can&apos;t be deleted — the lists are public and copied
          endlessly. What you can do is make them worthless: rotate the password,
          turn on two-factor, and stop reusing that email for anything that matters.
        </p>
      </div>

      <div className="space-y-3">
        {breaches.map((breach) => (
          <article key={breach.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[1rem] font-medium text-ink">{breach.name}</h3>
                  <span className="text-xs text-muted">{breach.year}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {breach.accounts} accounts exposed
                </p>
              </div>
              <span className="rounded-full border border-amber/25 bg-amber-soft px-2.5 py-1 text-[0.6875rem] font-medium text-amber">
                {breach.risk === "high" ? "Act now" : "Harden it"}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {breach.exposed.map((type) => (
                <span
                  key={type}
                  className="rounded-md border border-line bg-mist px-1.5 py-0.5 text-[0.6875rem] text-ink-soft"
                >
                  {DATA_LABELS[type as keyof typeof DATA_LABELS] ?? type}
                </span>
              ))}
            </div>

            <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
              {breach.advice}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
              <a
                href={breach.checkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-xs"
              >
                Check on Have I Been Pwned
                <ExternalLink className="size-3" strokeWidth={1.8} aria-hidden />
              </a>
              <span className="text-[0.6875rem] text-muted">
                {plural(breach.exposed.length, "field")} exposed
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
