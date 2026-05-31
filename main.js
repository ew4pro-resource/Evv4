import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const canvas = document.getElementById('scene');
const fileInput = document.getElementById('audioFile');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const trackName = document.getElementById('trackName');

// ---------- three.js scene ----------
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05060a, 0.025);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 18, 38);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x05060a, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;

// Lighting
scene.add(new THREE.AmbientLight(0x404060, 0.6));
const pointLight = new THREE.PointLight(0xb14bff, 2, 80);
pointLight.position.set(0, 12, 0);
scene.add(pointLight);

// Postprocessing (bloom)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.1,
  0.6,
  0.15
);
composer.addPass(bloomPass);

// ---------- bars ring ----------
const BAR_COUNT = 96;
const RADIUS = 14;
const bars = [];
const barGroup = new THREE.Group();
scene.add(barGroup);

for (let i = 0; i < BAR_COUNT; i++) {
  const geom = new THREE.BoxGeometry(0.5, 1, 0.5);
  geom.translate(0, 0.5, 0); // pivot at bottom
  const hue = i / BAR_COUNT;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(hue, 0.85, 0.55),
    emissive: new THREE.Color().setHSL(hue, 0.9, 0.4),
    emissiveIntensity: 0.6,
    metalness: 0.3,
    roughness: 0.35,
  });
  const mesh = new THREE.Mesh(geom, mat);
  const angle = (i / BAR_COUNT) * Math.PI * 2;
  mesh.position.set(Math.cos(angle) * RADIUS, 0, Math.sin(angle) * RADIUS);
  mesh.rotation.y = -angle;
  barGroup.add(mesh);
  bars.push(mesh);
}

// Reflective floor
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(60, 64),
  new THREE.MeshStandardMaterial({
    color: 0x0a0d18,
    metalness: 0.9,
    roughness: 0.4,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
scene.add(floor);

// Stars
const starsGeom = new THREE.BufferGeometry();
const starCount = 600;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const r = 60 + Math.random() * 60;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 2 - 1);
  starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = r * Math.cos(phi);
  starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
}
starsGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starsGeom,
  new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, transparent: true, opacity: 0.7 })
);
scene.add(stars);

// ---------- Web Audio ----------
let audioCtx, analyser, sourceNode, audioBuffer;
let dataArray;
let isPlaying = false;
let startedAt = 0;
let pausedAt = 0;

async function loadFile(file) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.connect(audioCtx.destination);
  }

  const arrayBuffer = await file.arrayBuffer();
  audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  trackName.textContent = file.name;
  playBtn.disabled = false;
  pauseBtn.disabled = true;
  pausedAt = 0;
}

function play() {
  if (!audioBuffer) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(analyser);

  const offset = pausedAt;
  sourceNode.start(0, offset);
  startedAt = audioCtx.currentTime - offset;
  isPlaying = true;
  playBtn.disabled = true;
  pauseBtn.disabled = false;

  sourceNode.onended = () => {
    if (isPlaying) {
      isPlaying = false;
      pausedAt = 0;
      playBtn.disabled = false;
      pauseBtn.disabled = true;
    }
  };
}

function pause() {
  if (!isPlaying) return;
  sourceNode.stop();
  pausedAt = audioCtx.currentTime - startedAt;
  isPlaying = false;
  playBtn.disabled = false;
  pauseBtn.disabled = true;
}

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadFile(file);
});
playBtn.addEventListener('click', play);
pauseBtn.addEventListener('click', pause);

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Animate ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  let bassEnergy = 0;
  if (analyser && isPlaying) {
    analyser.getByteFrequencyData(dataArray);
    const binCount = dataArray.length;

    for (let i = 0; i < BAR_COUNT; i++) {
      const idx = Math.floor((i / BAR_COUNT) * binCount * 0.85);
      const value = dataArray[idx] / 255;
      const targetScale = 0.5 + value * 22;
      bars[i].scale.y += (targetScale - bars[i].scale.y) * 0.25;
      bars[i].material.emissiveIntensity = 0.4 + value * 1.5;
    }

    for (let i = 0; i < 8; i++) bassEnergy += dataArray[i];
    bassEnergy /= 8 * 255;
  } else {
    for (let i = 0; i < BAR_COUNT; i++) {
      const wave = 1 + Math.sin(t * 1.5 + i * 0.3) * 0.6;
      bars[i].scale.y += (wave - bars[i].scale.y) * 0.1;
    }
  }

  barGroup.rotation.y += dt * 0.15;
  pointLight.intensity = 1.5 + bassEnergy * 4;
  bloomPass.strength = 0.9 + bassEnergy * 1.5;
  stars.rotation.y += dt * 0.02;

  controls.update();
  composer.render();
}
animate();
