/**
 * Renders an orthographic side/front preview of the dino mesh to a PNG, using a
 * tiny z-buffered rasterizer (no browser required). Useful for eyeballing the
 * model from the command line:
 *
 *   npx tsx scripts/render-preview.ts
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { buildDino } from "../lib/dino/buildDino.js";

const W = 640;
const H = 640;

type Tri = { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; color: [number, number, number] };

function collect(root: THREE.Object3D, axis: "z" | "x"): Tri[] {
  const tris: Tri[] = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute("position");
    const index = geo.index;
    const mat = m.material as THREE.MeshStandardMaterial;
    const col = mat.color ?? new THREE.Color(0x888888);
    // approximate lighting with the material colour only for now
    const base: [number, number, number] = [col.r, col.g, col.b];
    const v = new THREE.Vector3();
    const gather = (i: number) => {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      return axis === "z" ? new THREE.Vector3(v.x, v.y, v.z) : new THREE.Vector3(v.z, v.y, v.x);
    };
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const i0 = index ? index.getX(i) : i;
      const i1 = index ? index.getX(i + 1) : i + 1;
      const i2 = index ? index.getX(i + 2) : i + 2;
      tris.push({ a: gather(i0), b: gather(i1), c: gather(i2), color: base });
    }
  });
  return tris;
}

function render(tris: Tri[], outPath: string, flipX: boolean) {
  const px = new Float32Array(W * H * 3);
  const zbuf = new Float32Array(W * H).fill(Infinity);
  // background: soft paper tone
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = 0.97;
    px[i * 3 + 1] = 0.96;
    px[i * 3 + 2] = 0.93;
  }

  // world bounds in the projected plane
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const t of tris) {
    for (const p of [t.a, t.b, t.c]) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  }
  const span = Math.max(maxX - minX, maxY - minY) * 1.08;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.min(W, H) / span;

  const proj = (p: THREE.Vector3) => {
    const sx = (flipX ? cx - p.x : p.x - cx) * scale + W / 2;
    const sy = H / 2 - (p.y - cy) * scale;
    return { x: sx, y: sy, z: p.z };
  };

  const light = new THREE.Vector3(0.45, 0.75, 0.85).normalize();

  for (const t of tris) {
    const p0 = proj(t.a), p1 = proj(t.b), p2 = proj(t.c);
    const e1 = new THREE.Vector3().subVectors(t.b, t.a);
    const e2 = new THREE.Vector3().subVectors(t.c, t.a);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
    const ndl = Math.abs(n.dot(light));
    const shade = 0.35 + 0.75 * ndl;
    const col: [number, number, number] = [
      Math.min(1, t.color[0] * shade + 0.06),
      Math.min(1, t.color[1] * shade + 0.06),
      Math.min(1, t.color[2] * shade + 0.06),
    ];

    const area = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
    if (Math.abs(area) < 1e-9) continue;
    const minPx = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x)));
    const maxPx = Math.min(W - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x)));
    const minPy = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y)));
    const maxPy = Math.min(H - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y)));

    for (let y = minPy; y <= maxPy; y++) {
      for (let x = minPx; x <= maxPx; x++) {
        const sx = x + 0.5, sy = y + 0.5;
        const w0 = ((p1.x - sx) * (p2.y - sy) - (p2.x - sx) * (p1.y - sy)) / area;
        const w1 = ((p2.x - sx) * (p0.y - sy) - (p0.x - sx) * (p2.y - sy)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * p0.z + w1 * p1.z + w2 * p2.z;
        const idx = y * W + x;
        if (z >= zbuf[idx]) continue;
        zbuf[idx] = z;
        px[idx * 3] = col[0];
        px[idx * 3 + 1] = col[1];
        px[idx * 3 + 2] = col[2];
      }
    }
  }

  // --- PNG encode -------------------------------------------------------
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([len, typed, crc]);
  };

  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const src = (y * W + x) * 3;
      const dst = y * (W * 3 + 1) + 1 + x * 3;
      raw[dst] = Math.round(px[src] * 255);
      raw[dst + 1] = Math.round(px[src + 1] * 255);
      raw[dst + 2] = Math.round(px[src + 2] * 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(outPath, png);
  console.log(`Wrote ${outPath}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "models");
mkdirSync(outDir, { recursive: true });

const dino = buildDino();
dino.updateMatrixWorld(true);

render(collect(dino, "z"), join(root, ".preview-side.png"), false);
render(collect(dino, "x"), join(root, ".preview-front.png"), false);
