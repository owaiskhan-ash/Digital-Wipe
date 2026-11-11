import Link from "next/link";
import { Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="Untrace — home"
      className={cn("group inline-flex items-center gap-2.5", className)}
    >
      <span className="grid size-9 place-items-center rounded-xl border border-line bg-moss-soft text-moss transition-colors duration-200 group-hover:border-moss/40">
        <Fingerprint className="size-[18px]" strokeWidth={1.6} aria-hidden />
      </span>
      <span className="font-display text-[1.45rem] leading-none tracking-tight text-ink">
        untrace
      </span>
    </Link>
  );
}
