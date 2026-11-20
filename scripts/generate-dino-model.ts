/**
 * Generates static copies of the dino model into public/models/.
 *
 * Run with: npx tsx scripts/generate-dino-model.ts
 * The interactive viewer at /dino exports the same model from the browser;
 * these committed files let anyone grab GLB/OBJ/STL without opening the page.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { buildDino, dinoStats } from "../lib/dino/buildDino.js";

// GLTFExporter uses the browser FileReader API — polyfill it for Node.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  async readAsArrayBuffer(blob: Blob) {
    try {
      this.result = await blob.arrayBuffer();
      this.onloadend?.();
    } catch (err) {
      this.onerror?.(err);
    }
  }
  async readAsDataURL(blob: Blob) {
    try {
      const buf = Buffer.from(await blob.arrayBuffer());
      this.result = `data:${blob.type || "application/octet-stream"};base64,${buf.toString("base64")}`;
      this.onloadend?.();
    } catch (err) {
      this.onerror?.(err);
    }
  }
}
(globalThis as Record<string, unknown>).FileReader = NodeFileReader;

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const outDir = join(root, "public", "models");
  mkdirSync(outDir, { recursive: true });

  const dino = buildDino();
  const stats = dinoStats(dino);
  console.log(
    `Model: ${stats.meshes} meshes, ${stats.triangles.toLocaleString()} triangles, ${stats.vertices.toLocaleString()} vertices`,
  );
  console.log(
    `Bounds: ${stats.size.x.toFixed(2)} x ${stats.size.y.toFixed(2)} x ${stats.size.z.toFixed(2)} units`,
  );

  // GLB (binary)
  const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
    new GLTFExporter().parse(
      dino,
      (result) => resolve(result as ArrayBuffer),
      (err) => reject(err),
      { binary: true },
    );
  });
  writeFileSync(join(outDir, "cute-dino.glb"), Buffer.from(glb));
  console.log(`Wrote cute-dino.glb (${(glb.byteLength / 1024).toFixed(1)} KB)`);

  // OBJ
  const obj = new OBJExporter().parse(dino);
  writeFileSync(join(outDir, "cute-dino.obj"), obj);
  console.log(`Wrote cute-dino.obj (${(Buffer.byteLength(obj) / 1024).toFixed(1)} KB)`);

  // STL (binary — ~6x smaller than ASCII; every slicer reads it)
  // STLExporter returns a DataView for binary output.
  const stlView = new STLExporter().parse(dino, { binary: true }) as unknown as DataView;
  const stlBuf = Buffer.from(stlView.buffer, stlView.byteOffset, stlView.byteLength);
  writeFileSync(join(outDir, "cute-dino.stl"), stlBuf);
  console.log(`Wrote cute-dino.stl (${(stlBuf.byteLength / 1024).toFixed(1)} KB)`);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
