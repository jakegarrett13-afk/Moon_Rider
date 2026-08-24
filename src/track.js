import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// The map is 10x the linear scale of the original — ground, walls, and
// every crater/hill's position, radius, and depth/height are scaled by
// MAP_SCALE, so the moonscape looks proportionally identical, just far
// bigger and more dramatic. The car and alien are untouched (their own
// files).
const MAP_SCALE = 10;

const GROUND_SIZE = 80 * MAP_SCALE;
// The visual ground mesh is a grid of flat triangles that linearly
// interpolates between vertices — it doesn't actually curve the way the
// crater/hill math does. At full 10x depth/height, a coarse grid left a
// visible gap between where the car (positioned by the exact math) sat
// and where the mesh appeared to be between grid points, so the car
// looked like it was sinking into — or floating above — the surface.
// This many segments keeps that gap under ~3% of the car's own height
// even at the deepest crater, which reads as seamless.
const SEGMENTS = 400;

// Impact craters baked into the terrain: a smooth bowl down to -depth at
// the center, tapering back to 0 at the rim, plus a small raised lip
// just past the rim (real craters throw material outward and up).
const CRATERS = [
  { x: 6, z: 10, radius: 4, depth: 0.6 },
  { x: -7, z: 14, radius: 3, depth: 0.45 },
  { x: -9, z: -6, radius: 3.5, depth: 0.5 },
  { x: 8, z: -14, radius: 3, depth: 0.4 },
  { x: 0, z: -20, radius: 4.5, depth: 0.65 },
  { x: -4, z: 4, radius: 2.5, depth: 0.35 },
].map((c) => ({ x: c.x * MAP_SCALE, z: c.z * MAP_SCALE, radius: c.radius * MAP_SCALE, depth: c.depth * MAP_SCALE }));

// Jump hills: smooth domes rising to +height at the center and tapering
// back to 0 at the rim. Symmetric, so they work as a launch ramp from
// any approach direction — the car separates from the ground on its own
// once the descending far side drops away faster than gravity alone
// would carry it down (see the grounded/airborne check in Car.update).
const HILLS = [
  { x: 10, z: 2, radius: 3, height: 1.0 },
  { x: -10, z: -14, radius: 3, height: 0.9 },
  { x: 2, z: 22, radius: 3, height: 0.85 },
].map((h) => ({ x: h.x * MAP_SCALE, z: h.z * MAP_SCALE, radius: h.radius * MAP_SCALE * 0.9, height: h.height * MAP_SCALE * 0.9 }));

function craterProfile(d, radius, depth) {
  const t = d / radius;
  if (t > 1.5) return 0;
  if (t <= 1) {
    return -depth * (Math.cos(t * Math.PI) * 0.5 + 0.5);
  }
  const t2 = (t - 1) / 0.5;
  return depth * 0.18 * Math.sin(t2 * Math.PI);
}

function bumpProfile(d, radius, height) {
  const t = d / radius;
  if (t > 1) return 0;
  return height * (Math.cos(t * Math.PI) * 0.5 + 0.5);
}

export function getTerrainHeight(x, z) {
  let h = 0;
  for (const c of CRATERS) {
    const dx = x - c.x;
    const dz = z - c.z;
    h += craterProfile(Math.sqrt(dx * dx + dz * dz), c.radius, c.depth);
  }
  for (const b of HILLS) {
    const dx = x - b.x;
    const dz = z - b.z;
    h += bumpProfile(Math.sqrt(dx * dx + dz * dz), b.radius, b.height);
  }
  return h;
}

// Whether (x, z) is near enough to a jump hill that going airborne
// there is intentional. Car.update uses this so craters (which can
// descend just as steeply) always stay glued to the surface instead of
// false-triggering the same "outran gravity" launch logic.
export function isNearHill(x, z) {
  for (const h of HILLS) {
    const dx = x - h.x;
    const dz = z - h.z;
    if (Math.sqrt(dx * dx + dz * dz) < h.radius * 1.2) return true;
  }
  return false;
}

function createRegolithTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#9a9490';
  ctx.fillRect(0, 0, size, size);

  // Soft mottled blotches — broad tonal variation in the regolith.
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 90;
    const light = Math.random() > 0.5;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, light ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Small craterlets — tiny dark bowl with a faint raised rim, much
  // smaller than the physics craters, purely surface detail.
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 14;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r * 1.25, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = r * 0.25;
    ctx.stroke();
  }

  // Fine grain for regolith grit.
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shade = Math.random() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10 * MAP_SCALE, 10 * MAP_SCALE);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addBox(scene, world, material, { size, position, rotationY = 0, color = 0x716d67 }) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.05 })
  );
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);

  const shape = new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2));
  const body = new CANNON.Body({ mass: 0, shape, material });
  body.position.set(...position);
  body.quaternion.setFromEuler(0, rotationY, 0);
  world.addBody(body);

  return { mesh, body };
}

function buildTerrain(scene, world, groundMaterial) {
  const planeGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, SEGMENTS, SEGMENTS);
  const posAttr = planeGeo.attributes.position;
  for (let k = 0; k < posAttr.count; k++) {
    const px = posAttr.getX(k);
    const py = posAttr.getY(k);
    // Plane is rotated -90° about X to lie flat, which maps local
    // (x, y) to world (x, -y) — match that here so a displaced vertex
    // ends up over the same world x/z its height was sampled at.
    posAttr.setZ(k, getTerrainHeight(px, -py));
  }
  posAttr.needsUpdate = true;
  planeGeo.computeVertexNormals();

  const regolithTexture = createRegolithTexture();
  const groundMesh = new THREE.Mesh(
    planeGeo,
    new THREE.MeshStandardMaterial({
      map: regolithTexture,
      bumpMap: regolithTexture,
      bumpScale: 0.15,
      roughness: 1,
      metalness: 0,
    })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // The car doesn't actually collide with crater geometry — it samples
  // getTerrainHeight() directly each frame (see Car.update) to follow the
  // surface. A heightfield collision shape here decomposes into many
  // small convex "pillar" pieces, and a box the size of the car spans
  // several at once, generating many simultaneous contacts that made
  // driving feel like the ground had turned to glue. A flat plane still
  // gives the walls something to rest on and acts as a physics floor.
  const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);
}

export function buildTrack(scene, world, groundMaterial) {
  buildTerrain(scene, world, groundMaterial);

  // Height stays at the original scale — a 10x-tall wall towered over
  // the car way more than the bigger map warranted. Everything else
  // (position/length/thickness) still scales with the map.
  const wallHeight = 2;
  const wallThickness = 1 * MAP_SCALE;
  const wallSpanLong = 60 * MAP_SCALE;
  const wallSpanShort = 30 * MAP_SCALE;
  const wallOffsetX = 15 * MAP_SCALE;
  const wallOffsetZ = 30 * MAP_SCALE;

  // Boundary walls
  addBox(scene, world, groundMaterial, { size: [wallThickness, wallHeight, wallSpanLong], position: [-wallOffsetX, wallHeight / 2, 0] });
  addBox(scene, world, groundMaterial, { size: [wallThickness, wallHeight, wallSpanLong], position: [wallOffsetX, wallHeight / 2, 0] });
  addBox(scene, world, groundMaterial, { size: [wallSpanShort, wallHeight, wallThickness], position: [0, wallHeight / 2, -wallOffsetZ] });
  addBox(scene, world, groundMaterial, { size: [wallSpanShort, wallHeight, wallThickness], position: [0, wallHeight / 2, wallOffsetZ] });

  // Car/alien size is unchanged, so ride height stays 1 regardless of map scale.
  return {
    spawnPosition: new CANNON.Vec3(0, 1, 0),
  };
}
