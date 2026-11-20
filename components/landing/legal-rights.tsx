"use client";

import { useState } from "react";
import { ArrowRight, Clock3, Landmark, Scale } from "lucide-react";

export const LAWS = [
  { country: "United States", code: "US", law: "CCPA, as amended by the CPRA", deadline: "45 days", escalation: "California Privacy Protection Agency or your state attorney general" },
  { country: "United Kingdom", code: "UK", law: "UK GDPR, Article 17, and the Data Protection Act 2018", deadline: "One month", escalation: "Information Commissioner's Office" },
  { country: "European Union", code: "EU", law: "GDPR, Article 17, right to erasure", deadline: "One month", escalation: "Your national supervisory authority" },
  { country: "India", code: "IN", law: "Digital Personal Data Protection Act 2023, sections 12 and 13", deadline: "30 days", escalation: "Data Protection Board of India" },
  { country: "Canada", code: "CA", law: "PIPEDA, Principle 4.9 and section 8(8)", deadline: "30 days", escalation: "Office of the Privacy Commissioner" },
  { country: "Australia", code: "AU", law: "Privacy Act 1988, Australian Privacy Principles 11 and 13", deadline: "30 days", escalation: "Office of the Australian Information Commissioner" },
] as const;

export function LegalRights() {
  const [active, setActive] = useState(3);
  const law = LAWS[active];

  return (
    <>
      <div className="mt-10 grid gap-3 md:hidden">
        {LAWS.map((row) => (
          <div key={row.country} data-reveal className="card min-w-0 p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-sm font-medium text-ink">{row.country}</p>
              <span className="shrink-0 rounded-full border border-line bg-mist px-2.5 py-1 text-[0.6875rem] font-medium text-ink-soft">{row.deadline}</span>
            </div>
            <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-ink-soft">{row.law}</p>
            <p className="mt-2.5 text-xs leading-relaxed text-muted"><span className="text-[0.625rem] uppercase tracking-[0.12em]">Escalate to</span><br />{row.escalation}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 hidden grid-cols-[0.72fr_1.28fr] overflow-hidden rounded-[1.5rem] border border-line bg-surface md:grid">
        <div className="border-r border-line bg-mist/45 p-3" role="tablist" aria-label="Choose your region">
          {LAWS.map((row, index) => (
            <button
              key={row.country}
              type="button"
              role="tab"
              aria-selected={active === index}
              onClick={() => setActive(index)}
              className={`group flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all duration-200 ${active === index ? "bg-surface text-ink shadow-sm" : "text-muted hover:bg-surface/60 hover:text-ink"}`}
            >
              <span className={`grid size-8 place-items-center rounded-lg border text-[0.625rem] font-semibold transition-colors ${active === index ? "border-moss/25 bg-moss-soft text-moss-deep" : "border-line bg-surface text-muted"}`}>{row.code}</span>
              <span className="flex-1 text-sm font-medium">{row.country}</span>
              <ArrowRight className={`size-3.5 transition-transform ${active === index ? "translate-x-0 text-moss" : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"}`} />
            </button>
          ))}
        </div>

        <div key={law.code} className="legal-panel animate-fade-blur p-8 lg:p-10" role="tabpanel">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-muted">Your right in {law.country}</p>
          <h3 className="mt-3 max-w-xl text-[2rem] leading-tight text-ink">A request backed by law, with a deadline.</h3>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-paper/60 p-5">
              <Scale className="size-5 text-moss" strokeWidth={1.6} />
              <p className="mt-4 text-[0.65rem] uppercase tracking-[0.15em] text-muted">Law cited</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{law.law}</p>
            </div>
            <div className="rounded-2xl border border-line bg-paper/60 p-5">
              <Clock3 className="size-5 text-moss" strokeWidth={1.6} />
              <p className="mt-4 text-[0.65rem] uppercase tracking-[0.15em] text-muted">Answer due</p>
              <p className="mt-1 font-display text-[2rem] text-ink">{law.deadline}</p>
            </div>
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-line bg-paper/60 p-5">
            <Landmark className="mt-0.5 size-5 shrink-0 text-moss" strokeWidth={1.6} />
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.15em] text-muted">If the request is ignored</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">Escalate to the {law.escalation}.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
