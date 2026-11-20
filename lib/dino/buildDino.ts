import * as THREE from "three";

/**
 * Procedural 3D model of the cute green pull-along dinosaur toy.
 *
 * Built entirely from Three.js primitives so it can be rendered in the
 * browser and exported to GLB / OBJ / STL without any external assets.
 *
 * Orientation: the dino faces +X (head at +X, tail at -X), stands on y=0,
 * and is symmetric about the XZ plane (z = 0).
 */

export const DINO_COLORS = {
  body: "#aedc2a", // lime green plastic
  bodySeam: "#8fbf1f",
  spike: "#5f83c4", // dusty blue
  spot: "#4f6428", // dark olive
  eyeWhite: "#ffffff",
  iris: "#4a2c1a",
  pupil: "#161616",
  blush: "#f4a9c4",
  nostril: "#2f3a1a",
  brow: "#4a3220",
  mouth: "#5a6b2a",
  wheel: "#5f83c4",
} as const;

export type DinoColorway = {
  name: string;
  body: string;
  spike: string;
  spot: string;
};

export const DINO_COLORWAYS: DinoColorway[] = [
  { name: "Original green", body: "#aedc2a", spike: "#5f83c4", spot: "#4f6428" },
  { name: "Bubblegum pink", body: "#f6a8c1", spike: "#7a6fc0", spot: "#8a4a6b" },
  { name: "Sky blue", body: "#7ec8e3", spike: "#f2a65a", spot: "#2f5d7a" },
  { name: "Tangerine", body: "#f5a623", spike: "#4a90d9", spot: "#7a4a1a" },
];

function plastic(color: string, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.28,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.18,
    ...opts,
  });
}

function matte(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.0,
    ...opts,
  });
}

function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  name: string,
  pos: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
  rot: [number, number, number] = [0, 0, 0],
) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const sphere = (r: number, w = 48, h = 32) => new THREE.SphereGeometry(r, w, h);

/** A rounded dome spike, flattened sideways like the toy's back plates. */
function spikeDome(
  radius: number,
  mat: THREE.Material,
  name: string,
  pos: [number, number, number],
  scale: [number, number, number] = [1.05, 0.95, 0.55],
) {
  const g = sphere(radius, 40, 28);
  const m = mesh(g, mat, name, pos, scale, [0, 0, 0]);
  // Tilt slightly backward so the dome leans toward the tail, like the photo.
  m.rotation.z = 0.12;
  return m;
}

/** One eye assembly: white, iris, pupil and highlight. Built facing its local +X. */
function buildEye(
  side: 1 | -1,
  pos: THREE.Vector3,
  normal: THREE.Vector3,
  mats: { white: THREE.Material; iris: THREE.Material; pupil: THREE.Material; hi: THREE.Material },
) {
  const g = new THREE.Group();
  g.name = side === 1 ? "eye-left" : "eye-right";

  // The eyeball is a lens: flattened along its own view axis (+X), so it sits
  // proud of the head like the moulded toy eye.
  const white = mesh(sphere(0.215, 44, 32), mats.white, "eye-white", [0, 0, 0], [0.62, 1, 1]);
  const iris = mesh(sphere(0.126, 36, 26), mats.iris, "eye-iris", [0.085, 0.012, 0], [0.5, 1, 1]);
  const pupil = mesh(sphere(0.068, 28, 20), mats.pupil, "eye-pupil", [0.135, 0.012, 0], [0.45, 1, 1]);
  const hi = mesh(sphere(0.036, 18, 14), mats.hi, "eye-highlight", [0.163, 0.06, 0.045]);
  const hi2 = mesh(sphere(0.019, 14, 10), mats.hi, "eye-highlight-2", [0.15, -0.038, -0.05]);

  g.add(white, iris, pupil, hi, hi2);
  g.position.copy(pos);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), normal);
  return g;
}

