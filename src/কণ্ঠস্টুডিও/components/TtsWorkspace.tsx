import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Mic,
  Play,
  Sliders,
  Volume2,
  Wand2,
} from "lucide-react";
import {
  DeliveryEmotion,
  DeliveryPace,
  DspSettings,
  GeneratedClip,
  VoiceProfile,
} from "../types/voice";
import { applyVoiceMatchingDSP, base64ToBlob } from "../utils/audioProcessor";
import { loadAudioBlob, saveAudioBlob } from "../utils/storage";
import { WaveformPlayer } from "./WaveformPlayer";

interface TtsWorkspaceProps {
  activeProfile: VoiceProfile;
  initialText?: string;
  onOpenCalibrate: () => void;
  onClipGenerated: (clip: GeneratedClip) => void;
}

const SAMPLE_SCRIPTS: { label: string; emotion: DeliveryEmotion; text: string }[] = [
  {
    label: "শুভেচ্ছা ও পরিচয়",
    emotion: "natural",
    text: "নমস্কার! আমার নিজের কণ্ঠস্বরের ধাঁচে তৈরি এই অডিও বার্তায় আপনাকে স্বাগতম। এখন যেকোনো বাংলা বা ইংরেজি লেখা মুহূর্তেই আমার নিজস্ব ভঙ্গিতে শোনা সম্ভব।",
  },
  {
    label: "গল্পের সূচনা",
    emotion: "storytelling",
    text: "সন্ধ্যার মৃদু আলোয় পুরনো স্টেশনটা তখন প্রায় জনশূন্য। <breath> দূর থেকে একটি ট্রেনের বাঁশি শোনা গেল, আর ঠিক সেই মুহূর্তেই আমাদের গল্পের আসল অধ্যায়টি শুরু হলো।",
  },
  {
    label: "সংবাদ পাঠ",
    emotion: "news",
    text: "শুরু করছি বিশেষ প্রযুক্তি সংবাদ। কৃত্রিম বুদ্ধিমত্তা ও আধুনিক ওয়েব অডিও প্রযুক্তির সমন্বয়ে বাংলা ভাষায় ভয়েস সিন্থেসিস এখন আরও প্রাকৃতিক ও সাবলীল হয়ে উঠেছে।",
  },
  {
    label: "পডকাস্ট আড্ডা",
    emotion: "enthusiastic",
    text: "হ্যালো বন্ধুরা, কেমন আছেন সবাই? <laugh> আজকের এপিসোডে আমরা কথা বলব কীভাবে নিজের কণ্ঠ ব্যবহার করে চমৎকার সব অডিওবুক ও পডকাস্ট তৈরি করা যায়!",
  },
];

const EMOTION_OPTIONS: { id: DeliveryEmotion; label: string }[] = [
  { id: "natural", label: "স্বাভাবিক" },
  { id: "storytelling", label: "গল্প বলা" },
  { id: "news", label: "সংবাদ পাঠ" },
  { id: "enthusiastic", label: "উৎসাহী" },
  { id: "calm", label: "শান্ত" },
];

const PACE_OPTIONS: { id: DeliveryPace; label: string }[] = [
  { id: "slow", label: "ধীর" },
  { id: "normal", label: "স্বাভাবিক" },
  { id: "fast", label: "দ্রুত" },
];

