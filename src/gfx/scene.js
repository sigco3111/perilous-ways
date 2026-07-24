// Renderer, camera, sun, sky, and the post chain.
//
// Two things here earn their keep visually:
//
//   * The shadow camera is refitted to whatever the player is actually looking
//     at, every frame. One 2048 map stretched over a 1120-unit continent gives
//     shadows like wet cardboard; the same map fitted to the visible 400 units
//     gives crisp shadows under every eave.
//   * The sky, fog and sun colour are driven from one time-of-day value, so
//     dusk actually reads as dusk rather than as the same picture with the
//     brightness pulled down.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, lerp } from '../rng.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunCol;
uniform vec3 uSunDir;
uniform float uNight;
varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  // a firmer curve than a straight mix, so the horizon band stays tight
  float t = pow(clamp(d.y, 0.0, 1.0), 0.42);
  vec3 col = mix(uHorizon, uZenith, t);

  // sun disc and its bloom halo
  float cosA = dot(d, normalize(uSunDir));
  float disc = smoothstep(0.9995, 0.99985, cosA);
  float halo = pow(clamp(cosA, 0.0, 1.0), 220.0) * 0.55
             + pow(clamp(cosA, 0.0, 1.0), 14.0) * 0.16;
  col += uSunCol * (disc * 6.0 + halo);

  // a few stars, and only at night
  if (uNight > 0.02) {
    vec3 g = floor(d * 190.0);
    float h = fract(sin(dot(g, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float star = smoothstep(0.9975, 1.0, h) * clamp(d.y * 1.6, 0.0, 1.0);
    col += vec3(star) * uNight * 0.9;
  }
  // below the horizon fades to the ground haze so the dome edge never shows
  col = mix(col * 0.55, col, smoothstep(-0.09, 0.06, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

/** Palette keyframes through the day. t = 0 midnight, 0.5 noon. */
//
// fogD was ~3× these values. Side-by-side renders at the default camera distance
// (tools/fogtest.mjs) showed why that was wrong: the same grass that is vivid
// green in a close-up came out olive-tan across the whole frame. Warm fog dense
// enough to read as haze at the horizon also sepia-tones everything in front of
// it, and the world stopped looking like a place. Fog should describe distance,
// not tint the picture — so the daylight rows are cut hard and only night keeps
// enough to close the view down.
// Night rows used to sit at sunI 0.09 / ambI 0.30, which rendered the land as pure
// black: a night screenshot showed only water, the rails and the text labels — you
// could not survey a route or find a town you did not already know the position of,
// for ~134 seconds out of every 320. Night is now MOONLIT: cool silver-blue, dim,
// high-contrast, and legible. `env.night` is derived from the sun's direction rather
// than its intensity (see below), so stars, bloom and lit windows stay fully
// nocturnal — this buys legibility without costing the mood. The full-dark band is
// also narrowed (0.20→0.14, 0.82→0.88) because dawn and dusk are the best-looking
// part of the cycle and there was too little of them.
/** Ambient colour the sky tends toward after dark. Hoisted so it is not
 *  reallocated every frame. */
const MOONLIGHT = new THREE.Color('#b3cdf0');

const DAY_KEYS = [
  // t,    zenith,     horizon,    sun,        sunI, ambI, fog,        fogD
  [0.00, '#13224a', '#1b2a4e', '#aebfe0', 0.46, 0.74, '#1b2746', 0.0011],
  [0.14, '#16294f', '#3a3457', '#b3b9d8', 0.52, 0.76, '#2c2942', 0.0009],
  [0.27, '#27528f', '#dd8f5c', '#ffb072', 1.15, 0.62, '#c8905f', 0.0006],
  [0.38, '#2f6ac4', '#eec489', '#ffd7a3', 1.95, 0.55, '#ddbc92', 0.00042],
  [0.50, '#3a7ed6', '#f3d7ac', '#fff0d2', 2.15, 0.55, '#e6cfa9', 0.00034],
  [0.62, '#2f6ac4', '#eec489', '#ffd7a3', 1.95, 0.55, '#ddbc92', 0.00042],
  [0.74, '#22488c', '#e58450', '#ff9a5c', 1.05, 0.62, '#c4834f', 0.0006],
  [0.88, '#182b52', '#5a3a54', '#9fb0d6', 0.50, 0.74, '#332a40', 0.0010],
  [1.00, '#13224a', '#1b2a4e', '#aebfe0', 0.46, 0.74, '#1b2746', 0.0011],
];

function sampleDay(t) {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < DAY_KEYS.length - 2 && DAY_KEYS[i + 1][0] < t) i++;
  const a = DAY_KEYS[i], b = DAY_KEYS[i + 1];
  const f = clamp((t - a[0]) / (b[0] - a[0] || 1), 0, 1);
  const mix = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), f);
  return {
    zenith: mix(a[1], b[1]),
    horizon: mix(a[2], b[2]),
    sun: mix(a[3], b[3]),
    sunI: lerp(a[4], b[4], f),
    ambI: lerp(a[5], b[5], f),
    fog: mix(a[6], b[6]),
    fogD: lerp(a[7], b[7], f),
  };
}

export function createScene(canvas, world) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap is deprecated as of r185 and is silently downgraded to
  // PCFShadowMap, so request that directly and spend the quality on a shadow
  // camera fitted tightly to the view instead (see fitShadow).
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.97;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xe6c8a2, 0.0016);

  const camera = new THREE.PerspectiveCamera(34, 1, 2, 5200);

  // --- sky dome
  const skyUniforms = {
    uZenith: { value: new THREE.Color('#3f74c4') },
    uHorizon: { value: new THREE.Color('#f2c98a') },
    uSunCol: { value: new THREE.Color('#ffd7a3') },
    uSunDir: { value: new THREE.Vector3(0.5, 0.4, 0.6).normalize() },
    uNight: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2600, 32, 20),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      uniforms: skyUniforms, side: THREE.BackSide,
      depthWrite: false, fog: false,
    }),
  );
  sky.frustumCulled = false;
  scene.add(sky);

  // --- lights
  const sun = new THREE.DirectionalLight(0xffd7a3, 2.55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  // 0.9 is what the terrain module measured as necessary to stop a 107k-tri
  // heightfield acneing into a 2048 map; much below this and the ground stipples.
  sun.shadow.normalBias = 0.9;
  const sc = sun.shadow.camera;
  sc.near = 1; sc.far = 900;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0x9fbde0, 0x6b5a44, 0.55);
  scene.add(hemi);

  // --- post
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.72, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const env = {
    time: 0.42,                 // time of day, 0..1
    daySpeed: 1 / 320,          // one full day per 320 seconds of play
    night: 0,
    wind: new THREE.Vector2(0.62, 0.34).normalize(),
    windStrength: 1.0,
    sunDir: new THREE.Vector3(),
    ashLevel: 0,
    focus: new THREE.Vector3(),  // what the shadow map should cover
    focusRadius: 260,
    camDist: 430,                // set by the host each frame from the controls
  };

  function resize() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /** Refit the shadow frustum to the visible ground. */
  function fitShadow() {
    const r = env.focusRadius;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.near = 1; sc.far = r * 4.5 + 200;
    // snap the sun's position to texel-sized steps, or the shadow crawls
    const dist = r * 2.2 + 120;
    const step = (r * 2) / 2048;
    const snap = (v) => Math.round(v / step) * step;
    sun.target.position.set(snap(env.focus.x), snap(env.focus.y), snap(env.focus.z));
    sun.position.copy(sun.target.position).addScaledVector(env.sunDir, dist);
    sc.updateProjectionMatrix();
  }

  function update(dt) {
    env.time = (env.time + dt * env.daySpeed) % 1;
    const k = sampleDay(env.time);

    // sun arc: east to west, tilted, never quite overhead
    const ang = (env.time - 0.25) * Math.PI * 2;
    env.sunDir.set(Math.cos(ang), Math.max(-0.35, Math.sin(ang) * 0.92), 0.34).normalize();

    env.night = clamp(1 - smooth01(env.sunDir.y, -0.06, 0.16), 0, 1);

    sun.color.copy(k.sun);
    sun.intensity = k.sunI;
    hemi.intensity = k.ambI;
    // The ambient COLOUR was the thing making night unplayable, not the intensity.
    // This took the zenith — #13224a at midnight, about 10% brightness — and lerped
    // it only 40% toward pale blue, so raising ambI just scaled a near-black colour
    // and the land stayed black. Push most of the way to moonlight after dark.
    hemi.color.copy(k.zenith).lerp(MOONLIGHT, 0.4 + 0.45 * env.night);
    // ACES has a long dark toe, so linear gains at the bottom end barely survive
    // tone mapping. Lift exposure at night to get the shadows up off the floor.
    renderer.toneMappingExposure = 0.97 + 0.30 * env.night;

    skyUniforms.uZenith.value.copy(k.zenith);
    skyUniforms.uHorizon.value.copy(k.horizon);
    skyUniforms.uSunCol.value.copy(k.sun);
    skyUniforms.uSunDir.value.copy(env.sunDir);
    skyUniforms.uNight.value = env.night;

    scene.fog.color.copy(k.fog);
    // Fog has to be relative to how far the camera is standing back. Exponential
    // fog at a fixed density reaches 97% at full zoom-out and erases the entire
    // continent — the one view where the player most needs to see it. Holding the
    // fog *fraction* roughly constant keeps the aerial haze without the whiteout.
    // 430 was too far out to help: the default camera sits inside that radius and
    // so got no relief at all. Start easing at the closest range a player ever
    // orbits at, so mid-zoom — where the game is actually played — stays clear.
    const distScale = 180 / Math.max(180, env.camDist);
    scene.fog.density = k.fogD * distScale * lerp(1, 1.5, env.ashLevel);
    renderer.setClearColor(k.fog);
    // The water shader applies fog itself, so it has to be told the same numbers
    // or the sea and the land drift apart in colour as the day turns.
    for (const sink of fogSinks) sink(scene.fog.color, scene.fog.density);

    bloom.strength = lerp(0.34, 0.78, env.night);

    sky.position.copy(camera.position);
    fitShadow();
  }

  const smooth01 = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
  const fogSinks = [];

  function render() { composer.render(); }

  resize();
  addEventListener('resize', resize);

  return {
    renderer, scene, camera, sun, hemi, composer, bloom, env, sky,
    update, render, resize,
    onFog(fn) { fogSinks.push(fn); },
    setQuality(q) {
      renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 1.75 : 1.0));
      sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      bloom.enabled = q !== 'low';
      resize();
    },
  };
}
