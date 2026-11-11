import type { LucideIcon } from "lucide-react";
import {
  Landmark,
  Megaphone,
  Radar,
  ScanSearch,
  ShieldAlert,
  UserSearch,
} from "lucide-react";
import { CATEGORIES, type Category, type Effort, type Risk } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  "people-search": UserSearch,
  marketing: Megaphone,
  adtech: Radar,
  breach: ShieldAlert,
  "public-records": Landmark,
  search: ScanSearch,
};

export function CategoryIcon({
  category,
  className,
}: {
  category: Category;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon className={className} strokeWidth={1.6} aria-hidden />;
}

export function CategoryPill({
  category,
  withIcon = true,
  className,
}: {
  category: Category;
  withIcon?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[0.6875rem] font-medium tracking-wide text-ink-soft",
        className,
      )}
    >
      {withIcon ? <CategoryIcon category={category} className="size-3.5 text-muted" /> : null}
      {CATEGORIES[category].short}
    </span>
  );
}

const RISK_STYLES: Record<Risk, { label: string; className: string; dot: string }> = {
  high: {
    label: "High",
    className: "border-clay/25 bg-clay-soft text-clay",
    dot: "bg-clay",
  },
  medium: {
    label: "Medium",
    className: "border-amber/25 bg-amber-soft text-amber",
    dot: "bg-amber",
  },
  low: {
    label: "Low",
    className: "border-moss/20 bg-moss-soft text-moss",
    dot: "bg-moss",
  },
};

export function RiskBadge({ risk, className }: { risk: Risk; className?: string }) {
  const style = RISK_STYLES[risk];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium",
        style.className,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
      {style.label} risk
    </span>
  );
}

const EFFORT_LABEL: Record<Effort, string> = {
  easy: "Quick form",
  medium: "A few steps",
  hard: "May need follow-up",
};

export function EffortNote({ effort }: { effort: Effort }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-muted">
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={cn(
              "w-[3px] rounded-full",
              index === 0 && "h-1.5",
              index === 1 && "h-2.5",
              index === 2 && "h-3.5",
              index <= (effort === "easy" ? 0 : effort === "medium" ? 1 : 2)
                ? "bg-moss"
                : "bg-line-strong",
            )}
          />
        ))}
      </span>
      {EFFORT_LABEL[effort]}
    </span>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-muted">
      {children}
    </p>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = "ink",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "ink" | "moss" | "clay" | "amber";
}) {
  const accentClass =
    accent === "moss"
      ? "text-moss"
      : accent === "clay"
        ? "text-clay"
        : accent === "amber"
          ? "text-amber"
          : "text-ink";

  return (
    <div className="card px-5 py-4">
      <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className={cn("mt-2 font-display text-[2.1rem] leading-none", accentClass)}>
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-line bg-mist text-moss">
        <Icon className="size-5" strokeWidth={1.6} aria-hidden />
      </span>
      <h3 className="mt-5 font-display text-2xl">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
