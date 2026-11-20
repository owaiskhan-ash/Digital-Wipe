import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Box, Download, MousePointer2, Palette, Printer } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DinoViewerLazy as DinoViewer } from "@/components/dino/DinoViewerLazy";

export const metadata: Metadata = {
  title: "Cute Dino — Interactive 3D Model",
  description:
    "A fully interactive 3D model of the lime-green pull-along dinosaur toy with blue back plates. Orbit it, recolor it, and download it as GLB, OBJ or STL.",
  alternates: { canonical: "/dino" },
};

const FORMATS = [
  {
    icon: Box,
    title: "GLB — for web & AR",
    body: "Binary glTF with materials. Drop it into three.js, Babylon, Unity, Unreal, or view it in any GLB viewer. This is the file to use for games and product pages.",
    ext: "glb",
  },
  {
    icon: Download,
    title: "OBJ — for Blender & editing",
    body: "Classic Wavefront OBJ. Open in Blender, Maya or MeshLab to sculpt, retexture or rig. Materials are baked into the export, so it opens looking right.",
    ext: "obj",
  },
  {
    icon: Printer,
    title: "STL — for 3D printing",
    body: "Watertight-ish triangle mesh ready to slice. Print it at 100% for a desk-sized dino, or scale down for a keychain. Wheels and spikes print cleanly.",
    ext: "stl",
  },
];

const ANATOMY = [
  ["Lime-green body", "Glossy clearcoat plastic, just like the injection-moulded toy."],
  ["Blue back plates", "Seven rounded domes: three down the neck crest, four shrinking toward the tail."],
  ["Big friendly eye", "White sclera, warm-brown iris, twin highlights — on both sides of the head."],
  ["Olive spots", "Fourteen hand-placed flank spots that hug the belly curve."],
  ["Pull-along wheels", "Four blue wheels with green leg stubs, peeking out from under the belly."],
  ["Toy details", "Neck seam ring, pink blush, nostrils, brows and a stitched-on smile."],
];

export default function DinoPage() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="container-page py-10 md:py-14">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Back to Untrace
        </Link>

        <div className="mt-6 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-moss">Interactive 3D model</p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-ink md:text-5xl">
            The little green dino, in 3D.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-soft">
            Your photo, rebuilt as a real-time 3D model. Every part — the long neck, the blue back plates,
            the big eye, the spots and the pull-along wheels — is modelled procedurally, so you can spin it,
            recolor it and take the file with you.
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          <DinoViewer />

          <aside className="flex flex-col gap-6">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">Reference photo</h2>
              </div>
              <div className="relative aspect-square bg-black">
                <Image
                  src="/dino-reference.webp"
                  alt="Reference photo of the lime-green dinosaur toy with blue spikes"
                  fill
                  className="object-contain"
                  sizes="320px"
                />
              </div>
              <p className="px-4 py-3 text-xs leading-relaxed text-muted">
                The original shot. The model matches its proportions, colors and details — spin the viewer
                around to check the other side.
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Palette className="size-4" aria-hidden />
                What&apos;s modelled
              </h2>
              <dl className="mt-3 space-y-3">
                {ANATOMY.map(([term, def]) => (
                  <div key={term}>
                    <dt className="text-xs font-semibold text-ink">{term}</dt>
                    <dd className="text-xs leading-relaxed text-muted">{def}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>
        </div>

        <section className="mt-12">
          <h2 className="flex items-center gap-2 font-display text-2xl text-ink">
            <MousePointer2 className="size-5" aria-hidden />
            Take the model with you
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            The viewer exports the exact model you see — including the colorway you picked. The same files are
            also committed to the repo under <code className="rounded bg-mist px-1.5 py-0.5 text-xs">public/models/</code> so
            you can grab them without opening the page.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {FORMATS.map((f) => (
              <article key={f.ext} className="rounded-2xl border border-line bg-surface p-5">
                <f.icon className="size-5 text-moss" aria-hidden />
                <h3 className="mt-3 text-sm font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{f.body}</p>
                <a
                  href={`/models/cute-dino.${f.ext}`}
                  download
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-moss transition-colors hover:text-moss-deep"
                >
                  <Download className="size-3.5" aria-hidden />
                  cute-dino.{f.ext}
                </a>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
