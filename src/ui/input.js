// Camera and pointer.
//
// One left button has to do two jobs: look around, and pick settlements. The
// split is by intent — a press that moves more than a few pixels is a drag of
// the camera, a press that does not is a click on whatever is under it. That
// keeps the map feeling like a map without a modifier key to remember.

import * as THREE from 'three';
import { clamp, lerp } from '../rng.js';

export function createControls(canvas, camera, world, opts = {}) {
  const target = new THREE.Vector3(-90, 0, 40);
  const state = {
    dist: 470,
    yaw: -0.42,
    pitch: 0.86,          // radians from horizontal; clamped below
    targetDist: 470,
    targetYaw: -0.42,
    targetPitch: 0.86,
    goal: target.clone(),
  };

  const MIN_D = 55, MAX_D = 1150;
  const MIN_P = 0.20, MAX_P = 1.42;

  let followFn = null;      // () -> {x,z} | null, while riding a train
  let dragging = false, dragMoved = 0, dragBtn = 0;
  let px = 0, py = 0;
  let downX = 0, downY = 0, downT = 0;
  const keys = new Set();

  const rect = () => canvas.getBoundingClientRect();

  function clampTarget() {
    const hw = world.worldW * 0.52, hh = world.worldH * 0.52;
    state.goal.x = clamp(state.goal.x, -hw, hw);
    state.goal.z = clamp(state.goal.z, -hh, hh);
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    dragging = true; dragMoved = 0; dragBtn = e.button;
    px = downX = e.clientX; py = downY = e.clientY;
    downT = performance.now();
  });

  canvas.addEventListener('pointermove', (e) => {
    const r = rect();
    opts.onHover?.(e.clientX - r.left, e.clientY - r.top, r);
    if (!dragging) return;
    const dx = e.clientX - px, dy = e.clientY - py;
    px = e.clientX; py = e.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);

    if (dragBtn === 2 || e.shiftKey) {
      // pan
      const k = state.dist * 0.0016;
      const s = Math.sin(state.targetYaw), c = Math.cos(state.targetYaw);
      state.goal.x -= (dx * c - dy * s) * k;
      state.goal.z -= (dx * s + dy * c) * k;
      clampTarget();
    } else {
      state.targetYaw -= dx * 0.0044;
      state.targetPitch = clamp(state.targetPitch - dy * 0.0034, MIN_P, MAX_P);
    }
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    const quick = performance.now() - downT < 520;
    if (dragMoved < 7 && quick && dragBtn === 0) {
      const r = rect();
      opts.onClick?.(e.clientX - r.left, e.clientY - r.top, r);
    }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = Math.exp(clamp(e.deltaY, -160, 160) * 0.0013);
    state.targetDist = clamp(state.targetDist * f, MIN_D, MAX_D);
  }, { passive: false });

  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // two-finger pinch on touch
  let pinchBase = 0;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchBase = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchBase > 0) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      state.targetDist = clamp(state.targetDist * (pinchBase / d), MIN_D, MAX_D);
      pinchBase = d;
    }
  }, { passive: true });

  function update(dt) {
    // keyboard pan, in screen space
    const kp = state.dist * 0.9 * dt;
    let mx = 0, mz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if ((mx || mz) && followFn) followFn = null;   // taking the wheel stops the ride
    if (mx || mz) {
      const s = Math.sin(state.targetYaw), c = Math.cos(state.targetYaw);
      state.goal.x += (mx * c - mz * s) * kp;
      state.goal.z += (mx * s + mz * c) * kp;
      clampTarget();
    }
    if (keys.has('KeyQ')) state.targetYaw += dt * 1.1;
    if (keys.has('KeyE')) state.targetYaw -= dt * 1.1;

    // ease
    const k = 1 - Math.pow(0.0016, dt);
    state.dist = lerp(state.dist, state.targetDist, k);
    state.yaw = lerp(state.yaw, state.targetYaw, k);
    state.pitch = lerp(state.pitch, state.targetPitch, k);
    if (followFn) {
      const p = followFn();
      if (p) {
        state.goal.set(p.x, world.heightAt(p.x, p.z), p.z);
        clampTarget();
      } else followFn = null;
    }
    // riding a train wants a snappier follow than free panning does
    target.lerp(state.goal, followFn ? 1 - Math.pow(0.004, dt) : k);

    // follow the ground so the view does not sink into a mountain
    const gh = world.heightAt(target.x, target.z);
    target.y = lerp(target.y, gh, 1 - Math.pow(0.02, dt));

    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    camera.position.set(
      target.x + Math.sin(state.yaw) * cp * state.dist,
      target.y + sp * state.dist,
      target.z + Math.cos(state.yaw) * cp * state.dist,
    );
    camera.lookAt(target);
  }

  return {
    update,
    target,
    get dist() { return state.dist; },
    focusOn(x, z, dist) {
      state.goal.set(x, world.heightAt(x, z), z);
      if (dist) state.targetDist = clamp(dist, MIN_D, MAX_D);
      clampTarget();
    },
    /** Radius the shadow map should cover for the current view. */
    shadowRadius() { return clamp(state.dist * 0.62, 90, 420); },
    isDragging: () => dragging && dragMoved > 7,
    follow(fn) { followFn = fn; },
    get following() { return !!followFn; },
  };
}
