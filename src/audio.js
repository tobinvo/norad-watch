// ═══════════════════════════════════════════
// SOUND DESIGN — Procedural audio via Web Audio API
// ═══════════════════════════════════════════

let audioCtx = null;
let masterGain = null;
let ambientOsc = null;
let ambientHarmonic = null;
let ambientGain = null;
let initialized = false;
let muted = false;
let masterVolume = 0.5;

// ARM warning state — tracks beep timing per ARM
const armBeepTimers = new Map();

// ═══════════════════════════════════════════
// INIT — must call on first user gesture
// ═══════════════════════════════════════════

export function initAudio() {
  if (initialized) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(audioCtx.destination);
    initialized = true;
  } catch (e) {
    console.warn('Web Audio API not available:', e);
  }
}

export function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// ═══════════════════════════════════════════
// VOLUME CONTROL
// ═══════════════════════════════════════════

export function setMasterVolume(v) {
  masterVolume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = masterVolume;
}

export function getMasterVolume() {
  return masterVolume;
}

export function toggleMute() {
  muted = !muted;
  if (masterGain) masterGain.gain.value = muted ? 0 : masterVolume;
  return muted;
}

// ═══════════════════════════════════════════
// PRIMITIVE BUILDERS
// ═══════════════════════════════════════════

function tone(freq, duration, type = 'sine', volume = 0.15) {
  if (!audioCtx || !initialized) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration + 0.01);
}

function sweepTone(freqStart, freqEnd, duration, type = 'sine', volume = 0.15) {
  if (!audioCtx || !initialized) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, now);
  osc.frequency.linearRampToValueAtTime(freqEnd, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration + 0.01);
}

