import React, { useEffect, useRef, useState } from "react";
import { Download, Pause, Play, Volume2 } from "lucide-react";
import { decodeAudioBlob, extractWaveformPeaks } from "../utils/audioProcessor";

interface WaveformPlayerProps {
  audioBlob: Blob;
  rawBlob?: Blob | null;
  title: string;
  metaLine: string;
  fileName?: string;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export const WaveformPlayer: React.FC<WaveformPlayerProps> = ({
  audioBlob,
  rawBlob,
  title,
  metaLine,
  fileName = "konthostudio-audio.wav",
}) => {
  const [compareOriginal, setCompareOriginal] = useState(false);
  const activeBlob = compareOriginal && rawBlob ? rawBlob : audioBlob;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(activeBlob);
    setAudioUrl(url);
    setIsPlaying(false);
    setCurrentTime(0);

    let cancelled = false;
    decodeAudioBlob(activeBlob)
      .then((buf) => {
        if (cancelled) return;
        setDuration(buf.duration);
        setPeaks(extractWaveformPeaks(buf, 88));
      })
      .catch(() => {
        if (!cancelled) {
          setPeaks(Array.from({ length: 88 }, () => 0.25));
        }
      });

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [activeBlob]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);

    const progress = duration > 0 ? currentTime / duration : 0;
    const count = peaks.length;
    const slotWidth = rect.width / count;
    const barWidth = Math.max(2, slotWidth * 0.58);
    const centerY = rect.height / 2;

    for (let i = 0; i < count; i++) {
      const barRatio = i / count;
      const barHeight = Math.max(4, peaks[i] * (rect.height - 10));
      const x = i * slotWidth + (slotWidth - barWidth) / 2;
      const y = centerY - barHeight / 2;

      ctx.fillStyle = barRatio <= progress ? "#3B82F6" : "#334155";
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1.5);
      ctx.fill();
    }
  }, [peaks, currentTime, duration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const handleCanvasSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = clickRatio * duration;
    setCurrentTime(audio.currentTime);
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="rounded-xl bg-[#0F172A] text-slate-100 border border-slate-800 p-5">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            if (e.currentTarget.duration && Number.isFinite(e.currentTarget.duration)) {
              setDuration(e.currentTarget.duration);
            }
          }}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Volume2 className="w-3.5 h-3.5 text-blue-400 shrink-0" aria-hidden="true" />
            <span className="truncate">{metaLine}</span>
          </div>
          <h3 className="text-base font-semibold text-white truncate mt-1">
            {title}
          </h3>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {rawBlob && rawBlob !== audioBlob && (
            <div className="flex items-center p-0.5 rounded-lg bg-slate-800 border border-slate-700">
              <button
                type="button"
                onClick={() => setCompareOriginal(false)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  !compareOriginal
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                ম্যাচড কণ্ঠ
              </button>
              <button
                type="button"
                onClick={() => setCompareOriginal(true)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  compareOriginal
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                মূল AI ভয়েস
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>WAV ডাউনলোড</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "বিরতি দিন" : "চালান"}
          className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {isPlaying ? (
            <Pause className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Play className="w-5 h-5 ml-0.5" aria-hidden="true" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasSeek}
            title="অডিওর যেকোনো অংশে ক্লিক করে শুনুন"
            className="w-full h-14 cursor-pointer block"
          />
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-300 shrink-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
    </div>
  );
};
