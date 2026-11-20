import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Download,
  Eye,
  Film,
  FolderOpen,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";

interface VideoStudioWorkspaceProps {
  onBackToDashboard: () => void;
}

interface ColorGradeSettings {
  brightness: number;
  contrast: number;
  saturate: number;
  hueRotate: number;
  sepia: number;
  sharpness: number;
  denoise: number;
}

const DEFAULT_GRADE: ColorGradeSettings = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hueRotate: 0,
  sepia: 0,
  sharpness: 0,
  denoise: 0,
};

const CLEAR_BASE_GRADE: ColorGradeSettings = {
  brightness: 106,
  contrast: 116,
  saturate: 114,
  hueRotate: 0,
  sepia: 0,
  sharpness: 55,
  denoise: 25,
};

const GRADE_PRESETS: { id: string; label: string; values: ColorGradeSettings }[] = [
  { id: "autoclear", label: "অটো ক্লিয়ার", values: CLEAR_BASE_GRADE },
  { id: "natural", label: "মূল রঙ", values: DEFAULT_GRADE },
  {
    id: "cinematic",
    label: "সিনেম্যাটিক ওয়ার্ম",
    values: { brightness: 104, contrast: 118, saturate: 116, hueRotate: -4, sepia: 12, sharpness: 50, denoise: 20 },
  },
  {
    id: "cool",
    label: "কুল স্টুডিও",
    values: { brightness: 103, contrast: 115, saturate: 104, hueRotate: 8, sepia: 0, sharpness: 55, denoise: 25 },
  },
  {
    id: "vivid",
    label: "ভাইব্র্যান্ট HD",
    values: { brightness: 107, contrast: 122, saturate: 132, hueRotate: 0, sepia: 0, sharpness: 65, denoise: 25 },
  },
  {
    id: "mono",
    label: "মনোক্রোম",
    values: { brightness: 104, contrast: 126, saturate: 0, hueRotate: 0, sepia: 0, sharpness: 55, denoise: 20 },
  },
];

function analyzeFrameAndComputeGrade(video: HTMLVideoElement): {
  grade: ColorGradeSettings;
  summary: string;
} {
  const w = 160;
  const h = 90;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx || !video.videoWidth || !video.videoHeight) {
    return {
      grade: CLEAR_BASE_GRADE,
      summary: "অটো কালার কারেকশন ও ক্লিয়ারিটি (+৫৫%) প্রয়োগ করা হয়েছে।",
    };
  }

  let data: Uint8ClampedArray;
  try {
    ctx.drawImage(video, 0, 0, w, h);
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return {
      grade: CLEAR_BASE_GRADE,
      summary: "অটো কালার কারেকশন ও ক্লিয়ারিটি (+৫৫%) প্রয়োগ করা হয়েছে।",
    };
  }

  const lumaHist = new Uint32Array(256);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLuma = 0;
  const totalPixels = w * h;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = Math.min(255, Math.max(0, Math.round(0.299 * r + 0.587 * g + 0.114 * b)));
    lumaHist[y]++;
    sumR += r;
    sumG += g;
    sumB += b;
    sumLuma += y;
  }

  const avgR = sumR / totalPixels;
  const avgG = sumG / totalPixels;
  const avgB = sumB / totalPixels;
  const avgLuma = sumLuma / totalPixels;

  let cumulative = 0;
  let p05 = 0;
  let p95 = 255;
  const lowTarget = totalPixels * 0.05;
  const highTarget = totalPixels * 0.95;

  for (let i = 0; i < 256; i++) {
    cumulative += lumaHist[i];
    if (cumulative >= lowTarget && p05 === 0) p05 = i;
    if (cumulative >= highTarget) {
      p95 = i;
      break;
    }
  }

  const spread = Math.max(40, p95 - p05);

  // Target comfortable mid-tone luminance around 128
  let brightness = 100;
  if (avgLuma < 118) {
    brightness = Math.min(126, Math.round(100 + ((124 - avgLuma) / 124) * 28));
  } else if (avgLuma > 165) {
    brightness = Math.max(92, Math.round(100 - ((avgLuma - 160) / 95) * 12));
  } else {
    brightness = 104;
  }

  // Boost contrast smoothly when dynamic range is flat/hazy
  let contrast = 112;
  if (spread < 170) {
    contrast = Math.min(130, Math.round(112 + ((175 - spread) / 135) * 20));
  }

  // Mild vibrance restoration
  const maxChannel = Math.max(avgR, avgG, avgB);
  const minChannel = Math.min(avgR, avgG, avgB);
  const colorDiff = maxChannel - minChannel;
  const saturate = colorDiff < 18 ? 122 : colorDiff < 35 ? 116 : 110;

  // Neutralize noticeable warm/cool color cast gently
  let hueRotate = 0;
  let sepia = 0;
  if (avgB - avgR > 14) {
    // Footage is slightly too cold/bluish -> add subtle warmth
    sepia = 8;
    hueRotate = -3;
  } else if (avgR - avgB > 22) {
    // Footage is overly yellow/orange -> cool slightly
    hueRotate = 6;
  }

  const sharpness = 58;
  const denoise = avgLuma < 95 ? 35 : 22;

  const computed: ColorGradeSettings = {
    brightness,
    contrast,
    saturate,
    hueRotate,
    sepia,
    sharpness,
    denoise,
  };

  return {
    grade: computed,
    summary: `অটো কালার কারেকশন সম্পন্ন: ক্লিয়ারিটি +${sharpness}%, কনট্রাস্ট ${contrast}%, উজ্জ্বলতা ${brightness}%, রঙ ${saturate}%`,
  };
}

