export type GeminiBaseVoice = "Puck" | "Charon" | "Kore" | "Fenrir" | "Zephyr";

export type DeliveryEmotion = "natural" | "storytelling" | "news" | "enthusiastic" | "calm";
export type DeliveryPace = "slow" | "normal" | "fast";

export interface AcousticMetrics {
  avgPitchHz: number;
  pitchMinHz: number;
  pitchMaxHz: number;
  spectralCentroidHz: number;
  rmsDb: number;
  durationSec: number;
}

export interface VoiceProfile {
  id: string;
  name: string;
  isCustom: boolean;
  createdAt: string;
  baseVoice: GeminiBaseVoice;
  pitchShiftSemitones: number;
  warmthDb: number;
  clarityDb: number;
  toneSummaryBn: string;
  vocalTraitsBn: string[];
  ttsStylePrompt: string;
  transcriptSample?: string;
  metrics: AcousticMetrics;
  hasReferenceAudio: boolean;
}

export interface GeneratedClip {
  id: string;
  title: string;
  text: string;
  voiceProfileId: string;
  voiceProfileName: string;
  baseVoice: GeminiBaseVoice;
  emotion: DeliveryEmotion;
  pace: DeliveryPace;
  pitchShiftSemitones: number;
  playbackSpeed: number;
  dspEnabled: boolean;
  durationSec: number;
  sampleRate: number;
  createdAt: string;
}

export interface DspSettings {
  enabled: boolean;
  pitchSemitones: number;
  speed: number;
  warmthDb: number;
  clarityDb: number;
}

export type ActivityType =
  | "voice_created"
  | "tts_generated"
  | "audio_converted"
  | "profile_deleted"
  | "clip_deleted";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  title: string;
  detail: string;
  createdAt: string;
}
