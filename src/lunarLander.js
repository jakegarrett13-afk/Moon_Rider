import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { getTerrainHeight } from './track.js';

const SCALE = 1.2;
const DESCENT_HEIGHT = 1.9 * SCALE;
const DESCENT_RADIUS = 1.9 * SCALE;
const LEG_SPAN = 4.2 * SCALE;

function createStrut(material, from, to, radius) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const strut = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  strut.position.copy(new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5));
  strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  strut.castShadow = true;
  return strut;
}

function buildLander(x, z, baseY, group) {
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9962c, metalness: 0.6, roughness: 0.5 });
  const foilMat = new THREE.MeshStandardMaterial({ color: 0xe4e0d6, metalness: 0.3, roughness: 0.4 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x24262a, metalness: 0.7, roughness: 0.4 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, metalness: 0.5, roughness: 0.5 });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x0b1a22,
    emissive: 0x2ad4ff,
    emissiveIntensity: 0.5,
    metalness: 0.2,
    roughness: 0.2,
  });

  // Descent stage: an octagonal drum (approximated with a low-segment
  // cylinder) wrapped in gold foil, with the descent engine bell
  // poking out underneath.
  const descentGroup = new THREE.Group();
  descentGroup.position.y = DESCENT_HEIGHT / 2;
  group.add(descentGroup);

  const descent = new THREE.Mesh(
    new THREE.CylinderGeometry(DESCENT_RADIUS, DESCENT_RADIUS, DESCENT_HEIGHT, 8),
    goldMat
  );
  descent.castShadow = true;
  descent.receiveShadow = true;
  descentGroup.add(descent);

  const engineBell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25 * SCALE, 0.55 * SCALE, 0.9 * SCALE, 12),
    darkMat
  );
  engineBell.position.y = -DESCENT_HEIGHT / 2 - 0.35 * SCALE;
  engineBell.castShadow = true;
  descentGroup.add(engineBell);

  // Ascent stage sits on top, smaller and boxier, wrapped in silver foil.
  const ascent = new THREE.Mesh(
    new THREE.BoxGeometry(1.7 * SCALE, 1.5 * SCALE, 1.9 * SCALE),
    foilMat
  );
  ascent.position.y = DESCENT_HEIGHT + 0.75 * SCALE;
  ascent.castShadow = true;
  ascent.receiveShadow = true;
  group.add(ascent);

  const cockpitWindowGeo = new THREE.BoxGeometry(0.4 * SCALE, 0.4 * SCALE, 0.05 * SCALE);
  for (const wx of [-0.45, 0.45]) {
    const win = new THREE.Mesh(cockpitWindowGeo, windowMat);
    win.position.set(wx * SCALE, DESCENT_HEIGHT + 1.0 * SCALE, 0.95 * SCALE);
    group.add(win);
  }

  // Forward docking port + probe antenna.
  const dockingPort = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35 * SCALE, 0.35 * SCALE, 0.3 * SCALE, 12),
    darkMat
  );
  dockingPort.rotation.x = Math.PI / 2;
  dockingPort.position.set(0, DESCENT_HEIGHT + 1.35 * SCALE, 0.85 * SCALE);
  group.add(dockingPort);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * SCALE, 0.03 * SCALE, 1.1 * SCALE, 6), darkMat);
  antenna.position.set(0, DESCENT_HEIGHT + 1.9 * SCALE, 0.85 * SCALE);
  antenna.rotation.x = -0.5;
  group.add(antenna);

  // Egress ladder down the front leg's strut line.
  const ladderRungGeo = new THREE.BoxGeometry(0.22 * SCALE, 0.03 * SCALE, 0.03 * SCALE);
  for (let i = 0; i < 5; i++) {
    const rung = new THREE.Mesh(ladderRungGeo, legMat);
    rung.position.set(0, 0.3 * SCALE + i * 0.32 * SCALE, DESCENT_RADIUS + 0.05 * SCALE);
    group.add(rung);
  }

  // Four splayed landing legs with round footpads.
  const footGeo = new THREE.CylinderGeometry(0.45 * SCALE, 0.45 * SCALE, 0.12 * SCALE, 12);
  const attachY = DESCENT_HEIGHT * 0.85;
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const foot = new THREE.Vector3(Math.cos(angle) * LEG_SPAN, 0, Math.sin(angle) * LEG_SPAN);
    const attach = new THREE.Vector3(
      Math.cos(angle) * DESCENT_RADIUS * 0.9,
      attachY,
      Math.sin(angle) * DESCENT_RADIUS * 0.9
    );
    group.add(createStrut(legMat, foot, attach, 0.09 * SCALE));
    group.add(createStrut(legMat, foot.clone().multiplyScalar(0.55).setY(attachY * 0.4), attach, 0.07 * SCALE));

    const pad = new THREE.Mesh(footGeo, legMat);
    pad.position.set(foot.x, 0.06 * SCALE, foot.z);
    pad.castShadow = true;
    pad.receiveShadow = true;
    group.add(pad);
  }

  return { colliderRadius: DESCENT_RADIUS * 1.05, colliderHeight: DESCENT_HEIGHT, colliderCenterY: DESCENT_HEIGHT / 2 };
}

