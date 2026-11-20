import { AcousticMetrics, DspSettings } from "../types/voice";

export function encodeWavFromFloat32(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBlob(base64: string, mimeType = "audio/wav"): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close();
  }
}

export function getMonoChannelData(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0);
  }
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const mono = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    mono[i] = (left[i] + right[i]) * 0.5;
  }
  return mono;
}

/**
 * Computes real acoustic metrics from a voice AudioBuffer:
 * - Fundamental frequency F0 (Hz) via normalized autocorrelation
 * - Min/Max pitch bounds
 * - Spectral brightness proxy via zero-crossing / high-frequency ratio
 * - RMS loudness in dBFS
 */
export function analyzeAudioAcoustics(buffer: AudioBuffer): AcousticMetrics {
  const samples = getMonoChannelData(buffer);
  const sr = buffer.sampleRate;
  const durationSec = buffer.duration;

  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sumSq / Math.max(1, samples.length));
  const rmsDb = rms > 1e-6 ? 20 * Math.log10(rms) : -60;

  // Frame-by-frame autocorrelation for F0 (75 Hz to 350 Hz)
  const frameSize = Math.floor(sr * 0.04); // 40ms
  const hopSize = Math.floor(sr * 0.02); // 20ms
  const minLag = Math.floor(sr / 350);
  const maxLag = Math.floor(sr / 75);

  const pitches: number[] = [];
  let totalZeroCrossings = 0;
  let voicedFrames = 0;

  for (let start = 0; start + frameSize < samples.length; start += hopSize) {
    let frameEnergy = 0;
    let zc = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = samples[start + i];
      frameEnergy += s * s;
      if (i > 0 && ((s >= 0 && samples[start + i - 1] < 0) || (s < 0 && samples[start + i - 1] >= 0))) {
        zc++;
      }
    }
    const frameRms = Math.sqrt(frameEnergy / frameSize);
    if (frameRms < Math.max(0.012, rms * 0.35)) continue;

    voicedFrames++;
    totalZeroCrossings += zc / (frameSize / sr);

    let bestLag = -1;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let num = 0;
      let den1 = 0;
      let den2 = 0;
      for (let i = 0; i < frameSize - lag; i++) {
        const a = samples[start + i];
        const b = samples[start + i + lag];
        num += a * b;
        den1 += a * a;
        den2 += b * b;
      }
      const denom = Math.sqrt(den1 * den2);
      const corr = denom > 1e-8 ? num / denom : 0;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    if (bestCorr > 0.52 && bestLag > 0) {
      const f0 = sr / bestLag;
      if (f0 >= 75 && f0 <= 350) {
        pitches.push(f0);
      }
    }
  }

  pitches.sort((a, b) => a - b);
  let avgPitchHz = 155;
  let pitchMinHz = 125;
  let pitchMaxHz = 195;

  if (pitches.length >= 3) {
    // Use median & 15th/85th percentile to resist octave outliers
    const p15 = pitches[Math.floor(pitches.length * 0.15)];
    const p50 = pitches[Math.floor(pitches.length * 0.5)];
    const p85 = pitches[Math.floor(pitches.length * 0.85)];
    avgPitchHz = Math.round(p50);
    pitchMinHz = Math.round(p15);
    pitchMaxHz = Math.round(p85);
  }

  const avgZcr = voicedFrames > 0 ? totalZeroCrossings / voicedFrames : 1200;
  const spectralCentroidHz = Math.round(Math.min(3600, Math.max(700, avgZcr * 0.55)));

  return {
    avgPitchHz,
    pitchMinHz,
    pitchMaxHz,
    spectralCentroidHz,
    rmsDb: Number(rmsDb.toFixed(1)),
    durationSec: Number(durationSec.toFixed(2)),
  };
}

/**
 * Clean time-domain WSOLA time-stretch + linear resampling pitch shifter.
 * Preserves speaking tempo while shifting pitch in semitones.
 */
export function pitchShiftAndStretchPCM(
  input: Float32Array,
  sampleRate: number,
  semitones: number,
  speedMultiplier: number
): Float32Array {
  const pitchFactor = Math.pow(2, semitones / 12);
  // If neither pitch nor speed changed significantly, return copy
  if (Math.abs(pitchFactor - 1) < 0.005 && Math.abs(speedMultiplier - 1) < 0.005) {
    return new Float32Array(input);
  }

  // First time-stretch by (pitchFactor / speedMultiplier) so that after resampling by pitchFactor,
  // final duration = originalDuration / speedMultiplier and pitch = originalPitch * pitchFactor
  const stretchRatio = pitchFactor / speedMultiplier;

  const stretched = timeStretchWSOLA(input, sampleRate, stretchRatio);
  if (Math.abs(pitchFactor - 1) < 0.005) {
    return stretched;
  }

  // Linear interpolation resample by pitchFactor
  const outLength = Math.max(1, Math.floor(stretched.length / pitchFactor));
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * pitchFactor;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = stretched[idx] ?? 0;
    const s1 = stretched[idx + 1] ?? s0;
    output[i] = s0 + (s1 - s0) * frac;
  }
  return output;
}

