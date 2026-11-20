import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mic,
  RotateCcw,
  Square,
  Upload,
} from "lucide-react";
import {
  analyzeAudioAcoustics,
  blobToBase64,
  decodeAudioBlob,
  encodeWavFromFloat32,
} from "../utils/audioProcessor";
import { AcousticMetrics, GeminiBaseVoice, VoiceProfile } from "../types/voice";
import { saveAudioBlob } from "../utils/storage";
import { WaveformPlayer } from "./WaveformPlayer";

interface VoiceCalibrationPanelProps {
  onProfileCreated: (profile: VoiceProfile) => void;
  onCancel?: () => void;
}

const READING_PROMPTS = [
  {
    label: "সহজ কথোপকথন",
    text: "নমস্কার, আমি আমার নিজস্ব কণ্ঠস্বরের একটি ডিজিটাল ভয়েস প্রোফাইল তৈরি করছি। কথা বলার স্বাভাবিক ছন্দ, স্পষ্ট উচ্চারণ এবং স্বরের গভীরতা ধরে রাখতে আমি শান্ত ও সাবলীলভাবে এই বাক্যটি পড়ছি।",
  },
  {
    label: "গল্প ও আবৃত্তি",
    text: "বিকেলের নরম রোদ তখন জানালা গলে ঘরের ভেতর এসে পড়েছে। দূরের বাতাসে ভেসে আসছে নদীর শব্দ, আর আমি আমার চেনা কণ্ঠে আজকের নতুন গল্পটি বলতে শুরু করলাম।",
  },
  {
    label: "সংবাদ ও উপস্থাপনা",
    text: "স্বাগতম আজকের বিশেষ আয়োজনে। প্রযুক্তির নতুন এই যুগে আমাদের নিজের বাংলা কণ্ঠস্বর ব্যবহার করেই এখন যেকোনো লেখা মুহূর্তেই প্রাণবন্ত অডিওতে রূপান্তর করা সম্ভব।",
  },
];

