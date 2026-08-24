import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Car } from './car.js';
import { buildTrack } from './track.js';
import { InputController } from './input.js';
import { Alien } from './alien.js';
import { buildSaucer } from './saucer.js';
import { buildLunarBase } from './lunarBase.js';

const canvas = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Far plane covers the diagonal of the (now 10x larger) map with room
// to spare, so the far walls/terrain don't clip out at a distance.
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

// No atmosphere on the moon: low ambient fill (only what a lunar module
// or the ground itself would bounce back) and a single harsh, unfiltered
// "sun" casting hard shadows.
const ambientLight = new THREE.AmbientLight(0x404050, 0.35);
scene.add(ambientLight);

// Fixed offset from the car rather than a fixed world position: with a
// map this large, a shadow frustum sized to cover the whole ground would
// have to spread its resolution paper-thin. Keeping the frustum small
// and re-centering it on the car every frame (see updateSunLight below)
// stays crisp regardless of where on the map you are.
const SUN_OFFSET = new THREE.Vector3(20, 30, 10);
const sunLight = new THREE.DirectionalLight(0xfff6e8, 1.4);
sunLight.position.copy(SUN_OFFSET);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -50;
sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50;
sunLight.shadow.camera.bottom = -50;
scene.add(sunLight);
scene.add(sunLight.target);

function buildStarfield() {
  const starCount = 1500;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const radius = 150 + Math.random() * 100;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.9); // keep stars above the horizon
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: false });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return points;
}

// Recentered on the camera every frame (see animate) — like a skybox,
// so it still reads as an infinitely distant backdrop no matter how far
// the car roams across the (now much larger) map.
const starfield = buildStarfield();

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -3, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = false;

const groundMaterial = new CANNON.Material('ground');
const carMaterial = new CANNON.Material('car');
// Near-zero friction: the car's forward speed is driven directly in
// Car.update(), so ground friction only needs to exist to avoid an
// unnaturally icy feel when bumping into walls, not to grip the road.
world.addContactMaterial(
  new CANNON.ContactMaterial(groundMaterial, carMaterial, {
    friction: 0.01,
    restitution: 0.05,
  })
);

const { spawnPosition } = buildTrack(scene, world, groundMaterial);
const car = new Car(world, scene, carMaterial, spawnPosition);
const input = new InputController();

buildSaucer(scene, world, groundMaterial, 103.7, 238.3);
buildLunarBase(scene, world, groundMaterial, -110.4, -256.6);

// Scattered across the map, clear of spawn and the boundary walls. One
// sits right under the flying saucer.
const ALIEN_POSITIONS = [
  [103.7, 238.3],
  [-70, 90],
  [100, 70],
  [-110, -110],
  [70, -180],
  [-130, 30],
  [30, 160],
  [-40, -230],
  [120, 160],
  [-90, 210],
  [20, -260],
  [130, -30],
  [-130, -240],
];
const aliens = ALIEN_POSITIONS.map(([x, z]) => new Alien(scene, x, z));
let capturedCount = 0;

const hudKeys = document.getElementById('hud-keys');
const hudSpeed = document.getElementById('hud-speed');
const capturePopup = document.getElementById('capture-popup');
const introPopup = document.getElementById('intro-popup');
const winPopup = document.getElementById('win-popup');
const alienCounter = document.getElementById('alien-counter');

alienCounter.textContent = `Aliens: ${capturedCount} / ${aliens.length}`;

introPopup.classList.add('show');
setTimeout(() => introPopup.classList.remove('show'), 4000);

function showCapturePopup() {
  capturePopup.classList.add('show');
  setTimeout(() => capturePopup.classList.remove('show'), 2500);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const cameraOffset = new THREE.Vector3(0, 3.5, 7);
const cameraTarget = new THREE.Vector3();

function updateSunLight() {
  sunLight.position.set(
    car.mesh.position.x + SUN_OFFSET.x,
    SUN_OFFSET.y,
    car.mesh.position.z + SUN_OFFSET.z
  );
  sunLight.target.position.set(car.mesh.position.x, 0, car.mesh.position.z);
}

function updateCamera() {
  // Follow the car's yaw (facing direction) only, not its visual
  // pitch/roll tilt over terrain — otherwise every bump/crater wobble
  // gets picked up and amplified by the camera trailing behind it.
  const offset = cameraOffset.clone().applyQuaternion(car.body.quaternion);
  const desiredPosition = car.mesh.position.clone().add(offset);
  camera.position.lerp(desiredPosition, 0.08);

  cameraTarget.lerp(car.mesh.position, 0.2);
  camera.lookAt(cameraTarget.x, cameraTarget.y + 0.5, cameraTarget.z);
}

const clock = new THREE.Clock();

function animate() {
  const delta = Math.min(clock.getDelta(), 0.1);

  world.step(1 / 60, delta, 5);
  car.update(input.state, delta);

  if (car.body.position.y < -10) {
    car.reset(spawnPosition);
  }

  for (const alien of aliens) {
    if (alien.update(delta, car.body.position)) {
      capturedCount++;
      alienCounter.textContent = `Aliens: ${capturedCount} / ${aliens.length}`;
      if (capturedCount === aliens.length) {
        winPopup.classList.add('show');
      } else {
        showCapturePopup();
      }
    }
  }

  updateCamera();
  updateSunLight();
  starfield.position.copy(camera.position);

  hudKeys.textContent = `forward: ${input.state.forward} back: ${input.state.backward} left: ${input.state.left} right: ${input.state.right}`;
  hudSpeed.textContent = `speed: ${car.body.velocity.length().toFixed(2)} pos: ${car.body.position.x.toFixed(1)}, ${car.body.position.y.toFixed(1)}, ${car.body.position.z.toFixed(1)} | grounded: ${car.debugIsGrounded} airborne: ${car.debugCanLaunch} groundY: ${car.debugGroundY.toFixed(2)} vy: ${car.body.velocity.y.toFixed(2)}`;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
