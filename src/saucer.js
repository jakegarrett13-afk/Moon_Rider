import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { getTerrainHeight } from './track.js';

const SCALE = 2;
const LEG_HEIGHT = 2.5 * SCALE;

function createLeg(material, from, to, radius) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.3, length, 8), material);
  leg.position.copy(new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5));
  leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  leg.castShadow = true;
  return leg;
}

export function buildSaucer(scene, world, physicsMaterial, x, z) {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: 0x8a8f99, metalness: 0.9, roughness: 0.25 });
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0x2ad4ff,
    metalness: 0.1,
    roughness: 0.1,
    transparent: true,
    opacity: 0.55,
    emissive: 0x0d4a5c,
    emissiveIntensity: 0.7,
  });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.8, roughness: 0.4 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6b0, emissiveIntensity: 1.6 });

  // Hull sits on its own sub-group, raised up on tripod legs rather than
  // resting flush on the ground.
  const hullGroup = new THREE.Group();
  hullGroup.position.y = LEG_HEIGHT;
  group.add(hullGroup);

  // A single lathed profile (rotated around the vertical axis) gives a
  // seamless classic saucer silhouette — flat underbelly, a wide rim,
  // and a tapered crown — without having to align separate hull pieces
  // by hand.
  const profile = [
    new THREE.Vector2(0.0, 0.1),
    new THREE.Vector2(1.5, 0.1),
    new THREE.Vector2(2.6, 0.35),
    new THREE.Vector2(3.2, 0.55),
    new THREE.Vector2(2.8, 0.75),
    new THREE.Vector2(1.4, 1.1),
    new THREE.Vector2(0.7, 1.4),
    new THREE.Vector2(0.0, 1.65),
  ].map((p) => p.multiplyScalar(SCALE));
  const hull = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  hullGroup.add(hull);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.85 * SCALE, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    domeMat
  );
  dome.position.y = 1.25 * SCALE;
  hullGroup.add(dome);

  const lightCount = 12;
  const lightGeo = new THREE.SphereGeometry(0.11 * SCALE, 8, 8);
  for (let i = 0; i < lightCount; i++) {
    const angle = (i / lightCount) * Math.PI * 2;
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.set(Math.cos(angle) * 3.1 * SCALE, 0.55 * SCALE, Math.sin(angle) * 3.1 * SCALE);
    hullGroup.add(light);
  }

  // Tripod landing legs, angled outward from near the hull's underside
  // down to wider foot pads on the ground.
  const footRadius = 4.5 * SCALE;
  const attachRadius = 1.8 * SCALE;
  const attachY = LEG_HEIGHT * 0.92;
  const padGeo = new THREE.CylinderGeometry(0.4 * SCALE, 0.4 * SCALE, 0.16 * SCALE, 10);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const foot = new THREE.Vector3(Math.cos(angle) * footRadius, 0, Math.sin(angle) * footRadius);
    const attach = new THREE.Vector3(Math.cos(angle) * attachRadius, attachY, Math.sin(angle) * attachRadius);
    group.add(createLeg(legMat, foot, attach, 0.16 * SCALE));

    const pad = new THREE.Mesh(padGeo, legMat);
    pad.position.set(foot.x, 0.08 * SCALE, foot.z);
    pad.castShadow = true;
    pad.receiveShadow = true;
    group.add(pad);
  }

  // Solid collider for the hull — a cylinder roughly matching the rim's
  // widest extent. The legs stay decoration-only (thin enough that
  // driving into one shouldn't realistically stop a car), but the car
  // shouldn't be able to drive straight through the hull overhead.
  const hullColliderRadius = 3.2 * SCALE;
  const hullColliderHeight = 1.6 * SCALE;
  const body = new CANNON.Body({ mass: 0, material: physicsMaterial });
  body.addShape(new CANNON.Cylinder(hullColliderRadius, hullColliderRadius, hullColliderHeight, 16));
  const baseY = getTerrainHeight(x, z);
  body.position.set(x, baseY + LEG_HEIGHT + 0.85 * SCALE, z);
  world.addBody(body);

  group.position.set(x, baseY, z);

  scene.add(group);
  return group;
}
