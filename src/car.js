import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { getTerrainHeight, isNearHill } from './track.js';

const CAR_WIDTH = 0.9;
const CAR_HEIGHT = 0.4;
const CAR_LENGTH = 1.6;
const RIDE_HEIGHT = CAR_HEIGHT / 2;

const HALF_TRACK = 0.52;
const WHEEL_Y = -0.16;
const FRONT_AXLE_Z = -0.62;
const REAR_AXLE_Z = 0.62;
const MAX_WHEEL_STEER_ANGLE = 0.5;
const AIR_STEER_FACTOR = 0.35;
// Extra downward pull applied only while airborne, on top of whatever
// the world's (moon-low) gravity already provides. Hills are tall
// enough now that weak gravity alone let the car glide for a long,
// exaggerated stretch before catching up with the dropping terrain —
// this keeps hills looking dramatic without hang time feeling absurd.
const EXTRA_AIR_GRAVITY = 9;
// Safety net: no legitimate hop should ever take this long. If the car
// somehow ends up marked airborne indefinitely (e.g. it stops making
// forward progress while still inside a hill's "near" zone), force a
// landing rather than leaving it stuck floating forever.
const MAX_AIRBORNE_TIME = 2.5;
// While grounded, the car's Y position is kinematically snapped to the
// terrain height every frame — there's no physical limit on how fast
// that's allowed to rise. On a steep hill, (horizontal speed * slope)
// can demand a climb rate no real car could achieve, which reads as
// the car getting instantly launched straight up like a catapult
// rather than driving up an incline. This caps how fast the car is
// allowed to climb (or drop) per second while grounded.
const MAX_CLIMB_RATE = 14;

const TILT_SAMPLE_DIST = 0.9;
const MAX_TILT = 0.4;

