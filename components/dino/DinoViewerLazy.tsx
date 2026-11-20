"use client";

import dynamic from "next/dynamic";

export const DinoViewerLazy = dynamic(
  () => import("@/components/dino/DinoViewer").then((m) => m.DinoViewer),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[420px] place-items-center rounded-2xl border border-line bg-surface text-sm text-muted sm:h-[520px]">
        Loading 3D viewer…
      </div>
    ),
  },
);
