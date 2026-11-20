import { ActivityEntry, GeneratedClip, VoiceProfile } from "../types/voice";

const PROFILES_KEY = "konthostudio_voice_profiles_v1";
const CLIPS_KEY = "konthostudio_generated_clips_v1";
const ACTIVITY_KEY = "konthostudio_activity_v1";
const DB_NAME = "konthoStudioDB";
const STORE_NAME = "audioBlobs";

export const DEFAULT_STUDIO_PROFILES: VoiceProfile[] = [
  {
    id: "preset-charon",
    name: "গভীর উপস্থাপক (Charon)",
    isCustom: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    baseVoice: "Charon",
    pitchShiftSemitones: 0,
    warmthDb: 1.5,
    clarityDb: 1,
    toneSummaryBn: "ভরাট, শান্ত ও নির্ভরযোগ্য ব্যারিটোন কণ্ঠ — সংবাদ ও ডকুমেন্টারির জন্য আদর্শ।",
    vocalTraitsBn: ["গভীর পিচ", "স্থির গতি", "ভরাট অনুরণন"],
    ttsStylePrompt:
      "Deep, calm, authoritative baritone narrator with steady pacing, warm chest resonance, and crisp articulation.",
    metrics: {
      avgPitchHz: 116,
      pitchMinHz: 96,
      pitchMaxHz: 142,
      spectralCentroidHz: 1180,
      rmsDb: -16.5,
      durationSec: 0,
    },
    hasReferenceAudio: false,
  },
  {
    id: "preset-kore",
    name: "সাবলীল কথক (Kore)",
    isCustom: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    baseVoice: "Kore",
    pitchShiftSemitones: 0,
    warmthDb: 1,
    clarityDb: 1.5,
    toneSummaryBn: "স্পষ্ট, প্রাণবন্ত ও উষ্ণ নারী কণ্ঠ — অডিওবুক, শিক্ষামূলক কনটেন্ট ও পডকাস্টের জন্য উপযোগী।",
    vocalTraitsBn: ["মাঝারি-উচ্চ পিচ", "স্বাভাবিক ছন্দ", "স্পষ্ট উচ্চারণ"],
    ttsStylePrompt:
      "Warm, balanced, expressive alto narrator with natural conversational cadence and clear articulation.",
    metrics: {
      avgPitchHz: 204,
      pitchMinHz: 175,
      pitchMaxHz: 238,
      spectralCentroidHz: 1620,
      rmsDb: -16.0,
      durationSec: 0,
    },
    hasReferenceAudio: false,
  },
  {
    id: "preset-fenrir",
    name: "দৃঢ় গল্পকার (Fenrir)",
    isCustom: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    baseVoice: "Fenrir",
    pitchShiftSemitones: 0,
    warmthDb: 1,
    clarityDb: 2,
    toneSummaryBn: "দৃঢ় ও আবেগপূর্ণ পুরুষ কণ্ঠ — গল্প বলা ও নাটকীয় উপস্থাপনার জন্য মানানসই।",
    vocalTraitsBn: ["মধ্যম ব্যারিটোন", "আবেগপূর্ণ স্বর", "সজীব উচ্চারণ"],
    ttsStylePrompt:
      "Grounded, expressive male storyteller with rich vocal texture, natural dynamic pauses, and clear diction.",
    metrics: {
      avgPitchHz: 138,
      pitchMinHz: 112,
      pitchMaxHz: 168,
      spectralCentroidHz: 1360,
      rmsDb: -15.8,
      durationSec: 0,
    },
    hasReferenceAudio: false,
  },
];

export function loadVoiceProfiles(): VoiceProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return DEFAULT_STUDIO_PROFILES;
    const parsed = JSON.parse(raw) as VoiceProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_STUDIO_PROFILES;
    }
    return parsed;
  } catch {
    return DEFAULT_STUDIO_PROFILES;
  }
}

export function saveVoiceProfiles(profiles: VoiceProfile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function loadGeneratedClips(): GeneratedClip[] {
  try {
    const raw = localStorage.getItem(CLIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GeneratedClip[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGeneratedClips(clips: GeneratedClip[]): void {
  localStorage.setItem(CLIPS_KEY, JSON.stringify(clips));
}

function openAudioDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAudioBlob(key: string, blob: Blob): Promise<void> {
  const db = await openAudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAudioBlob(key: string): Promise<Blob | null> {
  try {
    const db = await openAudioDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as Blob) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteAudioBlob(key: string): Promise<void> {
  try {
    const db = await openAudioDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore cleanup error
  }
}

export function loadActivityLog(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveActivityLog(entries: ActivityEntry[]): void {
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(entries.slice(0, 100)));
}