export class Car {
  constructor(world, scene, material, position) {
    const shape = new CANNON.Box(
      new CANNON.Vec3(CAR_WIDTH / 2, CAR_HEIGHT / 2, CAR_LENGTH / 2)
    );

    this.body = new CANNON.Body({
      mass: 25,
      shape,
      position,
      material,
      linearDamping: 0.05,
      angularDamping: 0.9,
    });

    // Keep the chassis upright (yaw only) — a simplified arcade feel
    // where the car never tumbles or flips.
    this.body.angularFactor.set(0, 1, 0);

    world.addBody(this.body);

    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcc1122, metalness: 0.7, roughness: 0.3 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x0d0f14, metalness: 0.9, roughness: 0.15 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.5, roughness: 0.5 });
    const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 1.2 });
    const taillightMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff0000, emissiveIntensity: 1 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.9, roughness: 0.25 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 1.85), bodyMat);
    chassis.position.set(0, -0.05, 0);
    chassis.castShadow = true;
    group.add(chassis);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.6), bodyMat);
    hood.position.set(0, 0.05, -0.75);
    hood.rotation.x = -0.15;
    hood.castShadow = true;
    group.add(hood);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.3, 0.75), cabinMat);
    cabin.position.set(0, 0.14, 0.15);
    cabin.rotation.x = -0.1;
    cabin.castShadow = true;
    group.add(cabin);

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.18), trimMat);
    spoiler.position.set(0, 0.32, 0.85);
    spoiler.castShadow = true;
    group.add(spoiler);

    const strutGeo = new THREE.BoxGeometry(0.04, 0.15, 0.04);
    for (const x of [-0.35, 0.35]) {
      const strut = new THREE.Mesh(strutGeo, trimMat);
      strut.position.set(x, 0.2, 0.85);
      group.add(strut);
    }

    const skirtGeo = new THREE.BoxGeometry(0.06, 0.06, 1.7);
    for (const x of [-0.485, 0.485]) {
      const skirt = new THREE.Mesh(skirtGeo, trimMat);
      skirt.position.set(x, -0.14, 0);
      group.add(skirt);
    }

    const headlightGeo = new THREE.BoxGeometry(0.12, 0.08, 0.05);
    for (const x of [-0.32, 0.32]) {
      const headlight = new THREE.Mesh(headlightGeo, headlightMat);
      headlight.position.set(x, -0.02, -1.0);
      group.add(headlight);
    }

    const taillightGeo = new THREE.BoxGeometry(0.12, 0.06, 0.05);
    for (const x of [-0.32, 0.32]) {
      const taillight = new THREE.Mesh(taillightGeo, taillightMat);
      taillight.position.set(x, -0.02, 0.9);
      group.add(taillight);
    }

    const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 16);
    const rimGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 12);

    this.wheelMeshes = [];
    this.frontWheelPivots = [];

    const wheelOffsets = [
      { x: HALF_TRACK, z: FRONT_AXLE_Z, front: true },
      { x: -HALF_TRACK, z: FRONT_AXLE_Z, front: true },
      { x: HALF_TRACK, z: REAR_AXLE_Z, front: false },
      { x: -HALF_TRACK, z: REAR_AXLE_Z, front: false },
    ];

    for (const { x, z, front } of wheelOffsets) {
      // Front wheels get their own pivot so steering (yaw) and rolling
      // spin can be animated independently.
      const pivot = new THREE.Group();
      pivot.position.set(x, WHEEL_Y, z);
      group.add(pivot);

      const wheel = new THREE.Mesh(wheelGeo, tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      pivot.add(wheel);

      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      rim.position.x = x > 0 ? 0.1 : -0.1;
      pivot.add(rim);

      this.wheelMeshes.push(wheel);
      if (front) this.frontWheelPivots.push(pivot);
    }

    scene.add(group);
    this.mesh = group;

    this.acceleration = 20;
    this.reverseFactor = 0.5;
    this.maxSpeed = 25;
    this.steerSpeed = 2.88;

    // Smoothed visual pitch/roll — purely cosmetic tilt from the
    // terrain slope under the car, layered on top of the (yaw-only)
    // physics orientation so bumps and craters actually read as 3D
    // terrain instead of the chassis gliding over them dead level.
    this.pitch = 0;
    this.roll = 0;
    this.airborneTime = 0;
    this.isAirborne = false;
  }

  reset(position) {
    this.body.position.copy(position);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.quaternion.set(0, 0, 0, 1);
    this.pitch = 0;
    this.roll = 0;
    this.airborneTime = 0;
    this.isAirborne = false;
  }

  update(input, dt) {
    const forward = new CANNON.Vec3(0, 0, -1);
    this.body.quaternion.vmult(forward, forward);

    const velocity = this.body.velocity;
    let forwardSpeed = velocity.dot(forward);

    let throttle = 0;
    if (input.forward) throttle += 1;
    if (input.backward) throttle -= this.reverseFactor;

    const targetSpeed = throttle * this.maxSpeed;
    const maxDelta = this.acceleration * dt;
    if (targetSpeed > forwardSpeed) {
      forwardSpeed = Math.min(forwardSpeed + maxDelta, targetSpeed);
    } else if (targetSpeed < forwardSpeed) {
      forwardSpeed = Math.max(forwardSpeed - maxDelta, targetSpeed);
    }

    let steer = 0;
    if (input.left) steer += 1;
    if (input.right) steer -= 1;

    // Grounded vs. airborne: if the physics-integrated position is still
    // above the terrain, the ground has dropped away faster than gravity
    // alone is carrying the car down. Only treat that as an intentional
    // launch near a jump hill — craters can descend just as steeply, and
    // with gravity this low (moon-like) they'd false-trigger the same
    // "outran gravity" condition and leave the car gliding above the
    // bowl instead of following it down.
    //
    // Once a launch actually starts, `isAirborne` stays true (sticky)
    // until the car naturally falls back to the terrain — it does NOT
    // re-check "is this still near the hill?" every frame. Re-checking
    // that meant a car whose flight carried it past the hill's declared
    // zone while still high up got instantly snapped down onto whatever
    // (much lower) terrain was at its new position — a teleport/clip,
    // not a landing.
    const groundY = getTerrainHeight(this.body.position.x, this.body.position.z) + RIDE_HEIGHT;

    if (!this.isAirborne && isNearHill(this.body.position.x, this.body.position.z) && this.body.position.y > groundY) {
      this.isAirborne = true;
    }
    if (this.isAirborne && this.body.position.y <= groundY) {
      this.isAirborne = false;
    }
    const isGrounded = !this.isAirborne;

    if (isGrounded) {
      this.airborneTime = 0;
    } else {
      this.airborneTime += dt;
    }
    // Past the safety-net duration, fall hard instead of teleporting:
    // forcing isGrounded straight to true here would have snapped the
    // car's position instantly down to the terrain from wherever it
    // still was, which reads as an abrupt glitch rather than a landing.
    // Multiplying gravity instead lets it close the gap quickly through
    // normal falling motion, so it still resolves via the usual (small,
    // unnoticeable) landing snap once it naturally reaches groundY.
    const airGravityMultiplier = this.airborneTime > MAX_AIRBORNE_TIME ? 8 : 1;

    // Exposed for the HUD debug readout only.
    this.debugGroundY = groundY;
    this.debugCanLaunch = this.isAirborne;
    this.debugIsGrounded = isGrounded;

    // Only turn while rolling (like real front-wheel steering), and
    // rotate the chassis immediately so we can re-align velocity to
    // the new heading in this same frame. Doing that a frame late is
    // what made the car feel like it was sliding instead of steering.
    const speedFactor = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / (this.maxSpeed * 0.15), 0, 1);
    const direction = forwardSpeed < 0 ? -1 : 1;
    const steerAuthority = isGrounded ? 1 : AIR_STEER_FACTOR;
    const turnAngle = steer * this.steerSpeed * speedFactor * direction * steerAuthority * dt;

    if (turnAngle !== 0) {
      const deltaRotation = new CANNON.Quaternion();
      deltaRotation.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), turnAngle);
      this.body.quaternion.copy(deltaRotation.mult(this.body.quaternion));
      this.body.quaternion.vmult(new CANNON.Vec3(0, 0, -1), forward);
    }
    this.body.angularVelocity.set(0, 0, 0);

    // Full grip horizontally: velocity's x/z is purely forward speed,
    // no sideways component — otherwise a sliver of "drift" gets added
    // on top of the car's speed every frame you hold a turn, which
    // compounds without limit (this is what caused speed to spiral out
    // of control and never come back down when braking). Vertical
    // velocity is left alone here — it's handled by the grounded/
    // airborne check below, since zeroing it unconditionally would
    // make it impossible to ever get real air off a jump hill.
    const groundedForward = forward.scale(forwardSpeed);
    velocity.x = groundedForward.x;
    velocity.z = groundedForward.z;

    // Follow the terrain directly rather than colliding with it (a
    // heightfield decomposes into many small convex pieces, and a box
    // the size of the car spans several at once, generating enough
    // simultaneous contacts to make the ground feel like glue) — but
    // only while grounded.
    if (isGrounded) {
      // Only climbing is rate-limited — a car has no traction limit on
      // how fast it can drop into a dip (gravity would pull it down at
      // least that fast anyway), so capping descent too just made the
      // car lag behind and float over craters, same bug as before.
      const desiredDeltaY = groundY - this.body.position.y;
      const maxUpDeltaY = MAX_CLIMB_RATE * dt;
      this.body.position.y += desiredDeltaY > 0 ? Math.min(desiredDeltaY, maxUpDeltaY) : desiredDeltaY;
      if (velocity.y < 0) velocity.y = 0;
    } else {
      velocity.y -= EXTRA_AIR_GRAVITY * airGravityMultiplier * dt;
    }

    this.mesh.position.copy(this.body.position);

    // Sample terrain height a bit ahead/behind and left/right to find
    // the slope under the car, and tilt the mesh to match — this is
    // what makes bumps and craters actually read as terrain instead of
    // the chassis floating over them dead level. Purely visual: the
    // physics body underneath stays yaw-only.
    const right = new CANNON.Vec3(-forward.z, 0, forward.x);
    const { x: px, z: pz } = this.body.position;
    const hForward = getTerrainHeight(px + forward.x * TILT_SAMPLE_DIST, pz + forward.z * TILT_SAMPLE_DIST);
    const hBack = getTerrainHeight(px - forward.x * TILT_SAMPLE_DIST, pz - forward.z * TILT_SAMPLE_DIST);
    const hRight = getTerrainHeight(px + right.x * TILT_SAMPLE_DIST, pz + right.z * TILT_SAMPLE_DIST);
    const hLeft = getTerrainHeight(px - right.x * TILT_SAMPLE_DIST, pz - right.z * TILT_SAMPLE_DIST);

    const targetPitch = THREE.MathUtils.clamp(
      Math.atan2(hForward - hBack, TILT_SAMPLE_DIST * 2),
      -MAX_TILT,
      MAX_TILT
    );
    const targetRoll = THREE.MathUtils.clamp(
      Math.atan2(hRight - hLeft, TILT_SAMPLE_DIST * 2),
      -MAX_TILT,
      MAX_TILT
    );
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, 0.2);
    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, 0.2);

    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, 0, this.roll, 'XYZ'));
    this.mesh.quaternion.copy(this.body.quaternion).multiply(tilt);

    const wheelSteerTarget = steer * MAX_WHEEL_STEER_ANGLE * steerAuthority;
    for (const pivot of this.frontWheelPivots) {
      pivot.rotation.y = THREE.MathUtils.lerp(pivot.rotation.y, wheelSteerTarget, 0.25);
    }

    for (const wheel of this.wheelMeshes) {
      wheel.rotation.x += forwardSpeed * 0.05;
    }
  }
}