export const TtsWorkspace: React.FC<TtsWorkspaceProps> = ({
  activeProfile,
  initialText,
  onOpenCalibrate,
  onClipGenerated,
}) => {
  const [text, setText] = useState(
    initialText || SAMPLE_SCRIPTS[0].text
  );
  const [emotion, setEmotion] = useState<DeliveryEmotion>("natural");
  const [pace, setPace] = useState<DeliveryPace>("normal");
  const [engine, setEngine] = useState<"flash" | "lite">("flash");

  const [dsp, setDsp] = useState<DspSettings>({
    enabled: true,
    pitchSemitones: activeProfile.pitchShiftSemitones,
    speed: 1.0,
    warmthDb: activeProfile.warmthDb,
    clarityDb: activeProfile.clarityDb,
  });

  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [rawAudioBlob, setRawAudioBlob] = useState<Blob | null>(null);
  const [processedAudioBlob, setProcessedAudioBlob] = useState<Blob | null>(null);
  const [currentClipMeta, setCurrentClipMeta] = useState<{
    title: string;
    metaLine: string;
  } | null>(null);

  const [referenceBlob, setReferenceBlob] = useState<Blob | null>(null);
  const [isPlayingRef, setIsPlayingRef] = useState(false);

  useEffect(() => {
    if (initialText) {
      setText(initialText);
    }
  }, [initialText]);

  // Sync DSP sliders whenever the selected voice profile changes
  useEffect(() => {
    setDsp({
      enabled: true,
      pitchSemitones: activeProfile.pitchShiftSemitones,
      speed: 1.0,
      warmthDb: activeProfile.warmthDb,
      clarityDb: activeProfile.clarityDb,
    });

    if (activeProfile.hasReferenceAudio) {
      loadAudioBlob(`referenceAudio:${activeProfile.id}`).then((b) =>
        setReferenceBlob(b)
      );
    } else {
      setReferenceBlob(null);
    }
  }, [activeProfile]);

  const playReferenceSample = () => {
    if (!referenceBlob || isPlayingRef) return;
    const url = URL.createObjectURL(referenceBlob);
    const audio = new Audio(url);
    setIsPlayingRef(true);
    audio.onended = () => {
      setIsPlayingRef(false);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      setIsPlayingRef(false);
      URL.revokeObjectURL(url);
    };
    audio.play().catch(() => {
      setIsPlayingRef(false);
      URL.revokeObjectURL(url);
    });
  };

  const insertCue = (cue: string) => {
    setText((prev) => {
      const trimmed = prev.trimEnd();
      return trimmed ? `${trimmed} ${cue} ` : `${cue} `;
    });
  };

  const handleEnhanceText = async () => {
    if (!text.trim() || isEnhancing) return;
    setIsEnhancing(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/script/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, style: emotion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "পাঠ্য পরিমার্জন ব্যর্থ হয়েছে।");
      if (data.enhancedText) {
        setText(data.enhancedText);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "পাঠ্য পরিমার্জনে সমস্যা হয়েছে।"
      );
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleGenerateSpeech = async () => {
    if (!text.trim() || isGenerating) return;
    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          voiceName: activeProfile.baseVoice,
          stylePrompt: activeProfile.ttsStylePrompt,
          emotion,
          pace,
          engine,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "অডিও তৈরি করতে সমস্যা হয়েছে।");
      }

      const rawBlob = base64ToBlob(data.audioBase64, data.mimeType || "audio/wav");
      const dspResult = await applyVoiceMatchingDSP(rawBlob, dsp);

      const clipId = `clip-${Date.now()}`;
      await saveAudioBlob(`clipRaw:${clipId}`, rawBlob);
      await saveAudioBlob(`clipProcessed:${clipId}`, dspResult.blob);

      const cleanTitle =
        text.replace(/<[^>]+>/g, "").trim().slice(0, 48) +
        (text.trim().length > 48 ? "..." : "");

      const newClip: GeneratedClip = {
        id: clipId,
        title: cleanTitle || "অডিও ক্লিপ",
        text: text.trim(),
        voiceProfileId: activeProfile.id,
        voiceProfileName: activeProfile.name,
        baseVoice: activeProfile.baseVoice,
        emotion,
        pace,
        pitchShiftSemitones: dsp.enabled ? dsp.pitchSemitones : 0,
        playbackSpeed: dsp.enabled ? dsp.speed : 1,
        dspEnabled: dsp.enabled,
        durationSec: dspResult.durationSec,
        sampleRate: dspResult.sampleRate,
        createdAt: new Date().toISOString(),
      };

      setRawAudioBlob(rawBlob);
      setProcessedAudioBlob(dspResult.blob);
      setCurrentClipMeta({
        title: newClip.title,
        metaLine: `ভয়েস: ${activeProfile.name} · পিচ সমন্বয়: ${
          dsp.enabled ? `${dsp.pitchSemitones >= 0 ? "+" : ""}${dsp.pitchSemitones} st` : "বন্ধ"
        } · ${(dspResult.sampleRate / 1000).toFixed(0)} kHz WAV`,
      });

      onClipGenerated(newClip);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "অডিও তৈরি করা যায়নি। আবার চেষ্টা করুন।"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReprocessDsp = async () => {
    if (!rawAudioBlob || isReprocessing) return;
    setIsReprocessing(true);
    setErrorMsg(null);
    try {
      const dspResult = await applyVoiceMatchingDSP(rawAudioBlob, dsp);
      setProcessedAudioBlob(dspResult.blob);
      setCurrentClipMeta((prev) =>
        prev
          ? {
              ...prev,
              metaLine: `ভয়েস: ${activeProfile.name} · পিচ সমন্বয়: ${
                dsp.enabled ? `${dsp.pitchSemitones >= 0 ? "+" : ""}${dsp.pitchSemitones} st` : "বন্ধ"
              } · ${(dspResult.sampleRate / 1000).toFixed(0)} kHz WAV`,
            }
          : null
      );
    } catch {
      setErrorMsg("অডিও ক্যালিব্রেশন পুনরায় প্রয়োগ করা যায়নি।");
    } finally {
      setIsReprocessing(false);
    }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-6">
      {/* Active Voice Banner / Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{activeProfile.isCustom ? "কাস্টম নিজস্ব কণ্ঠ" : "স্টুডিও প্রিসেট কণ্ঠ"}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              মৌলিক পিচ {activeProfile.metrics.avgPitchHz} Hz
            </span>
            <span aria-hidden="true">·</span>
            <span>বেস মডেল {activeProfile.baseVoice}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1 truncate">
            {activeProfile.name}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {activeProfile.toneSummaryBn}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {referenceBlob && (
            <button
              type="button"
              onClick={playReferenceSample}
              disabled={isPlayingRef}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isPlayingRef ? "নমুনা চলছে..." : "মূল কণ্ঠ শুনুন"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenCalibrate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {activeProfile.isCustom ? "আবার রেকর্ড করুন" : "নিজের কণ্ঠ যুক্ত করুন"}
            </span>
          </button>
        </div>
      </div>

      {/* Main TTS Editor + Delivery Controls Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Script Editor */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              পাঠ্য লিখুন (বাংলা বা ইংরেজি)
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {SAMPLE_SCRIPTS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setText(s.text);
                    setEmotion(s.emotion);
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            maxLength={3000}
            placeholder="এখানে আপনার বাংলা বা ইংরেজি লেখা লিখুন বা পেস্ট করুন..."
            className="w-full p-4 text-[15px] leading-relaxed text-slate-900 bg-slate-50 border border-slate-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-colors"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500 mr-1">ভোকাল সংকেত:</span>
              <button
                type="button"
                onClick={() => insertCue("<breath>")}
                className="px-2.5 py-1 text-xs font-mono text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                + শ্বাস (&lt;breath&gt;)
              </button>
              <button
                type="button"
                onClick={() => insertCue("<laugh>")}
                className="px-2.5 py-1 text-xs font-mono text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                + হাসি (&lt;laugh&gt;)
              </button>
              <button
                type="button"
                onClick={() => insertCue("<gasp>")}
                className="px-2.5 py-1 text-xs font-mono text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                + বিস্ময় (&lt;gasp&gt;)
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {wordCount} শব্দ · {text.length}/3000
              </span>
              <button
                type="button"
                onClick={handleEnhanceText}
                disabled={isEnhancing || !text.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {isEnhancing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>বিরামচিহ্ন ও ছন্দ ঠিক করুন</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs leading-relaxed"
            >
              <div className="flex items-start gap-2.5 flex-1 min-w-[200px]">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={handleGenerateSpeech}
                disabled={isGenerating || !text.trim()}
                className="px-3 py-1.5 text-xs font-semibold text-red-800 bg-white hover:bg-red-100 border border-red-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                আবার চেষ্টা করুন
              </button>
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={handleGenerateSpeech}
              disabled={isGenerating || !text.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-500 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>আপনার কণ্ঠে অডিও তৈরি হচ্ছে...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                  <span>অডিও তৈরি করুন</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Delivery & Voice-Match DSP Controls */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              কথার ভঙ্গি ও ভয়েস ম্যাচিং ক্যালিব্রেশন
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              কণ্ঠের আবেগ, গতি ও পিচ সূক্ষ্মভাবে নিয়ন্ত্রণ করুন।
            </p>
          </div>

          {/* Emotion Segmented Buttons */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              উপস্থাপনার ধরন
            </span>
            <div className="flex flex-wrap gap-1.5">
              {EMOTION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEmotion(opt.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    emotion === opt.id
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pace + Engine */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-2">
                কথার ছন্দ
              </span>
              <div className="flex items-center p-1 bg-slate-100 rounded-lg">
                {PACE_OPTIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPace(p.id)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      pace === p.id
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-2">
                ভয়েস ইঞ্জিন
              </span>
              <div className="flex items-center p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setEngine("flash")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    engine === "flash"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  স্টুডিও ডিজাইন
                </button>
                <button
                  type="button"
                  onClick={() => setEngine("lite")}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    engine === "lite"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  দ্রুতগতি
                </button>
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Acoustic DSP Panel */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-600" aria-hidden="true" />
                <span className="text-xs font-semibold text-slate-800">
                  নিজস্ব পিচ ও টোন ম্যাচিং (DSP)
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={dsp.enabled}
                onClick={() => setDsp((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  dsp.enabled
                    ? "bg-blue-700 text-white"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {dsp.enabled ? "চালু" : "বন্ধ"}
              </button>
            </div>

            <div className={`space-y-3.5 ${dsp.enabled ? "opacity-100" : "opacity-45 pointer-events-none"}`}>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">পিচ সমন্বয় (Pitch Shift)</span>
                  <span className="font-mono tabular-nums text-slate-900 font-medium">
                    {dsp.pitchSemitones >= 0 ? `+${dsp.pitchSemitones.toFixed(1)}` : dsp.pitchSemitones.toFixed(1)} st
                  </span>
                </div>
                <input
                  type="range"
                  min={-6}
                  max={6}
                  step={0.5}
                  value={dsp.pitchSemitones}
                  onChange={(e) =>
                    setDsp((prev) => ({
                      ...prev,
                      pitchSemitones: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full studio-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">বলার গতি (Tempo)</span>
                  <span className="font-mono tabular-nums text-slate-900 font-medium">
                    {dsp.speed.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.8}
                  max={1.25}
                  step={0.05}
                  value={dsp.speed}
                  onChange={(e) =>
                    setDsp((prev) => ({
                      ...prev,
                      speed: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full studio-slider"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">ভরাট টোন (Warmth)</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {dsp.warmthDb >= 0 ? `+${dsp.warmthDb}` : dsp.warmthDb} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-4}
                    max={5}
                    step={0.5}
                    value={dsp.warmthDb}
                    onChange={(e) =>
                      setDsp((prev) => ({
                        ...prev,
                        warmthDb: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">স্পষ্টতা (Presence)</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {dsp.clarityDb >= 0 ? `+${dsp.clarityDb}` : dsp.clarityDb} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-4}
                    max={5}
                    step={0.5}
                    value={dsp.clarityDb}
                    onChange={(e) =>
                      setDsp((prev) => ({
                        ...prev,
                        clarityDb: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full studio-slider"
                  />
                </div>
              </div>

              {rawAudioBlob && (
                <button
                  type="button"
                  onClick={handleReprocessDsp}
                  disabled={isReprocessing}
                  className="w-full py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                >
                  {isReprocessing
                    ? "অডিও সমন্বয় হচ্ছে..."
                    : "নতুন পিচ ও টোন সেটিংস বর্তমান অডিওতে প্রয়োগ করুন"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Active Waveform Output */}
      {processedAudioBlob && currentClipMeta && (
        <WaveformPlayer
          audioBlob={processedAudioBlob}
          rawBlob={rawAudioBlob}
          title={currentClipMeta.title}
          metaLine={currentClipMeta.metaLine}
          fileName={`konthostudio-${Date.now()}.wav`}
        />
      )}
    </div>
  );
};
