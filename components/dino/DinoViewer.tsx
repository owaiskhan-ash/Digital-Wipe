"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { Download, Loader2, RotateCw, Pause, Grid3X3, Sun, Moon } from "lucide-react";
import { buildDino, dinoStats, DINO_COLORWAYS, type DinoColorway } from "@/lib/dino/buildDino";

type ExportKind = "glb" | "obj" | "stl";

export function DinoViewer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const dinoRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [colorway, setColorway] = useState<DinoColorway>(DINO_COLORWAYS[0]);
  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [dark, setDark] = useState(false);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [stats, setStats] = useState<{ meshes: number; triangles: number; vertices: number } | null>(null);
  const [ready, setReady] = useState(false);

  // ---- Scene setup (once) ------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f3f2ec");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(4.6, 2.9, 5.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // Lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d5c8, 0.55);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 7, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -2;
    key.shadow.bias = -0.0004;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9);
    rim.position.set(-5, 4, -4);
    scene.add(rim);

    // Ground: soft shadow catcher + faint disc.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(6, 64),
      new THREE.ShadowMaterial({ opacity: 0.18 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = "ground-shadow";
    scene.add(ground);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 64),
      new THREE.MeshStandardMaterial({ color: 0xe9e7dc, roughness: 0.95 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.005;
    disc.receiveShadow = true;
    disc.name = "ground-disc";
    scene.add(disc);

    // Dino
    const dino = buildDino(colorway);
    dinoRef.current = dino;
    scene.add(dino);
    setStats(dinoStats(dino));

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.35, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.2;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.4;
    controlsRef.current = controls;

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      // Gentle idle: the toy bobs a touch and its head sways, like it's alive.
      if (dinoRef.current) {
        dinoRef.current.position.y = Math.sin(t * 1.6) * 0.02;
        const head = dinoRef.current.getObjectByName("head");
        if (head) head.rotation.z = Math.sin(t * 1.1) * 0.03;
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      dinoRef.current = null;
      controlsRef.current = null;
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Colorway swap -----------------------------------------------------
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ready) return;
    const old = dinoRef.current;
    if (old) {
      scene.remove(old);
      disposeTree(old);
    }
    const next = buildDino(colorway);
    dinoRef.current = next;
    scene.add(next);
    // Keep the wireframe preference across rebuilds.
    if (wireframe) applyWireframe(next, true);
    setStats(dinoStats(next));
  }, [colorway, ready, wireframe]);

  // ---- Toggles -----------------------------------------------------------
  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    if (dinoRef.current) applyWireframe(dinoRef.current, wireframe);
  }, [wireframe]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.background = new THREE.Color(dark ? "#141613" : "#f3f2ec");
    const disc = scene.getObjectByName("ground-disc") as THREE.Mesh | undefined;
    if (disc) {
      (disc.material as THREE.MeshStandardMaterial).color.set(dark ? "#23261f" : "#e9e7dc");
    }
    const shadow = scene.getObjectByName("ground-shadow") as THREE.Mesh | undefined;
    if (shadow) {
      (shadow.material as THREE.ShadowMaterial).opacity = dark ? 0.35 : 0.18;
    }
  }, [dark]);

  // ---- Export ------------------------------------------------------------
  const doExport = (kind: ExportKind) => {
    const dino = dinoRef.current;
    if (!dino || exporting) return;
    setExporting(kind);
    try {
      const stamp = "cute-dino";
      if (kind === "glb") {
        const exporter = new GLTFExporter();
        exporter.parse(
          dino,
          (result) => {
            const blob = new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
            triggerDownload(blob, `${stamp}.glb`);
            setExporting(null);
          },
          (err) => {
            console.error(err);
            setExporting(null);
          },
          { binary: true },
        );
      } else if (kind === "obj") {
        const text = new OBJExporter().parse(dino);
        triggerDownload(new Blob([text], { type: "text/plain" }), `${stamp}.obj`);
        setExporting(null);
      } else {
        // Binary STL (DataView) — compact and slicer-ready.
        const view = new STLExporter().parse(dino, { binary: true }) as unknown as DataView;
        const buf = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
        triggerDownload(new Blob([buf], { type: "model/stl" }), `${stamp}.stl`);
        setExporting(null);
      }
    } catch (err) {
      console.error(err);
      setExporting(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div ref={mountRef} className="relative h-[420px] w-full sm:h-[520px]" aria-label="Interactive 3D model of the green dinosaur toy. Drag to rotate, scroll to zoom.">
        {!ready && (
          <div className="absolute inset-0 grid place-items-center text-muted">
            <Loader2 className="size-6 animate-spin" aria-hidden />
          </div>
        )}
        <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-line bg-paper/90 px-3 py-1 text-xs text-ink-soft backdrop-blur">
          Drag to rotate · Scroll to zoom · Right-drag to pan
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-mist"
            aria-pressed={autoRotate}
          >
            {autoRotate ? <Pause className="size-3.5" aria-hidden /> : <RotateCw className="size-3.5" aria-hidden />}
            {autoRotate ? "Pause spin" : "Auto-spin"}
          </button>
          <button
            type="button"
            onClick={() => setWireframe((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-mist"
            aria-pressed={wireframe}
          >
            <Grid3X3 className="size-3.5" aria-hidden />
            Wireframe
          </button>
          <button
            type="button"
            onClick={() => setDark((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-mist"
            aria-pressed={dark}
          >
            {dark ? <Sun className="size-3.5" aria-hidden /> : <Moon className="size-3.5" aria-hidden />}
            {dark ? "Light studio" : "Dark studio"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Colorway:</span>
          {DINO_COLORWAYS.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setColorway(c)}
              title={c.name}
              aria-label={`Use ${c.name} colorway`}
              aria-pressed={colorway.name === c.name}
              className={`size-7 rounded-full border-2 transition-transform hover:scale-110 ${colorway.name === c.name ? "border-ink" : "border-line"}`}
              style={{ backgroundColor: c.body }}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line bg-mist/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          {stats
            ? `${stats.meshes} parts · ${stats.triangles.toLocaleString()} triangles · ${stats.vertices.toLocaleString()} vertices`
            : "Building model…"}
        </p>
        <div className="flex flex-wrap gap-2">
          {(["glb", "obj", "stl"] as ExportKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => doExport(kind)}
              disabled={!!exporting}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {exporting === kind ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
              Download .{kind.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function applyWireframe(root: THREE.Object3D, on: boolean) {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial;
    if (mat && "wireframe" in mat) mat.wireframe = on;
  });
}

/** Free GPU memory for a discarded dino (geometry + materials). */
function disposeTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