export function buildDino(colorway: DinoColorway = DINO_COLORWAYS[0]): THREE.Group {
  const dino = new THREE.Group();
  dino.name = "cute-dino";

  const bodyMat = plastic(colorway.body);
  const seamMat = plastic(colorway.body, { roughness: 0.4 });
  const spikeMat = plastic(colorway.spike);
  const spotMat = matte(colorway.spot, { roughness: 0.6 });
  const whiteMat = plastic(DINO_COLORS.eyeWhite, { roughness: 0.15 });
  const irisMat = plastic(DINO_COLORS.iris, { roughness: 0.2 });
  const pupilMat = matte(DINO_COLORS.pupil, { roughness: 0.25 });
  const hiMat = matte("#ffffff", { roughness: 0.2 });
  const blushMat = matte(DINO_COLORS.blush, { roughness: 0.7 });
  const darkMat = matte(DINO_COLORS.nostril, { roughness: 0.5 });
  const browMat = matte(DINO_COLORS.brow, { roughness: 0.5 });
  const mouthMat = matte(DINO_COLORS.mouth, { roughness: 0.5 });
  const wheelMat = plastic(colorway.spike, { roughness: 0.35 });

  // ---- Body -------------------------------------------------------------
  // Main ellipsoid belly. Kept just clear of the ground so the blue wheels
  // are the lowest point, like the real pull-along toy.
  const body = mesh(sphere(1, 56, 40), bodyMat, "body", [0, 1.08, 0], [1.72, 1.02, 0.96]);
  dino.add(body);

  // Chest blend toward the neck — tucked just inside the belly silhouette so it
  // fills the shoulder without bulging out past the front of the body.
  const chest = mesh(sphere(0.66, 48, 36), bodyMat, "chest", [0.82, 1.44, 0], [1.0, 1.05, 0.86]);
  dino.add(chest);

  // ---- Neck (smooth tube along a gentle curve) --------------------------
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.95, 1.45, 0),
    new THREE.Vector3(1.18, 2.05, 0),
    new THREE.Vector3(1.32, 2.62, 0),
    new THREE.Vector3(1.38, 3.0, 0),
  ]);
  const neckGeo = new THREE.TubeGeometry(neckCurve, 32, 0.335, 28, false);
  const neck = new THREE.Mesh(neckGeo, bodyMat);
  neck.name = "neck";
  neck.castShadow = true;
  neck.receiveShadow = true;
  dino.add(neck);

  // Seam ring where the neck piece meets the body (visible on the real toy).
  const seam = mesh(
    new THREE.TorusGeometry(0.345, 0.016, 12, 48),
    seamMat,
    "neck-seam",
    [1.02, 1.62, 0],
    [1, 1, 1],
    [Math.PI / 2 - 0.18, 0, 0],
  );
  dino.add(seam);

  // ---- Head -------------------------------------------------------------
  const head = mesh(sphere(0.62, 56, 40), bodyMat, "head", [1.48, 3.28, 0], [1.12, 0.95, 0.9]);
  dino.add(head);

  // Muzzle / snout.
  const muzzle = mesh(sphere(0.42, 48, 34), bodyMat, "muzzle", [1.98, 3.12, 0], [1.3, 0.82, 0.85]);
  dino.add(muzzle);

  // Chin / jaw blend under the muzzle.
  const jaw = mesh(sphere(0.3, 36, 26), bodyMat, "jaw", [1.82, 2.92, 0], [1.15, 0.7, 0.8]);
  dino.add(jaw);

  // ---- Face -------------------------------------------------------------
  const HEAD_C = new THREE.Vector3(1.48, 3.28, 0);
  const HEAD_R = new THREE.Vector3(0.62 * 1.12, 0.62 * 0.95, 0.62 * 0.9);

  /** A point on the head ellipsoid for a direction given in unit-sphere space. */
  const headPoint = (dx: number, dy: number, dz: number) => {
    const d = new THREE.Vector3(dx, dy, dz).normalize();
    return new THREE.Vector3(
      HEAD_C.x + d.x * HEAD_R.x,
      HEAD_C.y + d.y * HEAD_R.y,
      HEAD_C.z + d.z * HEAD_R.z,
    );
  };
  /** Surface normal of the head ellipsoid at a unit-sphere direction. */
  const headNormal = (dx: number, dy: number, dz: number) => {
    const d = new THREE.Vector3(dx, dy, dz).normalize();
    return new THREE.Vector3(
      d.x / HEAD_R.x,
      d.y / HEAD_R.y,
      d.z / HEAD_R.z,
    ).normalize();
  };
  /** Orient a +Z-facing detail so its face points along a surface normal. */
  const faceOut = (obj: THREE.Object3D, normal: THREE.Vector3) => {
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  };

  for (const side of [1, -1] as const) {
    const dir: [number, number, number] = [0.42, 0.6, side * 0.72];
    const normal = headNormal(...dir);
    const p = headPoint(...dir).addScaledVector(normal, 0.02);
    const eye = buildEye(side, p, normal, {
      white: whiteMat,
      iris: irisMat,
      pupil: pupilMat,
      hi: hiMat,
    });
    dino.add(eye);
  }

  // Eyebrows: short curved strokes sitting flush on the brow ridge.
  for (const side of [1, -1] as const) {
    const dir: [number, number, number] = [0.18, 0.86, side * 0.44];
    const normal = headNormal(...dir);
    const p = headPoint(...dir).addScaledVector(normal, 0.005);
    const brow = mesh(
      new THREE.TorusGeometry(0.125, 0.022, 10, 28, Math.PI * 0.78),
      browMat,
      side === 1 ? "brow-left" : "brow-right",
      [p.x, p.y, p.z],
      [1, 1, 1],
      [0, 0, Math.PI * 0.11],
    );
    faceOut(brow, normal);
    // TorusGeometry has no local-Z spin after quaternion alignment, so apply
    // the in-plane arc rotation by pre-rotating the geometry instead.
    brow.geometry.rotateZ(Math.PI * 0.11);
    dino.add(brow);
  }

  // Nostrils on the snout tip.
  for (const side of [1, -1] as const) {
    const n = mesh(sphere(0.048, 16, 12), darkMat, `nostril-${side === 1 ? "left" : "right"}`, [2.3, 3.24, side * 0.15], [1, 0.85, 1]);
    dino.add(n);
  }

  // Pink blush on each cheek — a flat oval pressed onto the head.
  for (const side of [1, -1] as const) {
    const dir: [number, number, number] = [0.42, -0.34, side * 0.62];
    const normal = headNormal(...dir);
    const p = headPoint(...dir).addScaledVector(normal, 0.004);
    const b = mesh(sphere(0.098, 24, 18), blushMat, `blush-${side === 1 ? "left" : "right"}`, [p.x, p.y, p.z], [1.15, 0.9, 0.3]);
    faceOut(b, normal);
    dino.add(b);
  }

  // Smile: a thin arc on each side of the muzzle. TorusGeometry lies in the XY
  // plane, so the arc is rotated to open upward like a smile.
  const smileGeo = new THREE.TorusGeometry(0.17, 0.016, 10, 32, Math.PI * 0.85);
  smileGeo.rotateZ(Math.PI * 1.08);
  for (const side of [1, -1] as const) {
    const smile = mesh(
      smileGeo,
      mouthMat,
      `smile-${side === 1 ? "left" : "right"}`,
      [1.99, 2.99, side * 0.35],
      [1, 1, 1],
      [0, side === 1 ? -0.2 : Math.PI + 0.2, 0],
    );
    dino.add(smile);
  }

  // ---- Spikes -----------------------------------------------------------
  // Head / neck crest: three domes running from the crown down the back of the neck.
  dino.add(spikeDome(0.27, spikeMat, "spike-head-1", [1.28, 3.82, 0]));
  dino.add(spikeDome(0.30, spikeMat, "spike-head-2", [1.02, 3.58, 0]));
  dino.add(spikeDome(0.27, spikeMat, "spike-head-3", [0.88, 3.28, 0]));

  // Back plates: one big dome mid-back, then three shrinking toward the tail.
  dino.add(spikeDome(0.52, spikeMat, "spike-back-1", [-0.05, 1.94, 0], [1.28, 1.15, 0.62]));
  dino.add(spikeDome(0.42, spikeMat, "spike-back-2", [-0.62, 1.86, 0], [1.26, 1.12, 0.6]));
  dino.add(spikeDome(0.33, spikeMat, "spike-back-3", [-1.14, 1.76, 0], [1.22, 1.08, 0.58]));
  dino.add(spikeDome(0.25, spikeMat, "spike-back-4", [-1.6, 1.66, 0], [1.2, 1.05, 0.56]));

  // ---- Spots (both flanks) ----------------------------------------------
  // [x, y, radius, sx, sy] — z is solved from the body ellipsoid so spots hug the surface.
  const spotDefs: Array<[number, number, number, number, number]> = [
    [0.58, 1.48, 0.065, 1, 1],
    [0.38, 1.18, 0.125, 0.85, 1.35],
    [-0.02, 1.08, 0.175, 0.95, 1.45],
    [-0.52, 1.18, 0.135, 0.9, 1.3],
    [-0.92, 1.02, 0.165, 1.0, 1.35],
    [-1.32, 1.08, 0.085, 1.1, 1.0],
    [-1.52, 1.22, 0.05, 1, 1],
  ];
  const BODY_C = new THREE.Vector3(0, 1.08, 0);
  const BODY_R = new THREE.Vector3(1.72, 1.02, 0.96);
  for (const side of [1, -1] as const) {
    for (let i = 0; i < spotDefs.length; i++) {
      const [x, y, r, sx, sy] = spotDefs[i];
      const nx = (x - BODY_C.x) / BODY_R.x;
      const ny = (y - BODY_C.y) / BODY_R.y;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.94;
      const z = side * nz * BODY_R.z;
      const s = mesh(sphere(r, 28, 20), spotMat, `spot-${side === 1 ? "L" : "R"}-${i}`, [x, y, z], [sx, sy, 0.5]);
      // Orient the flattened spot so its thin axis points along the surface normal.
      const normal = new THREE.Vector3(nx, ny, side * nz).normalize();
      faceOut(s, normal);
      // lookAt points +Z outward; our flatten is on Z so this is correct.
      dino.add(s);
    }
  }

  // ---- Tail -------------------------------------------------------------
  // A thick, short tail that sweeps back and curls slightly up, like the toy.
  const tailBase = mesh(sphere(0.5, 40, 28), bodyMat, "tail-base", [-1.68, 1.06, 0], [1.5, 0.72, 0.6]);
  dino.add(tailBase);

  // Built from a chain of overlapping spheres: reliably round and smooth, and it
  // gives the tail the soft, moulded look of the toy.
  const tailSegments = 18;
  for (let i = 0; i < tailSegments; i++) {
    const t = i / (tailSegments - 1);
    const x = THREE.MathUtils.lerp(-1.58, -2.4, t);
    const y = 1.06 + Math.sin(t * Math.PI * 0.58) * 0.4;
    const r = THREE.MathUtils.lerp(0.47, 0.14, Math.pow(t, 0.75));
    dino.add(
      mesh(sphere(r, 26, 18), bodyMat, `tail-${i}`, [x, y, 0], [1.15, 1, 0.94]),
    );
  }

  // ---- Legs + wheels ----------------------------------------------------
  // Short green leg stubs above small blue wheels, like the pull-along toy.
  const wheelGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.13, 32);
  const legGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.42, 20);
  const wheelPositions: Array<[number, number, number]> = [
    [0.95, 0.21, 0.52],
    [0.95, 0.21, -0.52],
    [-0.95, 0.21, 0.52],
    [-0.95, 0.21, -0.52],
  ];
  wheelPositions.forEach(([x, y, z], i) => {
    const wheel = mesh(wheelGeo, wheelMat, `wheel-${i}`, [x, y, z], [1, 1, 1], [Math.PI / 2, 0, 0]);
    dino.add(wheel);
    const leg = mesh(legGeo, bodyMat, `leg-${i}`, [x, 0.48, z * 0.92], [1, 1, 1], [0, 0, 0]);
    dino.add(leg);
  });

  // Center the model so its bounding box sits on the origin (x/z centered, y from 0).
  const box = new THREE.Box3().setFromObject(dino);
  const center = box.getCenter(new THREE.Vector3());
  dino.position.x -= center.x;
  dino.position.z -= center.z;
  dino.position.y -= box.min.y;

  return dino;
}

/** Triangle / vertex counts for the stats panel. */
export function dinoStats(root: THREE.Object3D) {
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  root.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh) {
      meshes++;
      const geo = m.geometry;
      const index = geo.index;
      const pos = geo.attributes.position;
      vertices += pos ? pos.count : 0;
      if (index) triangles += index.count / 3;
      else if (pos) triangles += pos.count / 3;
    }
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  return {
    meshes,
    vertices,
    triangles: Math.round(triangles),
    size: { x: size.x, y: size.y, z: size.z },
  };
}
