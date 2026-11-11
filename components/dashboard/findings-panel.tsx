"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  Mail,
  Search,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import type { Category, Finding, RequestStatus, Risk } from "@/lib/types";
import { CATEGORIES, DATA_LABELS } from "@/lib/types";
import { cn, formatDate, plural, relativeDays } from "@/lib/utils";
import { CategoryPill, EffortNote, RiskBadge } from "@/components/ui";
import type { ComposerSeed } from "./composer";

const RISKS: Array<{ id: Risk | "all"; label: string }> = [
  { id: "all", label: "All risk" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

const CATEGORY_IDS = Object.keys(CATEGORIES) as Category[];

const REQUEST_CHIP: Record<RequestStatus, { label: string; className: string }> = {
  drafted: { label: "Draft saved", className: "border-line bg-mist text-muted" },
  sent: { label: "Requested", className: "border-moss/25 bg-moss-soft text-moss" },
  confirmed: { label: "Acknowledged", className: "border-lilac/25 bg-lilac-soft text-lilac" },
  removed: { label: "Removed", className: "border-moss/30 bg-moss-soft text-moss" },
  refused: { label: "Refused", className: "border-clay/25 bg-clay-soft text-clay" },
};

export function FindingsPanel({
  findings,
  statuses,
  onCompose,
}: {
  findings: Finding[];
  statuses: Record<string, RequestStatus>;
  onCompose: (seeds: ComposerSeed[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [risk, setRisk] = useState<Risk | "all">("all");
  const [category, setCategory] = useState<Category | "all">("all");
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return findings.filter((finding) => {
      if (risk !== "all" && finding.risk !== risk) return false;
      if (category !== "all" && finding.category !== category) return false;
      if (!needle) return true;
      return (
        finding.broker.toLowerCase().includes(needle) ||
        finding.domain.toLowerCase().includes(needle) ||
        finding.data.some((type) => DATA_LABELS[type].toLowerCase().includes(needle))
      );
    });
  }, [findings, query, risk, category]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((finding) => selected.includes(finding.id));

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const toggleAll = () =>
    setSelected(allVisibleSelected ? [] : filtered.map((finding) => finding.id));

  const selectedFindings = findings.filter((finding) => selected.includes(finding.id));

  const activeFilters = (risk !== "all" ? 1 : 0) + (category !== "all" ? 1 : 0);

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
              strokeWidth={1.8}
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a site or a kind of data"
              aria-label="Search findings"
              className="field py-2.5 pl-10 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
              <SlidersHorizontal className="size-3.5" strokeWidth={1.8} aria-hidden />
              {activeFilters > 0 ? `${activeFilters} filter${activeFilters > 1 ? "s" : ""}` : "Filter"}
            </span>
            {activeFilters > 0 ? (
              <button
                type="button"
                className="text-xs text-moss underline decoration-moss/30 underline-offset-4 hover:decoration-moss"
                onClick={() => {
                  setRisk("all");
                  setCategory("all");
                }}
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {RISKS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRisk(item.id)}
              className={cn("chip", risk === item.id && "chip-active")}
            >
              {item.label}
            </button>
          ))}
          <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={cn("chip", category === "all" && "chip-active")}
          >
            Everywhere
          </button>
          {CATEGORY_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              className={cn("chip", category === id && "chip-active")}
            >
              {CATEGORIES[id].short}
            </button>
          ))}
        </div>
      </div>

      {/* Count + select all */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <p className="text-xs text-muted">
          {filtered.length === findings.length
            ? `${plural(findings.length, "listing")} found`
            : `${filtered.length} of ${plural(findings.length, "listing")}`}
        </p>
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-2 text-xs text-ink-soft transition-colors hover:text-ink"
        >
          <span
            className={cn(
              "grid size-4 place-items-center rounded-[5px] border transition-colors",
              allVisibleSelected
                ? "border-moss bg-moss text-paper"
                : "border-line-strong bg-surface",
            )}
            aria-hidden
          >
            {allVisibleSelected ? <Check className="size-3" strokeWidth={3} /> : null}
          </span>
          Select all shown
        </button>
      </div>

      {/* Bulk bar */}
      {selected.length > 0 ? (
        <div className="sticky top-20 z-10 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-moss/30 bg-moss-soft px-4 py-3">
          <p className="text-xs font-medium text-moss-deep">
            {plural(selected.length, "listing")} selected
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="btn btn-quiet btn-xs"
              onClick={() => setSelected([])}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => onCompose(selectedFindings.map((finding) => ({ finding })))}
            >
              <Mail className="size-3.5" strokeWidth={1.8} aria-hidden />
              Draft {selected.length} request{selected.length > 1 ? "s" : ""}
            </button>
          </div>
        </div>
      ) : null}

      {/* List */}
      <div className="mt-4 space-y-3">
        {filtered.map((finding) => (
          <FindingRow
            key={finding.id}
            finding={finding}
            selected={selected.includes(finding.id)}
            status={statuses[finding.id]}
            onToggle={() => toggle(finding.id)}
            onCompose={() => onCompose([{ finding }])}
          />
        ))}

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
            <p className="text-sm text-ink">Nothing matches those filters.</p>
            <p className="mt-1 text-xs text-muted">
              Try &ldquo;all risk&rdquo; or clear the search.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FindingRow({
  finding,
  selected,
  status,
  onToggle,
  onCompose,
}: {
  finding: Finding;
  selected: boolean;
  status?: RequestStatus;
  onToggle: () => void;
  onCompose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const data = finding.data.filter((type) => type !== "fullName");
  const shown = expanded ? data : data.slice(0, 4);

  return (
    <article
      className={cn(
        "card group p-5 transition-colors duration-200",
        selected ? "border-moss/40 bg-moss-soft/25" : "hover:border-line-strong",
      )}
    >
      <div className="flex gap-3.5">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={`Select ${finding.broker}`}
          className="-m-1 mt-0.5 shrink-0 rounded-md p-1"
        >
          <span
            className={cn(
              "grid size-[1.125rem] place-items-center rounded-[5px] border transition-colors",
              selected
                ? "border-moss bg-moss text-paper"
                : "border-line-strong bg-surface group-hover:border-muted",
            )}
          >
            {selected ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h3 className="text-[1.02rem] font-medium tracking-tight text-ink">
              {finding.broker}
            </h3>
            <span className="text-xs text-muted">{finding.domain}</span>
            <div className="ml-auto flex items-center gap-1.5">
              {status ? (
                <span
                  className={cn(
                    "rounded-full border px-2 py-1 text-[0.6875rem] font-medium",
                    REQUEST_CHIP[status].className,
                  )}
                >
                  {REQUEST_CHIP[status].label}
                </span>
              ) : null}
              <RiskBadge risk={finding.risk} />
            </div>
          </div>

          <p className="mt-2 max-w-2xl text-[0.8125rem] leading-relaxed text-muted">
            {finding.summary}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <CategoryPill category={finding.category} />
            {shown.map((type) => (
              <span
                key={type}
                className="rounded-md border border-line bg-mist px-1.5 py-0.5 text-[0.6875rem] text-ink-soft"
              >
                {DATA_LABELS[type]}
              </span>
            ))}
            {data.length > 4 ? (
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="rounded-md border border-transparent px-1.5 py-0.5 text-[0.6875rem] text-muted transition-colors hover:text-ink"
              >
                {expanded ? "Show less" : `+${data.length - 4} more`}
              </button>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <EffortNote effort={finding.effort} />
            <span
              className="text-[0.6875rem] text-muted"
              title={formatDate(finding.firstSeen)}
            >
              Seen {relativeDays(finding.lastSeen)}
            </span>

            <div className="flex items-center gap-2 sm:ml-auto">
              <a
                href={finding.inspectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-quiet btn-xs text-muted"
              >
                Inspect
                <ExternalLink className="size-3" strokeWidth={1.8} aria-hidden />
              </a>
              <button type="button" onClick={onCompose} className="btn btn-secondary btn-xs">
                <Send className="size-3" strokeWidth={1.8} aria-hidden />
                Request removal
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
