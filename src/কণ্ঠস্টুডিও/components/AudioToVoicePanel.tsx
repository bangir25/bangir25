import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRightLeft,
  FileAudio,
  Loader2,
  Mic,
  Sliders,
  Upload,
  Volume2,
} from "lucide-react";
import {
  AcousticMetrics,
  DeliveryEmotion,
  DeliveryPace,
  GeneratedClip,
  VoiceProfile,
} from "../types/voice";
import {
  analyzeAudioAcoustics,
  applyVoiceMatchingDSP,
  base64ToBlob,
  blobToBase64,
  decodeAudioBlob,
  encodeCompactWav16k,
  encodeWavFromFloat32,
  getMonoChannelData,
} from "../utils/audioProcessor";
import { saveAudioBlob } from "../utils/storage";
import { WaveformPlayer } from "./WaveformPlayer";

interface AudioToVoicePanelProps {
  activeProfile: VoiceProfile;
  onOpenCalibrate: () => void;
  onClipGenerated: (clip: GeneratedClip) => void;
}

type ConvertMode = "revoice" | "direct_dsp";

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

export const AudioToVoicePanel: React.FC<AudioToVoicePanelProps> = ({
  activeProfile,
  onOpenCalibrate,
  onClipGenerated,
}) => {
  const [mode, setMode] = useState<ConvertMode>("revoice");
  const [isDragging, setIsDragging] = useState(false);

  const [fileName, setFileName] = useState<string>("");
  const [sourceWavBlob, setSourceWavBlob] = useState<Blob | null>(null);
  const [compactWavBlob, setCompactWavBlob] = useState<Blob | null>(null);
  const [sourceMetrics, setSourceMetrics] = useState<AcousticMetrics | null>(null);

  const [transcript, setTranscript] = useState<string>("");
  const [emotion, setEmotion] = useState<DeliveryEmotion>("natural");
  const [pace, setPace] = useState<DeliveryPace>("normal");

  // Fine DSP sliders (auto-calibrated whenever profile or source audio changes)
  const [pitchSemitones, setPitchSemitones] = useState<number>(
    activeProfile.pitchShiftSemitones
  );
  const [directPitchSemitones, setDirectPitchSemitones] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(1.0);
  const [warmthDb, setWarmthDb] = useState<number>(activeProfile.warmthDb);
  const [clarityDb, setClarityDb] = useState<number>(activeProfile.clarityDb);

  const [isDecoding, setIsDecoding] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [convertedBlob, setConvertedBlob] = useState<Blob | null>(null);
  const [convertedMeta, setConvertedMeta] = useState<{
    title: string;
    metaLine: string;
  } | null>(null);

  useEffect(() => {
    setPitchSemitones(activeProfile.pitchShiftSemitones);
    setWarmthDb(activeProfile.warmthDb);
    setClarityDb(activeProfile.clarityDb);

    if (sourceMetrics?.avgPitchHz && activeProfile.metrics.avgPitchHz) {
      const ratio = activeProfile.metrics.avgPitchHz / sourceMetrics.avgPitchHz;
      const calc = Number((12 * Math.log2(ratio)).toFixed(1));
      setDirectPitchSemitones(Math.max(-10, Math.min(10, calc)));
    }
  }, [activeProfile, sourceMetrics]);

  const handleLoadAudioFile = async (file: File) => {
    if (file.size > 30 * 1024 * 1024) {
      setErrorMsg("অডিও ফাইলের আকার ৩০ MB-এর কম হতে হবে।");
      return;
    }

    setErrorMsg(null);
    setIsDecoding(true);
    setConvertedBlob(null);
    setConvertedMeta(null);
    setTranscript("");

    try {
      const buffer = await decodeAudioBlob(file);
      if (buffer.duration < 0.8) {
        setErrorMsg("অডিও ফাইলটি খুব ছোট (কমপক্ষে ১ সেকেন্ডের অডিও দিন)।");
        setIsDecoding(false);
        return;
      }

      const measured = analyzeAudioAcoustics(buffer);
      const mono = getMonoChannelData(buffer);
      const fullWav = encodeWavFromFloat32(mono, buffer.sampleRate);
      const compact = await encodeCompactWav16k(buffer);

      setFileName(file.name);
      setSourceWavBlob(fullWav);
      setCompactWavBlob(compact);
      setSourceMetrics(measured);
    } catch {
      setErrorMsg(
        "অডিও ফাইলটি ডিকোড করা যায়নি। অনুগ্রহ করে একটি বৈধ MP3, WAV, M4A বা OGG ফাইল দিন।"
      );
    } finally {
      setIsDecoding(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLoadAudioFile(file);
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleLoadAudioFile(file);
    }
  };

  const transcribeUploadedAudio = async (): Promise<string> => {
    if (!compactWavBlob) {
      throw new Error("প্রথমে একটি অডিও ফাইল আপলোড করুন।");
    }
    setIsTranscribing(true);
    try {
      const audioBase64 = await blobToBase64(compactWavBlob);
      const res = await fetch("/api/audio/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64,
          mimeType: "audio/wav",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "অডিও থেকে কথা শনাক্ত করা যায়নি।");
      }
      setTranscript(data.transcript);
      return data.transcript as string;
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTranscribeOnly = async () => {
    setErrorMsg(null);
    try {
      await transcribeUploadedAudio();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "অডিও ট্রান্সক্রাইব করা যায়নি।"
      );
    }
  };

  const handleConvertToMyVoice = async () => {
    if (!sourceWavBlob) return;
    setErrorMsg(null);
    setIsConverting(true);

    try {
      if (mode === "direct_dsp") {
        const dspResult = await applyVoiceMatchingDSP(sourceWavBlob, {
          enabled: true,
          pitchSemitones: directPitchSemitones,
          speed,
          warmthDb,
          clarityDb,
        });

        const clipId = `clip-${Date.now()}`;
        await saveAudioBlob(`clipRaw:${clipId}`, sourceWavBlob);
        await saveAudioBlob(`clipProcessed:${clipId}`, dspResult.blob);

        const baseTitle = fileName.replace(/\.[^.]+$/, "") || "রূপান্তরিত অডিও";
        const newClip: GeneratedClip = {
          id: clipId,
          title: `${baseTitle} (পিচ ম্যাচ)`,
          text: `অডিও রূপান্তর: ${fileName}`,
          voiceProfileId: activeProfile.id,
          voiceProfileName: activeProfile.name,
          baseVoice: activeProfile.baseVoice,
          emotion,
          pace,
          pitchShiftSemitones: directPitchSemitones,
          playbackSpeed: speed,
          dspEnabled: true,
          durationSec: dspResult.durationSec,
          sampleRate: dspResult.sampleRate,
          createdAt: new Date().toISOString(),
        };

        setConvertedBlob(dspResult.blob);
        setConvertedMeta({
          title: newClip.title,
          metaLine: `লক্ষ্য কণ্ঠ: ${activeProfile.name} · পিচ পরিবর্তন: ${
            directPitchSemitones >= 0 ? `+${directPitchSemitones}` : directPitchSemitones
          } st · ${(dspResult.sampleRate / 1000).toFixed(0)} kHz WAV`,
        });

        onClipGenerated(newClip);
        return;
      }

      // Mode 1: AI Re-voicing in the user's own voice profile
      let textToSpeak = transcript.trim();
      if (!textToSpeak) {
        textToSpeak = await transcribeUploadedAudio();
      }

      const res = await fetch("/api/tts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textToSpeak,
          voiceName: activeProfile.baseVoice,
          stylePrompt: activeProfile.ttsStylePrompt,
          emotion,
          pace,
          engine: "flash",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "আপনার কণ্ঠে অডিও তৈরি করতে সমস্যা হয়েছে।");
      }

      const rawAiBlob = base64ToBlob(
        data.audioBase64,
        data.mimeType || "audio/wav"
      );

      const dspResult = await applyVoiceMatchingDSP(rawAiBlob, {
        enabled: true,
        pitchSemitones,
        speed,
        warmthDb,
        clarityDb,
      });

      const clipId = `clip-${Date.now()}`;
      await saveAudioBlob(`clipRaw:${clipId}`, sourceWavBlob);
      await saveAudioBlob(`clipProcessed:${clipId}`, dspResult.blob);

      const baseTitle = fileName.replace(/\.[^.]+$/, "") || "রূপান্তরিত অডিও";
      const newClip: GeneratedClip = {
        id: clipId,
        title: `${baseTitle} (${activeProfile.name})`,
        text: textToSpeak,
        voiceProfileId: activeProfile.id,
        voiceProfileName: activeProfile.name,
        baseVoice: activeProfile.baseVoice,
        emotion,
        pace,
        pitchShiftSemitones: pitchSemitones,
        playbackSpeed: speed,
        dspEnabled: true,
        durationSec: dspResult.durationSec,
        sampleRate: dspResult.sampleRate,
        createdAt: new Date().toISOString(),
      };

      setConvertedBlob(dspResult.blob);
      setConvertedMeta({
        title: newClip.title,
        metaLine: `রূপান্তরিত কণ্ঠ: ${activeProfile.name} · পিচ: ${
          pitchSemitones >= 0 ? `+${pitchSemitones}` : pitchSemitones
        } st · ${(dspResult.sampleRate / 1000).toFixed(0)} kHz WAV`,
      });

      onClipGenerated(newClip);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "অডিও রূপান্তর করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।"
      );
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Target Voice Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>অডিও ফাইল থেকে কণ্ঠ রূপান্তর</span>
            <span aria-hidden="true">·</span>
            <span>সক্রিয় কণ্ঠ: {activeProfile.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              লক্ষ্য পিচ {activeProfile.metrics.avgPitchHz} Hz
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            যেকোনো অডিও ফাইলকে আপনার নিজের কণ্ঠে তৈরি করুন
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            একটি অডিও ফাইল আপলোড করুন—সিস্টেম অডিওটির কথা শনাক্ত করে আপনার সংরক্ষিত কণ্ঠস্বরে নতুন অডিও তৈরি করবে অথবা সরাসরি পিচ ম্যাচ করে দেবে।
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenCalibrate}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Mic className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {activeProfile.isCustom ? "ভয়েস প্রোফাইল পরিবর্তন" : "নিজের কণ্ঠ যুক্ত করুন"}
          </span>
        </button>
      </div>

      {!activeProfile.isCustom && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-amber-900 leading-relaxed">
            <strong>পরামর্শ:</strong> এই মুহূর্তে একটি স্টুডিও প্রিসেট ভয়েস নির্বাচিত আছে। ঠিক আপনার নিজের কণ্ঠে অডিও রূপান্তর করতে চাইলে বাম পাশ থেকে আপনার কাস্টম ভয়েস নির্বাচন করুন বা ১০ সেকেন্ডের নমুনা রেকর্ড করুন।
          </div>
          <button
            type="button"
            onClick={onOpenCalibrate}
            className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            আমার কণ্ঠ রেকর্ড করুন
          </button>
        </div>
      )}

      {/* Upload + Mode Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: File Dropzone + Transcript Editor */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              ১. অডিও ফাইল নির্বাচন করুন
            </h2>
            {sourceMetrics && (
              <span className="text-xs font-mono tabular-nums text-slate-500">
                দৈর্ঘ্য {sourceMetrics.durationSec.toFixed(1)}s · মূল পিচ{" "}
                {sourceMetrics.avgPitchHz} Hz
              </span>
            )}
          </div>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`block border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
              isDragging
                ? "border-blue-600 bg-blue-50/70"
                : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100/70"
            }`}
          >
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileInputChange}
              className="sr-only"
            />
            <div className="w-11 h-11 rounded-full bg-white border border-slate-200 text-blue-700 flex items-center justify-center mx-auto mb-3">
              {isDecoding ? (
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <div className="text-sm font-semibold text-slate-900">
              {isDecoding
                ? "অডিও ফাইল প্রসেস করা হচ্ছে..."
                : fileName
                ? `নির্বাচিত ফাইল: ${fileName}`
                : "অডিও ফাইল এখানে টেনে আনুন বা ক্লিক করে বাছাই করুন"}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              MP3, WAV, M4A, OGG, WebM সমর্থিত (সর্বোচ্চ ৩০ MB)
            </p>
          </label>

          {sourceWavBlob && sourceMetrics && (
            <WaveformPlayer
              audioBlob={sourceWavBlob}
              title={`মূল অডিও: ${fileName}`}
              metaLine={`সময়কাল: ${sourceMetrics.durationSec.toFixed(1)}s · পরিমাপকৃত পিচ: ${sourceMetrics.avgPitchHz} Hz`}
              fileName={`original-${fileName.replace(/\.[^.]+$/, "")}.wav`}
            />
          )}

          {/* Mode Toggle */}
          <div className="pt-1">
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              রূপান্তরের পদ্ধতি
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setMode("revoice")}
                className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors text-left cursor-pointer ${
                  mode === "revoice"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <div>AI প্রতিলিপি ও নিজের কণ্ঠে পুনর্কথন</div>
                <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                  কথা শনাক্ত করে আপনার ভয়েস প্রোফাইলে নতুন অডিও তৈরি
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode("direct_dsp")}
                className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors text-left cursor-pointer ${
                  mode === "direct_dsp"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <div>সরাসরি পিচ ও টোন ম্যাচিং (DSP)</div>
                <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                  মূল অডিওর ছন্দ ও কথা অপরিবর্তিত রেখে পিচ ও টোন বদল
                </div>
              </button>
            </div>
          </div>

          {/* Editable Transcript for AI Re-voicing Mode */}
          {mode === "revoice" && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="audio-transcript-box"
                  className="text-xs font-semibold text-slate-700"
                >
                  অডিও থেকে শনাক্তকৃত কথা (প্রয়োজনে সম্পাদনা করুন)
                </label>
                <button
                  type="button"
                  onClick={handleTranscribeOnly}
                  disabled={!compactWavBlob || isTranscribing || isConverting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isTranscribing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileAudio className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>
                    {transcript
                      ? "আবার কথা শনাক্ত করুন"
                      : "অডিও থেকে লেখা বের করুন"}
                  </span>
                </button>
              </div>

              <textarea
                id="audio-transcript-box"
                rows={4}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="“অডিও থেকে লেখা বের করুন” বাটনে ক্লিক করুন, অথবা নিচের মূল বাটনে ক্লিক করলে স্বয়ংক্রিয়ভাবে লেখা শনাক্ত হয়ে আপনার কণ্ঠে অডিও তৈরি হবে..."
                className="w-full p-3.5 text-sm leading-relaxed text-slate-900 bg-slate-50 border border-slate-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs leading-relaxed"
            >
              <div className="flex items-start gap-2.5 flex-1 min-w-[200px]">
                <AlertCircle
                  className="w-4 h-4 text-red-600 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={handleConvertToMyVoice}
                disabled={!sourceWavBlob || isConverting}
                className="px-3 py-1.5 text-xs font-semibold text-red-800 bg-white hover:bg-red-100 border border-red-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                আবার চেষ্টা করুন
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleConvertToMyVoice}
            disabled={!sourceWavBlob || isDecoding || isTranscribing || isConverting}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-500 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {isConverting || isTranscribing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>
                  {isTranscribing
                    ? "অডিও থেকে কথা শনাক্ত করা হচ্ছে..."
                    : "আপনার কণ্ঠে অডিও তৈরি হচ্ছে..."}
                </span>
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
                <span>
                  {mode === "revoice"
                    ? "এই অডিওটি আমার নিজের কণ্ঠে তৈরি করুন"
                    : "সরাসরি পিচ ও টোন ম্যাচিং প্রয়োগ করুন"}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Right: Voice Match & Delivery Parameters */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              ২. কণ্ঠ ম্যাচিং ও ভঙ্গি নিয়ন্ত্রণ
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              আপনার নির্বাচিত ভয়েস প্রোফাইলের ({activeProfile.name}) সাথে মিল রেখে সেটিংস সমন্বয় করুন।
            </p>
          </div>

          {mode === "revoice" && (
            <>
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

              <hr className="border-slate-200" />
            </>
          )}

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-800">
                অ্যাকোস্টিক পিচ ও টোন ক্যালিব্রেশন
              </span>
            </div>

            {mode === "revoice" ? (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">পিচ সমন্বয় (প্রোফাইল অনুযায়ী)</span>
                  <span className="font-mono tabular-nums text-slate-900 font-medium">
                    {pitchSemitones >= 0
                      ? `+${pitchSemitones.toFixed(1)}`
                      : pitchSemitones.toFixed(1)}{" "}
                    st
                  </span>
                </div>
                <input
                  type="range"
                  min={-6}
                  max={6}
                  step={0.5}
                  value={pitchSemitones}
                  onChange={(e) => setPitchSemitones(parseFloat(e.target.value))}
                  className="w-full studio-slider"
                />
              </div>
            ) : (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">
                    সরাসরি পিচ পরিবর্তন ({sourceMetrics ? `${sourceMetrics.avgPitchHz} Hz → ${activeProfile.metrics.avgPitchHz} Hz` : "অটো"})
                  </span>
                  <span className="font-mono tabular-nums text-slate-900 font-medium">
                    {directPitchSemitones >= 0
                      ? `+${directPitchSemitones.toFixed(1)}`
                      : directPitchSemitones.toFixed(1)}{" "}
                    st
                  </span>
                </div>
                <input
                  type="range"
                  min={-10}
                  max={10}
                  step={0.5}
                  value={directPitchSemitones}
                  onChange={(e) =>
                    setDirectPitchSemitones(parseFloat(e.target.value))
                  }
                  className="w-full studio-slider"
                />
              </div>
            )}

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600">বলার গতি (Tempo)</span>
                <span className="font-mono tabular-nums text-slate-900 font-medium">
                  {speed.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.8}
                max={1.25}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full studio-slider"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">ভরাট টোন (Warmth)</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {warmthDb >= 0 ? `+${warmthDb}` : warmthDb} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={-4}
                  max={5}
                  step={0.5}
                  value={warmthDb}
                  onChange={(e) => setWarmthDb(parseFloat(e.target.value))}
                  className="w-full studio-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">স্পষ্টতা (Presence)</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {clarityDb >= 0 ? `+${clarityDb}` : clarityDb} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={-4}
                  max={5}
                  step={0.5}
                  value={clarityDb}
                  onChange={(e) => setClarityDb(parseFloat(e.target.value))}
                  className="w-full studio-slider"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Final Converted Output Player */}
      {convertedBlob && convertedMeta && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Volume2 className="w-4 h-4 text-blue-700" aria-hidden="true" />
            <span>আপনার কণ্ঠে রূপান্তরিত অডিও প্রস্তুত (তুলনা ও ডাউনলোড করুন)</span>
          </div>
          <WaveformPlayer
            audioBlob={convertedBlob}
            rawBlob={sourceWavBlob}
            title={convertedMeta.title}
            metaLine={convertedMeta.metaLine}
            fileName={`my-voice-${fileName.replace(/\.[^.]+$/, "") || "audio"}.wav`}
          />
        </div>
      )}
    </div>
  );
};