export const VideoStudioWorkspace: React.FC<VideoStudioWorkspaceProps> = ({
  onBackToDashboard,
}) => {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [grade, setGrade] = useState<ColorGradeSettings>(CLEAR_BASE_GRADE);
  const [activePreset, setActivePreset] = useState<string>("autoclear");
  const [autoCorrectOnUpload, setAutoCorrectOnUpload] = useState(true);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [autoNotice, setAutoNotice] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoAnalyzedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Real-time 3x3 sharpening convolution kernel coefficient for live preview clarity
  const sharpK = compareOriginal ? 0 : (grade.sharpness / 100) * 0.42;
  const sharpCenter = (1 + 4 * sharpK).toFixed(3);
  const sharpEdge = (-sharpK).toFixed(3);
  const sharpenMatrix = `0 ${sharpEdge} 0 ${sharpEdge} ${sharpCenter} ${sharpEdge} 0 ${sharpEdge} 0`;

  const effectiveFilterCss = compareOriginal
    ? "none"
    : `brightness(${grade.brightness}%) contrast(${grade.contrast}%) saturate(${grade.saturate}%) hue-rotate(${grade.hueRotate}deg) sepia(${grade.sepia}%)${
        grade.sharpness > 0 ? " url(#video-studio-clarity)" : ""
      }`;

  const runAutoColorCorrection = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const { grade: autoGrade, summary } = analyzeFrameAndComputeGrade(video);
    setGrade(autoGrade);
    setActivePreset("autoclear");
    setCompareOriginal(false);
    setAutoNotice(summary);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    const nextUrl = URL.createObjectURL(file);
    autoAnalyzedUrlRef.current = null;
    setSourceFile(file);
    setVideoUrl(nextUrl);
    setFileName(file.name);
    setIsPlaying(false);
    setCurrentTime(0);
    setCompareOriginal(false);
    setAutoNotice(null);
    setExportStatus(null);
    setExportError(null);
  };

  const handleLoadedData = () => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (autoAnalyzedUrlRef.current === videoUrl) return;
    autoAnalyzedUrlRef.current = videoUrl;

    if (autoCorrectOnUpload) {
      // Sample a visible frame slightly past any initial fade-in
      const sampleTime =
        video.duration && Number.isFinite(video.duration) && video.duration > 0.6
          ? Math.min(0.4, video.duration * 0.1)
          : 0;

      if (sampleTime > 0.05) {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          runAutoColorCorrection();
          video.currentTime = 0;
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = sampleTime;
      } else {
        runAutoColorCorrection();
      }
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleApplyPreset = (presetId: string, values: ColorGradeSettings) => {
    setActivePreset(presetId);
    setGrade(values);
    setCompareOriginal(false);
    setAutoNotice(null);
  };

  const handleSliderChange = (key: keyof ColorGradeSettings, value: number) => {
    setActivePreset("custom");
    setCompareOriginal(false);
    setGrade((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setActivePreset("natural");
    setGrade(DEFAULT_GRADE);
    setPlaybackRate(1);
    setCompareOriginal(false);
    setAutoNotice(null);
  };

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      ctx.filter = `brightness(${grade.brightness}%) contrast(${grade.contrast}%) saturate(${grade.saturate}%) hue-rotate(${grade.hueRotate}deg) sepia(${grade.sepia}%)`;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) {
          setExportError("ফ্রেম সংরক্ষণ করা যায়নি। তবে আপনি MP4 ডাউনলোড করতে পারবেন।");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `video-studio-frame-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setExportError(null);
        setExportStatus("বর্তমান ক্লিয়ার ফ্রেম PNG হিসেবে সংরক্ষণ করা হয়েছে।");
      }, "image/png");
    } catch {
      setExportStatus(null);
      setExportError("ব্রাউজার নিরাপত্তা সীমাবদ্ধতার কারণে ফ্রেমটি PNG হিসেবে ক্যাপচার করা যায়নি; তবে সরাসরি MP4 ডাউনলোড কাজ করবে।");
    }
  };

  const handleExportMp4 = async () => {
    if (!sourceFile || isExporting) return;

    setIsExporting(true);
    setExportError(null);
    setExportStatus("ভিডিও কালার কারেকশন, ক্লিয়ারিটি এবং MP4 এনকোডিং চলছে...");

    try {
      const params = new URLSearchParams({
        filename: sourceFile.name,
        brightness: String(grade.brightness),
        contrast: String(grade.contrast),
        saturate: String(grade.saturate),
        hueRotate: String(grade.hueRotate),
        sepia: String(grade.sepia),
        sharpness: String(grade.sharpness),
        denoise: String(grade.denoise),
        speed: String(playbackRate),
      });

      const response = await fetch(`/api/video/export-mp4?${params.toString()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        body: sourceFile,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(
          errBody.error || "MP4 ভিডিও তৈরি করতে সমস্যা হয়েছে।"
        );
      }

      const mp4Blob = await response.blob();
      const downloadUrl = URL.createObjectURL(mp4Blob);
      const a = document.createElement("a");
      const baseName = fileName.replace(/\.[^/.]+$/, "") || "video-studio";
      a.href = downloadUrl;
      a.download = `${baseName}-clear.mp4`;
      a.click();
      URL.revokeObjectURL(downloadUrl);

      setExportStatus(
        `সফলভাবে "${baseName}-clear.mp4" ফাইলটি ডাউনলোড হয়েছে।`
      );
    } catch (err) {
      setExportStatus(null);
      setExportError(
        err instanceof Error
          ? err.message
          : "MP4 ডাউনলোড করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।"
      );
    } finally {
      setIsExporting(false);
    }
  };

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      {/* Hidden SVG Convolution Filter for Real-Time Clarity/Sharpness Preview */}
      <svg className="sr-only" width="0" height="0" aria-hidden="true">
        <defs>
          <filter id="video-studio-clarity" colorInterpolationFilters="sRGB">
            <feConvolveMatrix
              order="3"
              kernelMatrix={sharpenMatrix}
              preserveAlpha="true"
            />
          </filter>
        </defs>
      </svg>

      {/* Folder Navigation Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>ড্যাশবোর্ড</span>
          </button>
          <span className="text-slate-300" aria-hidden="true">
            /
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 text-indigo-700 shrink-0" aria-hidden="true" />
            <span className="text-sm font-bold text-slate-900 truncate">
              Video Studio
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoCorrectOnUpload}
              onChange={(e) => setAutoCorrectOnUpload(e.target.checked)}
              className="w-4 h-4 accent-indigo-700 rounded cursor-pointer"
            />
            <span>আপলোড করলে অটো কালার কারেকশন ও ক্লিয়ার</span>
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>{videoUrl ? "নতুন ভিডিও আপলোড" : "ভিডিও আপলোড করুন"}</span>
          </button>
        </div>
      </div>

      {/* Main Video Studio Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6 items-start">
        {/* Preview Player */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">
                ভিডিও কালার কারেকশন ও ক্লিয়ার স্টুডিও
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {fileName || "ভিডিও আপলোড করলেই স্বয়ংক্রিয়ভাবে কালার কারেকশন ও ক্লিয়ার হয়ে যাবে এবং MP4 ডাউনলোড করা যাবে"}
              </p>
            </div>

            {videoUrl && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setCompareOriginal((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    compareOriginal
                      ? "bg-amber-50 text-amber-800 border-amber-300"
                      : "bg-emerald-50 text-emerald-800 border-emerald-300"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{compareOriginal ? "মূল ভিডিও দেখছেন" : "ক্লিয়ার ও কারেক্টেড"}</span>
                </button>

                <span className="text-xs font-mono tabular-nums text-slate-600">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
            )}
          </div>

          {autoNotice && videoUrl && !compareOriginal && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
              <CheckCircle2 className="w-4 h-4 text-indigo-700 shrink-0" aria-hidden="true" />
              <span>{autoNotice}</span>
            </div>
          )}

          <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-200 flex items-center justify-center">
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                crossOrigin="anonymous"
                onLoadedData={handleLoadedData}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onEnded={() => setIsPlaying(false)}
                style={{ filter: effectiveFilterCss }}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center p-6 space-y-3 max-w-md">
                <div className="w-12 h-12 rounded-xl bg-slate-800 text-indigo-400 flex items-center justify-center mx-auto">
                  <Film className="w-6 h-6" aria-hidden="true" />
                </div>
                <div className="text-sm font-semibold text-white">
                  ভিডিও আপলোড করে কালার কারেকশন ও ক্লিয়ার করুন
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  যেকোনো ভিডিও ফাইল আপলোড করলে স্বয়ংক্রিয়ভাবে কালার কারেকশন, ক্লিয়ারিটি ও শার্পনেস ঠিক হয়ে যাবে এবং সরাসরি MP4 ফরম্যাটে ডাউনলোড করতে পারবেন।
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>ভিডিও ফাইল নির্বাচন করুন</span>
                </button>
              </div>
            )}
          </div>

          {/* Transport Controls */}
          {videoUrl && (
            <div className="space-y-3 pt-1">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.05}
                value={currentTime}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCurrentTime(val);
                  if (videoRef.current) videoRef.current.currentTime = val;
                }}
                aria-label="ভিডিও টাইমলাইন"
                className="w-full accent-indigo-700 cursor-pointer"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>বিরতি</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>চালান</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={isMuted ? "শব্দ চালু করুন" : "মিউট করুন"}
                    className="p-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    {isMuted ? (
                      <VolumeX className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Volume2 className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>

                  <select
                    value={playbackRate}
                    onChange={(e) => setPlaybackRate(Number(e.target.value))}
                    aria-label="প্লেব্যাক গতি"
                    className="px-2.5 py-2 text-xs font-mono bg-slate-100 border border-slate-200 rounded-lg text-slate-800 cursor-pointer"
                  >
                    <option value={0.5}>0.5x</option>
                    <option value={1}>1.0x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2.0x</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCaptureFrame}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>ফ্রেম সংরক্ষণ</span>
                  </button>

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={handleExportMp4}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{isExporting ? "MP4 তৈরি হচ্ছে..." : "MP4 ডাউনলোড করুন"}</span>
                  </button>
                </div>
              </div>

              {exportStatus && (
                <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  {exportStatus}
                </p>
              )}

              {exportError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {exportError}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Color Correction & Clarity Controls Sidebar */}
        <aside className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-700" aria-hidden="true" />
              <h2 className="text-sm font-bold text-slate-900">কালার কারেকশন ও ক্লিয়ার</h2>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>রিসেট</span>
            </button>
          </div>

          <button
            type="button"
            disabled={!videoUrl}
            onClick={runAutoColorCorrection}
            className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-45 rounded-lg transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-indigo-300" aria-hidden="true" />
            <span>অটো কালার কারেকশন ও ক্লিয়ার করুন</span>
          </button>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-500">কালার প্রিসেট</div>
            <div className="flex flex-wrap gap-1.5">
              {GRADE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset.id, preset.values)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    activePreset === preset.id
                      ? "bg-indigo-700 text-white border-indigo-700"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3.5 pt-1">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 font-medium">ক্লিয়ারিটি / শার্পনেস</span>
                <span className="font-mono tabular-nums text-slate-500">{grade.sharpness}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={grade.sharpness}
                onChange={(e) => handleSliderChange("sharpness", Number(e.target.value))}
                className="w-full accent-indigo-700 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 font-medium">নয়েজ ক্লিন (Denoise)</span>
                <span className="font-mono tabular-nums text-slate-500">{grade.denoise}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={grade.denoise}
                onChange={(e) => handleSliderChange("denoise", Number(e.target.value))}
                className="w-full accent-indigo-700 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 font-medium">উজ্জ্বলতা (Brightness)</span>
                <span className="font-mono tabular-nums text-slate-500">{grade.brightness}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={160}
                value={grade.brightness}
                onChange={(e) => handleSliderChange("brightness", Number(e.target.value))}
                className="w-full accent-indigo-700 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 font-medium">কনট্রাস্ট (Contrast)</span>
                <span className="font-mono tabular-nums text-slate-500">{grade.contrast}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={180}
                value={grade.contrast}
                onChange={(e) => handleSliderChange("contrast", Number(e.target.value))}
                className="w-full accent-indigo-700 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 font-medium">স্যাচুরেশন (Saturation)</span>
                <span className="font-mono tabular-nums text-slate-500">{grade.saturate}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                value={grade.saturate}
                onChange={(e) => handleSliderChange("saturate", Number(e.target.value))}
                className="w-full accent-indigo-700 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 font-medium">কালার টোন (Hue)</span>
                <span className="font-mono tabular-nums text-slate-500">{grade.hueRotate}°</span>
              </div>
              <input
                type="range"
                min={-90}
                max={90}
                value={grade.hueRotate}
                onChange={(e) => handleSliderChange("hueRotate", Number(e.target.value))}
                className="w-full accent-indigo-700 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 font-medium">ওয়ার্মথ (Warmth)</span>
                <span className="font-mono tabular-nums text-slate-500">{grade.sepia}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={grade.sepia}
                onChange={(e) => handleSliderChange("sepia", Number(e.target.value))}
                className="w-full accent-indigo-700 cursor-pointer"
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