export const VoiceCalibrationPanel: React.FC<VoiceCalibrationPanelProps> = ({
  onProfileCreated,
  onCancel,
}) => {
  const [selectedPromptIdx, setSelectedPromptIdx] = useState(0);
  const [profileName, setProfileName] = useState("আমার নিজের কণ্ঠ");
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [liveDb, setLiveDb] = useState(-60);

  const [sampleBlob, setSampleBlob] = useState<Blob | null>(null);
  const [sampleMimeType, setSampleMimeType] = useState("audio/wav");
  const [metrics, setMetrics] = useState<AcousticMetrics | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(44100);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const cleanupRecording = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    return () => cleanupRecording();
  }, []);

  const drawLiveMeter = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLen = analyser.fftSize;
    const dataArray = new Float32Array(bufferLen);

    const render = () => {
      analyser.getFloatTimeDomainData(dataArray);

      let sumSq = 0;
      for (let i = 0; i < bufferLen; i++) {
        sumSq += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sumSq / bufferLen);
      const db = rms > 1e-5 ? Math.max(-60, Math.round(20 * Math.log10(rms))) : -60;
      setLiveDb(db);

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Center guide line
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rect.height / 2);
      ctx.lineTo(rect.width, rect.height / 2);
      ctx.stroke();

      // Live oscilloscope waveform
      ctx.strokeStyle = "#3B82F6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sliceWidth = rect.width / bufferLen;
      let x = 0;
      for (let i = 0; i < bufferLen; i++) {
        const v = dataArray[i];
        const y = rect.height / 2 + v * (rect.height * 0.44);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
      ctx.restore();

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
  };

  const startRecording = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSampleBlob(null);
    setMetrics(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg("আপনার ব্রাউজারে মাইক্রোফোন রেকর্ডিং সমর্থিত নয়। অডিও ফাইল আপলোড করে চেষ্টা করুন।");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      sampleRateRef.current = ctx.sampleRate;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      chunksRef.current = [];

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(input));
      };

      // Mute destination monitoring to prevent feedback
      const zeroGain = ctx.createGain();
      zeroGain.gain.value = 0;

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(zeroGain);
      zeroGain.connect(ctx.destination);

      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);

      drawLiveMeter();
    } catch {
      cleanupRecording();
      setErrorMsg("মাইক্রোফোন ব্যবহারের অনুমতি পাওয়া যায়নি। ব্রাউজার পারমিশন দিয়ে আবার চেষ্টা করুন অথবা অডিও ফাইল আপলোড করুন।");
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    const totalLength = chunksRef.current.reduce((acc, c) => acc + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const sr = sampleRateRef.current;
    cleanupRecording();

    if (totalLength < sr * 1.5) {
      setErrorMsg("নমুনাটি খুব ছোট (কমপক্ষে ৩ থেকে ১০ সেকেন্ড কথা বলুন যাতে কণ্ঠ সঠিকভাবে বিশ্লেষণ করা যায়)।");
      return;
    }

    const wavBlob = encodeWavFromFloat32(merged, sr);
    await processLoadedSample(wavBlob, "audio/wav");
  };

  const processLoadedSample = async (blob: Blob, mimeType: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const decoded = await decodeAudioBlob(blob);
      if (decoded.duration < 1.5) {
        setErrorMsg("অনুগ্রহ করে কমপক্ষে ২ সেকেন্ড বা তার বেশি দৈর্ঘ্যের ভয়েস নমুনা দিন।");
        return;
      }
      const measured = analyzeAudioAcoustics(decoded);
      // Re-encode uploaded audio to normalized WAV for clean server analysis & playback
      const mono = decoded.getChannelData(0);
      const wavBlob = encodeWavFromFloat32(mono, decoded.sampleRate);
      setSampleBlob(wavBlob);
      setSampleMimeType(mimeType.includes("wav") ? "audio/wav" : "audio/wav");
      setMetrics(measured);
    } catch {
      setErrorMsg("অডিও ফাইলটি পড়া যায়নি। অনুগ্রহ করে একটি সঠিক WAV বা MP3 ফাইল দিন।");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 18 * 1024 * 1024) {
      setErrorMsg("ফাইলের আকার ১৮ MB-এর কম হতে হবে।");
      return;
    }
    await processLoadedSample(file, file.type || "audio/mp3");
    e.target.value = "";
  };

  const handleAnalyzeAndSave = async () => {
    if (!sampleBlob || !metrics) return;
    setIsAnalyzing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const audioBase64 = await blobToBase64(sampleBlob);
      const res = await fetch("/api/voice/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64,
          mimeType: sampleMimeType,
          clientMetrics: metrics,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ভয়েস বিশ্লেষণে সমস্যা হয়েছে।");
      }

      const id = `custom-${Date.now()}`;
      await saveAudioBlob(`referenceAudio:${id}`, sampleBlob);

      const newProfile: VoiceProfile = {
        id,
        name: profileName.trim() || "আমার নিজের কণ্ঠ",
        isCustom: true,
        createdAt: new Date().toISOString(),
        baseVoice: (data.recommendedBaseVoice as GeminiBaseVoice) || "Kore",
        pitchShiftSemitones: Number(
          Math.max(-5, Math.min(5, data.recommendedPitchShiftSemitones ?? 0)).toFixed(1)
        ),
        warmthDb: Number(Math.max(-3, Math.min(4, data.warmthDb ?? 1)).toFixed(1)),
        clarityDb: Number(Math.max(-3, Math.min(4, data.clarityDb ?? 1)).toFixed(1)),
        toneSummaryBn:
          data.toneSummaryBn || "আপনার নিজস্ব কণ্ঠের স্বর ও উচ্চারণ অনুযায়ী ক্যালিব্রেট করা প্রোফাইল।",
        vocalTraitsBn: Array.isArray(data.vocalTraitsBn)
          ? data.vocalTraitsBn.slice(0, 4)
          : ["নিজস্ব কণ্ঠ", "স্বাভাবিক গতি", "ক্যালিব্রেটেড পিচ"],
        ttsStylePrompt: data.ttsStylePrompt || "Warm, natural, articulate voice matching speaker cadence.",
        transcriptSample: data.transcriptSample || "",
        metrics,
        hasReferenceAudio: true,
      };

      setSuccessMsg("আপনার কণ্ঠস্বরের প্রোফাইল সফলভাবে বিশ্লেষণ ও সংরক্ষণ করা হয়েছে।");
      onProfileCreated(newProfile);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "ভয়েস বিশ্লেষণ ব্যর্থ হয়েছে।");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            নিজস্ব কণ্ঠস্বর রেকর্ড ও প্রোফাইল তৈরি
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            আপনার কণ্ঠের মৌলিক পিচ (Hz), স্বরের উষ্ণতা ও বলার ছন্দ পরিমাপ করে সিস্টেমটি আপনার মতো করে কথা বলার ভয়েস প্রোফাইল তৈরি করবে।
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            স্টুডিওতে ফিরুন
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6 items-start">
        {/* Left: Guided reading script & Microphone recorder */}
        <div className="lg:col-span-7 space-y-5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <span className="text-xs font-semibold text-slate-700">
                পড়ার জন্য নমুনা পাঠ্য (৫–১৫ সেকেন্ড পড়ুন)
              </span>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {READING_PROMPTS.map((item, idx) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setSelectedPromptIdx(idx)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      selectedPromptIdx === idx
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-base leading-relaxed">
              “{READING_PROMPTS[selectedPromptIdx].text}”
            </div>
          </div>

          {/* Live Microphone Oscilloscope */}
          <div className="rounded-xl bg-[#0F172A] border border-slate-800 p-4 text-slate-100">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
              <div className="flex items-center gap-2">
                {isRecording && (
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" aria-hidden="true" />
                )}
                <span>
                  {isRecording ? "লাইভ মাইক্রোফোন ইনপুট চালু আছে" : "ভয়েস রেকর্ড করার জন্য প্রস্তুত"}
                </span>
              </div>
              <div className="font-mono tabular-nums flex items-center gap-3">
                <span>ইনপুট: {isRecording ? `${liveDb} dB` : "-- dB"}</span>
                <span>সময়: 00:{String(recordSeconds).padStart(2, "0")}</span>
              </div>
            </div>

            <canvas
              ref={canvasRef}
              className="w-full h-24 rounded-lg bg-slate-950/60 block"
            />

            <div className="flex flex-wrap items-center gap-3 mt-4">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Mic className="w-4 h-4" aria-hidden="true" />
                  <span>{sampleBlob ? "আবার রেকর্ড করুন" : "রেকর্ড শুরু করুন"}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-current" aria-hidden="true" />
                  <span>রেকর্ডিং থামান</span>
                </button>
              )}

              <label className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer">
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>অডিও আপলোড (.wav / .mp3)</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>

              {sampleBlob && !isRecording && (
                <button
                  type="button"
                  onClick={() => {
                    setSampleBlob(null);
                    setMetrics(null);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>মুছে ফেলুন</span>
                </button>
              )}
            </div>
          </div>

          {sampleBlob && (
            <WaveformPlayer
              audioBlob={sampleBlob}
              title="আপনার রেকর্ডকৃত কণ্ঠের নমুনা"
              metaLine={`দৈর্ঘ্য: ${metrics?.durationSec.toFixed(1) ?? "0.0"}s · গড় পিচ: ${metrics?.avgPitchHz ?? "--"} Hz`}
              fileName="my-voice-sample.wav"
            />
          )}
        </div>

        {/* Right: Measured Acoustic DNA & Save Profile */}
        <div className="lg:col-span-5 space-y-5 bg-slate-50 border border-slate-200 rounded-xl p-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              ভয়েস প্রোফাইল বিবরণ ও অ্যাকোস্টিক পরিমাপ
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              নমুনা রেকর্ড বা আপলোড করলে নিচে আপনার কণ্ঠের প্রকৃত ফ্রিকোয়েন্সি ও পিচ দেখা যাবে।
            </p>
          </div>

          <div>
            <label
              htmlFor="voice-profile-name"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              প্রোফাইলের নাম
            </label>
            <input
              id="voice-profile-name"
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="যেমন: আমার নিজের কণ্ঠ"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500">মৌলিক পিচ (F0)</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {metrics ? `${metrics.avgPitchHz} Hz` : "-- Hz"}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500">পিচ পরিসীমা</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {metrics ? `${metrics.pitchMinHz}–${metrics.pitchMaxHz}` : "--"}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500">স্বরের উজ্জ্বলতা</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {metrics ? `${metrics.spectralCentroidHz} Hz` : "-- Hz"}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="text-xs text-slate-500">গড় ইনপুট লেভেল</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {metrics ? `${metrics.rmsDb} dB` : "-- dB"}
              </div>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs leading-relaxed"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="flex items-start gap-2.5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs leading-relaxed"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="button"
            disabled={!sampleBlob || isAnalyzing || isRecording}
            onClick={handleAnalyzeAndSave}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 disabled:text-slate-500 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>কণ্ঠস্বর বিশ্লেষণ করা হচ্ছে...</span>
              </>
            ) : (
              <span>কণ্ঠ বিশ্লেষণ ও প্রোফাইল সংরক্ষণ করুন</span>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};
