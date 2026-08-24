import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { getTerrainHeight } from './track.js';

const SCALE = 1.5;

function createTube(material, from, to, radius) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
  tube.position.copy(new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5));
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  tube.castShadow = true;
  return tube;
}

function addModule(group, world, material, physicsMaterial, worldOffsetX, worldOffsetY, worldOffsetZ, x, z, radius, height) {
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), material);
  cylinder.position.set(x, height / 2, z);
  cylinder.castShadow = true;
  cylinder.receiveShadow = true;
  group.add(cylinder);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    material
  );
  dome.position.set(x, height, z);
  dome.castShadow = true;
  group.add(dome);

  // Windows band.
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x1a2a33,
    emissive: 0x2ad4ff,
    emissiveIntensity: 0.8,
    metalness: 0.2,
    roughness: 0.3,
  });
  const windowCount = 6;
  for (let i = 0; i < windowCount; i++) {
    const angle = (i / windowCount) * Math.PI * 2;
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5 * SCALE, 0.35 * SCALE, 0.08 * SCALE), windowMat);
    win.position.set(x + Math.cos(angle) * radius, height * 0.55, z + Math.sin(angle) * radius);
    win.rotation.y = -angle;
    group.add(win);
  }

  // Solid collider — a cylinder spanning the module (dome included is
  // overkill; the straight body is enough to stop the car like a wall).
  const body = new CANNON.Body({ mass: 0, material: physicsMaterial });
  body.addShape(new CANNON.Cylinder(radius, radius, height, 16));
  body.position.set(worldOffsetX + x, worldOffsetY + height / 2, worldOffsetZ + z);
  world.addBody(body);

  return { x, z, radius, height };
}

export function buildLunarBase(scene, world, physicsMaterial, x, z) {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({ color: 0xd8d6d0, metalness: 0.3, roughness: 0.55 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.8, roughness: 0.4 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x0d1a2e, metalness: 0.6, roughness: 0.25 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffb347, emissiveIntensity: 1.5 });
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1.8 });

  const baseY = getTerrainHeight(x, z);

  const central = addModule(group, world, hullMat, physicsMaterial, x, baseY, z, 0, 0, 3.2 * SCALE, 2.4 * SCALE);
  const podA = addModule(group, world, hullMat, physicsMaterial, x, baseY, z, -7 * SCALE, 2 * SCALE, 1.8 * SCALE, 1.8 * SCALE);
  const podB = addModule(group, world, hullMat, physicsMaterial, x, baseY, z, 6.5 * SCALE, -4.5 * SCALE, 1.6 * SCALE, 1.6 * SCALE);

  const connectorHeight = 1.0 * SCALE;
  group.add(
    createTube(
      trimMat,
      new THREE.Vector3(central.x, connectorHeight, central.z),
      new THREE.Vector3(podA.x, connectorHeight, podA.z),
      0.55 * SCALE
    )
  );
  group.add(
    createTube(
      trimMat,
      new THREE.Vector3(central.x, connectorHeight, central.z),
      new THREE.Vector3(podB.x, connectorHeight, podB.z),
      0.55 * SCALE
    )
  );

  // Solar panel arrays on angled struts.
  const panelGeo = new THREE.BoxGeometry(3.4 * SCALE, 0.12 * SCALE, 2.0 * SCALE);
  const strutGeo = new THREE.CylinderGeometry(0.12 * SCALE, 0.12 * SCALE, 1.6 * SCALE, 8);
  for (const px of [10 * SCALE, 13.5 * SCALE]) {
    const strut = new THREE.Mesh(strutGeo, trimMat);
    strut.position.set(px, 0.8 * SCALE, -9 * SCALE);
    strut.castShadow = true;
    group.add(strut);

    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(px, 1.9 * SCALE, -9.3 * SCALE);
    panel.rotation.x = -0.55;
    panel.castShadow = true;
    group.add(panel);
  }

  // Comms antenna mounted on the central dome.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * SCALE, 0.1 * SCALE, 2.6 * SCALE, 8), trimMat);
  mast.position.set(0, central.height + 1.3 * SCALE, 0);
  mast.castShadow = true;
  group.add(mast);

  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.7 * SCALE, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.3),
    hullMat
  );
  dish.position.set(0, central.height + 2.5 * SCALE, 0);
  dish.rotation.x = Math.PI + 0.6;
  dish.castShadow = true;
  group.add(dish);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12 * SCALE, 8, 8), beaconMat);
  beacon.position.set(0, central.height + 2.65 * SCALE, 0);
  group.add(beacon);

  // Perimeter marker lights.
  const perimeterRadius = 13 * SCALE;
  const perimeterCount = 6;
  for (let i = 0; i < perimeterCount; i++) {
    const angle = (i / perimeterCount) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * SCALE, 0.06 * SCALE, 0.9 * SCALE, 6), trimMat);
    post.position.set(Math.cos(angle) * perimeterRadius, 0.45 * SCALE, Math.sin(angle) * perimeterRadius);
    group.add(post);

    const light = new THREE.Mesh(new THREE.SphereGeometry(0.14 * SCALE, 8, 8), lightMat);
    light.position.set(Math.cos(angle) * perimeterRadius, 0.9 * SCALE, Math.sin(angle) * perimeterRadius);
    group.add(light);
  }

  group.position.set(x, baseY, z);

  scene.add(group);
  return group;
}