function createFlagTexture() {
  const width = 600;
  const height = 316;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const stripeCount = 13;
  const stripeHeight = height / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#b22234' : '#ffffff';
    ctx.fillRect(0, i * stripeHeight, width, stripeHeight);
  }

  const cantonWidth = width * 0.42;
  const cantonHeight = stripeHeight * 7;
  ctx.fillStyle = '#3c3b6e';
  ctx.fillRect(0, 0, cantonWidth, cantonHeight);

  ctx.fillStyle = '#ffffff';
  const rows = 6;
  const cols = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offsetX = r % 2 === 0 ? 0 : cantonWidth / (cols * 2);
      const sx = (cantonWidth / cols) * (c + 0.5) + offsetX;
      const sy = (cantonHeight / rows) * (r + 0.5);
      if (sx > cantonWidth - 6) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildFlagMesh(material) {
  const width = 1.5;
  const height = 0.9;
  const geometry = new THREE.PlaneGeometry(width, height, 14, 8);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const distFromPole = (px + width / 2) / width;
    const wave = Math.sin(distFromPole * Math.PI * 2.4 + 1.1) * 0.07 * distFromPole;
    const droop = -distFromPole * distFromPole * 0.08;
    pos.setZ(i, wave);
    pos.setY(i, py + droop);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.x = width / 2;
  mesh.castShadow = true;
  return mesh;
}

function buildFlag(group, offsetX, offsetZ) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.7, roughness: 0.4 });
  const flagMat = new THREE.MeshStandardMaterial({
    map: createFlagTexture(),
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
  });

  const poleHeight = 2.3;
  const flagGroup = new THREE.Group();
  flagGroup.position.set(offsetX, 0, offsetZ);
  group.add(flagGroup);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, poleHeight, 8), poleMat);
  pole.position.y = poleHeight / 2;
  pole.castShadow = true;
  flagGroup.add(pole);

  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), poleMat);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0.75, poleHeight - 0.08, 0);
  crossbar.castShadow = true;
  flagGroup.add(crossbar);

  const flagMesh = buildFlagMesh(flagMat);
  flagMesh.position.y = poleHeight - 0.08 - 0.45;
  flagGroup.add(flagMesh);

  return { poleHeight };
}

export function buildLunarLander(scene, world, physicsMaterial, x, z) {
  const baseY = getTerrainHeight(x, z);
  const group = new THREE.Group();

  const { colliderRadius, colliderHeight, colliderCenterY } = buildLander(x, z, baseY, group);
  buildFlag(group, LEG_SPAN + 1.6, 0);

  group.position.set(x, baseY, z);
  scene.add(group);

  // Solid collider for the descent stage only — legs and the flag stay
  // decoration-only, thin enough that driving into one shouldn't
  // realistically stop a car.
  const body = new CANNON.Body({ mass: 0, material: physicsMaterial });
  body.addShape(new CANNON.Cylinder(colliderRadius, colliderRadius, colliderHeight, 8));
  body.position.set(x, baseY + colliderCenterY, z);
  world.addBody(body);

  return group;
}