function timeStretchWSOLA(
  input: Float32Array,
  sampleRate: number,
  ratio: number
): Float32Array {
  if (Math.abs(ratio - 1) < 0.005) {
    return new Float32Array(input);
  }

  const winSize = Math.floor(sampleRate * 0.036); // 36ms window
  const halfWin = Math.floor(winSize / 2);
  const synHop = halfWin;
  const anaHop = synHop / ratio;
  const searchRadius = Math.floor(sampleRate * 0.008); // ±8ms search

  const hanning = new Float32Array(winSize);
  for (let i = 0; i < winSize; i++) {
    hanning[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winSize - 1)));
  }

  const estLength = Math.max(winSize, Math.floor(input.length * ratio) + winSize);
  const output = new Float32Array(estLength);
  const norm = new Float32Array(estLength);

  // Copy first window
  for (let i = 0; i < winSize && i < input.length; i++) {
    output[i] += input[i] * hanning[i];
    norm[i] += hanning[i];
  }

  let outPos = synHop;
  let step = 1;

  while (true) {
    const nominalInPos = Math.round(step * anaHop);
    if (nominalInPos + winSize >= input.length || outPos + winSize >= estLength) {
      break;
    }

    // Find best offset within +-searchRadius matching the already-synthesized overlap region
    let bestOffset = 0;
    let bestScore = -Infinity;
    const minOff = Math.max(-searchRadius, -nominalInPos);
    const maxOff = Math.min(searchRadius, input.length - winSize - nominalInPos);

    for (let off = minOff; off <= maxOff; off += 2) {
      let corr = 0;
      const candidateStart = nominalInPos + off;
      for (let i = 0; i < halfWin; i += 2) {
        corr += output[outPos + i] * input[candidateStart + i];
      }
      if (corr > bestScore) {
        bestScore = corr;
        bestOffset = off;
      }
    }

    const chosenStart = nominalInPos + bestOffset;
    for (let i = 0; i < winSize; i++) {
      output[outPos + i] += input[chosenStart + i] * hanning[i];
      norm[outPos + i] += hanning[i];
    }

    outPos += synHop;
    step++;
  }

  const finalLen = Math.min(estLength, outPos + halfWin);
  const result = new Float32Array(finalLen);
  for (let i = 0; i < finalLen; i++) {
    result[i] = norm[i] > 1e-4 ? output[i] / norm[i] : output[i];
  }
  return result;
}

/**
 * Applies studio voice-matching DSP: WSOLA pitch & speed shift + OfflineAudioContext EQ (warmth & presence).
 */
export async function applyVoiceMatchingDSP(
  rawWavBlob: Blob,
  settings: DspSettings
): Promise<{ blob: Blob; durationSec: number; sampleRate: number }> {
  const audioBuffer = await decodeAudioBlob(rawWavBlob);
  const sampleRate = audioBuffer.sampleRate;
  const mono = getMonoChannelData(audioBuffer);

  if (!settings.enabled) {
    return {
      blob: rawWavBlob,
      durationSec: audioBuffer.duration,
      sampleRate,
    };
  }

  const shifted = pitchShiftAndStretchPCM(
    mono,
    sampleRate,
    settings.pitchSemitones,
    settings.speed
  );

  // Run through OfflineAudioContext for warmth & presence EQ shaping
  const offlineCtx = new OfflineAudioContext(1, shifted.length, sampleRate);
  const sourceBuffer = offlineCtx.createBuffer(1, shifted.length, sampleRate);
  sourceBuffer.getChannelData(0).set(shifted);

  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;

  const highPass = offlineCtx.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = 75;

  const warmthShelf = offlineCtx.createBiquadFilter();
  warmthShelf.type = "lowshelf";
  warmthShelf.frequency.value = 210;
  warmthShelf.gain.value = settings.warmthDb;

  const presencePeak = offlineCtx.createBiquadFilter();
  presencePeak.type = "peaking";
  presencePeak.frequency.value = 3100;
  presencePeak.Q.value = 1.1;
  presencePeak.gain.value = settings.clarityDb;

  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 18;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.12;

  source.connect(highPass);
  highPass.connect(warmthShelf);
  warmthShelf.connect(presencePeak);
  presencePeak.connect(compressor);
  compressor.connect(offlineCtx.destination);

  source.start(0);
  const rendered = await offlineCtx.startRendering();
  const processedSamples = rendered.getChannelData(0);
  const wavBlob = encodeWavFromFloat32(processedSamples, sampleRate);

  return {
    blob: wavBlob,
    durationSec: rendered.duration,
    sampleRate,
  };
}

export function extractWaveformPeaks(buffer: AudioBuffer, barCount = 96): number[] {
  const data = getMonoChannelData(buffer);
  const step = Math.max(1, Math.floor(data.length / barCount));
  const peaks: number[] = [];
  let maxPeak = 0.01;

  for (let i = 0; i < barCount; i++) {
    const start = i * step;
    const end = Math.min(data.length, start + step);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(data[j]);
      if (abs > peak) peak = abs;
    }
    peaks.push(peak);
    if (peak > maxPeak) maxPeak = peak;
  }

  return peaks.map((p) => Math.max(0.06, p / maxPeak));
}

export async function encodeCompactWav16k(buffer: AudioBuffer): Promise<Blob> {
  const targetRate = 16000;
  const maxSeconds = 180;
  const duration = Math.min(buffer.duration, maxSeconds);
  const frameCount = Math.max(1, Math.ceil(duration * targetRate));
  const offlineCtx = new OfflineAudioContext(1, frameCount, targetRate);
  const src = offlineCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(offlineCtx.destination);
  src.start(0, 0, duration);
  const rendered = await offlineCtx.startRendering();
  return encodeWavFromFloat32(rendered.getChannelData(0), targetRate);
}
