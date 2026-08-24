import * as THREE from 'three';
import { getTerrainHeight } from './track.js';

const CAPTURE_RADIUS = 2.2;

export class Alien {
  constructor(scene, x, z) {
    this.x = x;
    this.z = z;
    this.captured = false;
    this.time = Math.random() * Math.PI * 2;

    const group = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x6fdc6f,
      metalness: 0.1,
      roughness: 0.4,
      emissive: 0x113311,
      emissiveIntensity: 0.3,
    });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.6, roughness: 0.2 });

    // Legs: thin capsules, feet resting at y = 0.
    const legGeo = new THREE.CapsuleGeometry(0.05, 0.3, 4, 8);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, skinMat);
      leg.position.set(side * 0.09, 0.2, 0);
      leg.castShadow = true;
      group.add(leg);
    }

    // Slender torso sitting on top of the legs.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.28, 4, 8), skinMat);
    torso.position.y = 0.7;
    torso.castShadow = true;
    group.add(torso);

    // Thin arms, angled slightly out from the shoulders.
    const armGeo = new THREE.CapsuleGeometry(0.045, 0.32, 4, 8);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, skinMat);
      arm.position.set(side * 0.24, 0.62, 0);
      arm.rotation.z = side * 0.2;
      arm.castShadow = true;
      group.add(arm);
    }

    // Short neck connecting the torso to the oversized cranium.
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.14, 10), skinMat);
    neck.position.y = 1.02;
    neck.castShadow = true;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), skinMat);
    head.scale.set(1, 1.2, 0.88);
    head.position.y = 1.22;
    head.castShadow = true;
    group.add(head);

    const eyeGeo = new THREE.SphereGeometry(0.14, 12, 12);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.scale.set(0.9, 0.55, 0.5);
      eye.position.set(side * 0.16, 1.2, 0.24);
      eye.rotation.y = side * 0.35;
      group.add(eye);
    }

    // Glowing ring on the ground to help the player spot it from afar.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.75, 32),
      new THREE.MeshBasicMaterial({ color: 0x66ffaa, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);

    this.baseY = getTerrainHeight(x, z);
    group.position.set(x, this.baseY, z);

    scene.add(group);
    this.mesh = group;
    this.ring = ring;
  }

  update(dt, carPosition) {
    if (this.captured) return false;

    this.time += dt;
    this.mesh.position.y = this.baseY + 0.15 + Math.sin(this.time * 2) * 0.1;
    this.mesh.rotation.y += dt * 0.8;
    this.ring.material.opacity = 0.4 + Math.sin(this.time * 3) * 0.2;

    const dx = carPosition.x - this.x;
    const dz = carPosition.z - this.z;
    if (Math.sqrt(dx * dx + dz * dz) < CAPTURE_RADIUS) {
      this.captured = true;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }
}
