"use client";

import { useEffect, useState } from "react";
import {
  Check,
  FileText,
  Globe2,
  Mail,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";

const PHASES = [
  { label: "Identifier", icon: Search },
  { label: "Sources found", icon: Globe2 },
  { label: "Request drafted", icon: FileText },
  { label: "Ready to send", icon: Send },
];

const FINDINGS = [
  { source: "People directory", detail: "Phone number · city", risk: "High" },
  { source: "B2B contact index", detail: "Work email · role", risk: "Medium" },
  { source: "Agency portfolio", detail: "Name · profile", risk: "Low" },
];

export function HeroDemo() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setPhase(2);
      return;
    }

    const timer = window.setInterval(() => {
      setPhase((current) => (current + 1) % PHASES.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="product-demo" aria-label="Animated demonstration of an Untrace scan">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-moss-soft text-moss">
            <ShieldCheck className="size-3.5" strokeWidth={1.8} aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium text-ink">Private scan</p>
            <p className="text-[0.625rem] text-muted">Live product preview</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[0.6875rem] text-moss">
          <span className="status-dot size-1.5 rounded-full bg-moss" />
          Protected
        </span>
      </div>

      <div className="border-b border-line bg-mist/45 px-4 py-3 sm:px-5">
        <div className="relative grid grid-cols-4 gap-1">
          <span className="demo-progress absolute left-[12.5%] right-[12.5%] top-3 h-px bg-line-strong" aria-hidden>
            <span style={{ width: `${(phase / 3) * 100}%` }} />
          </span>
          {PHASES.map((item, index) => {
            const Icon = item.icon;
            const active = index <= phase;
            return (
              <div key={item.label} className="relative z-10 flex flex-col items-center gap-1.5 text-center">
                <span className={`grid size-6 place-items-center rounded-full border transition-all duration-500 ${active ? "border-moss bg-moss text-white" : "border-line-strong bg-surface text-muted"}`}>
                  {index < phase ? <Check className="size-3" strokeWidth={2.2} /> : <Icon className="size-3" strokeWidth={1.8} />}
                </span>
                <span className={`hidden text-[0.58rem] transition-colors sm:block ${active ? "text-ink-soft" : "text-muted"}`}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="min-h-[20rem] p-4 sm:p-5">
        <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-3">
          <Search className={`size-4 shrink-0 text-moss ${phase === 0 ? "animate-pulse-soft" : ""}`} strokeWidth={1.8} />
          <span className="flex-1 truncate text-xs text-ink-soft">alex.morgan@example.com</span>
          <span className="rounded-full bg-moss-soft px-2 py-1 text-[0.625rem] font-medium text-moss-deep">
            {phase === 0 ? "Searching…" : "Verified"}
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-[0.625rem] font-medium uppercase tracking-[0.16em] text-muted">Open-web findings</p>
            <p className="mt-1 font-display text-2xl text-ink">3 traces found</p>
          </div>
          <span className="text-[0.6875rem] text-muted">8 sources checked</span>
        </div>

        <div className="mt-3 space-y-2">
          {FINDINGS.map((finding, index) => (
            <div
              key={finding.source}
              className={`demo-finding flex items-center gap-3 rounded-xl border border-line bg-paper/60 px-3 py-2.5 ${phase >= 1 ? "is-visible" : ""}`}
              style={{ transitionDelay: `${index * 110}ms` }}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-mist text-ink-soft">
                {index === 1 ? <Mail className="size-3.5" /> : <Globe2 className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.72rem] font-medium text-ink">{finding.source}</p>
                <p className="truncate text-[0.625rem] text-muted">{finding.detail}</p>
              </div>
              <span className="text-[0.625rem] text-muted">{finding.risk}</span>
            </div>
          ))}
        </div>

        <div className={`demo-draft mt-3 rounded-xl border border-moss/20 bg-moss-soft/70 p-3 ${phase >= 2 ? "is-visible" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[0.7rem] font-medium text-moss-deep">
              <FileText className="size-3.5" /> Deletion request drafted
            </span>
            <span className="text-[0.625rem] text-moss">GDPR · Article 17</span>
          </div>
          <div className="mt-2 space-y-1.5" aria-hidden>
            <span className="block h-1.5 w-full rounded-full bg-moss/15" />
            <span className="block h-1.5 w-[82%] rounded-full bg-moss/15" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line bg-mist/40 px-4 py-3 sm:px-5">
        <span className="text-[0.65rem] text-muted">Nothing sends without your review</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.68rem] font-medium transition-all duration-500 ${phase >= 3 ? "bg-ink text-paper" : "border border-line bg-surface text-muted"}`}>
          <Send className="size-3" /> Review &amp; send
        </span>
      </div>
    </div>
  );
}