function noiseBurst(duration, filterFreq = 1500, q = 2, volume = 0.08) {
  if (!audioCtx || !initialized) return;
  const now = audioCtx.currentTime;
  const bufferSize = Math.ceil(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  filter.Q.value = q;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start(now);
  source.stop(now + duration + 0.01);
}

// ═══════════════════════════════════════════
// SOUND EVENTS
// ═══════════════════════════════════════════

// 1. Radar sweep tick — subtle click when sweep crosses 12 o'clock
export function playSweepTick() {
  tone(1200, 0.05, 'sine', 0.04);
}

// 2. Detection ping — pitch scales with proximity (0=far, 1=close)
export function playDetectionPing(proximity = 0.5) {
  const freq = 800 + proximity * 600; // 800-1400 Hz
  tone(freq, 0.08, 'sine', 0.12);
}

// 3. Alert klaxon — two-tone siren
export function playAlertKlaxon(severity = 'normal') {
  if (!audioCtx || !initialized) return;
  const vol = severity === 'critical' ? 0.18 : 0.12;
  const now = audioCtx.currentTime;

  // First tone
  const osc1 = audioCtx.createOscillator();
  const gain1 = audioCtx.createGain();
  osc1.type = 'square';
  osc1.frequency.value = 400;
  gain1.gain.setValueAtTime(vol, now);
  gain1.gain.setValueAtTime(0, now + 0.12);
  osc1.connect(gain1);
  gain1.connect(masterGain);
  osc1.start(now);
  osc1.stop(now + 0.12);

  // Second tone
  const osc2 = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.type = 'square';
  osc2.frequency.value = 800;
  gain2.gain.setValueAtTime(vol, now + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  osc2.connect(gain2);
  gain2.connect(masterGain);
  osc2.start(now + 0.15);
  osc2.stop(now + 0.36);
}

// 4. Missile launch — tone burst per weapon type
export function playMissileLaunch(weaponType) {
  if (weaponType === 'GENIE') {
    // Low + longer burst for nuclear
    tone(300, 0.25, 'sawtooth', 0.15);
    tone(450, 0.2, 'sine', 0.08);
  } else if (weaponType === 'SPARROW') {
    sweepTone(1000, 1400, 0.15, 'sine', 0.12);
  } else if (weaponType === 'AMRAAM') {
    sweepTone(1200, 1600, 0.12, 'sine', 0.14);
  } else if (weaponType === 'SIDEWINDER' || weaponType === 'FALCON') {
    sweepTone(900, 1200, 0.12, 'sine', 0.10);
  } else {
    sweepTone(1000, 1300, 0.15, 'sine', 0.12);
  }
}

// 5. Splash — rising confirmation tone
export function playSplash() {
  // Short, clipped confirmation pip — like a radar scope return
  tone(1000, 0.04, 'sine', 0.10);
}

// 6. Miss — flat low buzz
export function playMiss() {
  tone(200, 0.25, 'square', 0.10);
}

// 7. ARM warning beep — called each frame, self-manages beep interval
export function updateArmWarning(armId, distToSite, active) {
  if (!audioCtx || !initialized) return;

  if (!active) {
    armBeepTimers.delete(armId);
    return;
  }

  const now = audioCtx.currentTime;
  const last = armBeepTimers.get(armId) || 0;
  // Beep interval: 0.5s at 50nm, 0.1s at 5nm
  const interval = Math.max(0.1, Math.min(0.5, distToSite / 100));

  if (now - last >= interval) {
    tone(800, 0.06, 'square', 0.15);
    armBeepTimers.set(armId, now);
  }
}

// 8. EMCON shift — distinct tone per state
export function playEmconShift(emconState) {
  if (emconState === 'ACTIVE') {
    sweepTone(400, 700, 0.12, 'sine', 0.10);
  } else if (emconState === 'REDUCED') {
    tone(550, 0.10, 'triangle', 0.10);
  } else {
    sweepTone(700, 350, 0.15, 'sine', 0.10);
  }
}

// 9. Ambient hum — continuous 60 Hz + harmonic
export function startAmbient() {
  if (!audioCtx || !initialized || ambientOsc) return;

  ambientGain = audioCtx.createGain();
  ambientGain.gain.value = 0.06;
  ambientGain.connect(masterGain);

  ambientOsc = audioCtx.createOscillator();
  ambientOsc.type = 'sine';
  ambientOsc.frequency.value = 60;
  ambientOsc.connect(ambientGain);
  ambientOsc.start();

  ambientHarmonic = audioCtx.createOscillator();
  ambientHarmonic.type = 'sine';
  ambientHarmonic.frequency.value = 120;
  const harmGain = audioCtx.createGain();
  harmGain.gain.value = 0.25; // -12dB relative
  ambientHarmonic.connect(harmGain);
  harmGain.connect(ambientGain);
  ambientHarmonic.start();
}

export function updateAmbient(timeMultiplier) {
  if (!ambientGain) return;
  // Quieter during fast-forward
  const vol = timeMultiplier <= 1 ? 0.06 : 0.06 / Math.sqrt(timeMultiplier);
  ambientGain.gain.value = vol;
}

export function stopAmbient() {
  if (ambientOsc) { ambientOsc.stop(); ambientOsc = null; }
  if (ambientHarmonic) { ambientHarmonic.stop(); ambientHarmonic = null; }
  ambientGain = null;
}

// 10. Radio chatter — filtered noise burst
export function playRadioChatter() {
  const duration = 0.15 + Math.random() * 0.2; // 150-350ms
  const freq = 800 + Math.random() * 1500; // 800-2300 Hz center
  noiseBurst(duration, freq, 3, 0.06);
}

// 11. Nuclear detonation (Genie) — deep rumble + white noise
export function playNuclearDetonation() {
  if (!audioCtx || !initialized) return;
  const now = audioCtx.currentTime;

  // Deep rumble — 50 Hz with long decay
  const rumbleOsc = audioCtx.createOscillator();
  const rumbleGain = audioCtx.createGain();
  rumbleOsc.type = 'sine';
  rumbleOsc.frequency.value = 50;
  rumbleGain.gain.setValueAtTime(0.25, now);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  rumbleOsc.connect(rumbleGain);
  rumbleGain.connect(masterGain);
  rumbleOsc.start(now);
  rumbleOsc.stop(now + 1.3);

  // Sub-harmonic
  const subOsc = audioCtx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = 30;
  const subGain = audioCtx.createGain();
  subGain.gain.setValueAtTime(0.15, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
  subOsc.connect(subGain);
  subGain.connect(masterGain);
  subOsc.start(now);
  subOsc.stop(now + 1.6);

  // White noise burst
  noiseBurst(0.5, 2000, 1, 0.15);
}

// City impact — explosion sound
export function playCityImpact() {
  if (!audioCtx || !initialized) return;
  const now = audioCtx.currentTime;

  // Low thump
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(100, now);
  osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.7);

  // Noise burst
  noiseBurst(0.4, 1000, 1.5, 0.12);
}

// Radar site destroyed — metallic crash
export function playRadarDestroyed() {
  if (!audioCtx || !initialized) return;
  noiseBurst(0.5, 600, 4, 0.15);
  tone(150, 0.4, 'sawtooth', 0.10);
}

// AWACS down — alarm + static
export function playAwacsDown() {
  playAlertKlaxon('critical');
  setTimeout(() => {
    if (audioCtx && initialized) noiseBurst(0.3, 1200, 2, 0.10);
  }, 400);
}

// Wave incoming — escalating alarm
export function playWaveIncoming() {
  if (!audioCtx || !initialized) return;
  sweepTone(300, 600, 0.2, 'square', 0.12);
  setTimeout(() => {
    if (audioCtx && initialized) sweepTone(400, 800, 0.2, 'square', 0.14);
  }, 250);
}

// Damage / cripple hit
export function playDamageHit() {
  tone(400, 0.15, 'triangle', 0.10);
  noiseBurst(0.1, 800, 2, 0.06);
}
