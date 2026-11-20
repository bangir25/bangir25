import React, { useMemo, useState } from "react";
import { Download, FileAudio, Play, Search, Trash2 } from "lucide-react";
import { GeneratedClip } from "../types/voice";
import { loadAudioBlob } from "../utils/storage";
import { WaveformPlayer } from "./WaveformPlayer";

interface AudioLibraryProps {
  clips: GeneratedClip[];
  onDeleteClip: (id: string) => void;
  onReuseText: (text: string) => void;
  onGoToStudio: () => void;
}

export const AudioLibrary: React.FC<AudioLibraryProps> = ({
  clips,
  onDeleteClip,
  onReuseText,
  onGoToStudio,
}) => {
  const [query, setQuery] = useState("");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activeBlob, setActiveBlob] = useState<Blob | null>(null);
  const [activeRawBlob, setActiveRawBlob] = useState<Blob | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clips;
    return clips.filter(
      (c) =>
        c.text.toLowerCase().includes(q) ||
        c.voiceProfileName.toLowerCase().includes(q)
    );
  }, [clips, query]);

  const selectedClip = clips.find((c) => c.id === selectedClipId) || null;

  const handleLoadPlayer = async (clip: GeneratedClip) => {
    setSelectedClipId(clip.id);
    const processed = await loadAudioBlob(`clipProcessed:${clip.id}`);
    const raw = await loadAudioBlob(`clipRaw:${clip.id}`);
    setActiveBlob(processed || raw);
    setActiveRawBlob(raw);
  };

  const handleDirectDownload = async (clip: GeneratedClip) => {
    const blob =
      (await loadAudioBlob(`clipProcessed:${clip.id}`)) ||
      (await loadAudioBlob(`clipRaw:${clip.id}`));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clip.id}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (clips.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-4">
          <FileAudio className="w-6 h-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">
          এখনো কোনো অডিও তৈরি করা হয়নি
        </h2>
        <p className="text-sm text-slate-600 mt-1.5 max-w-md mx-auto">
          আপনি টেক্সট টু স্পিচ স্টুডিও থেকে যেকোনো লেখা অডিওতে রূপান্তর করলে তা এখানে সংরক্ষিত থাকবে।
        </p>
        <button
          type="button"
          onClick={onGoToStudio}
          className="mt-5 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer"
        >
          প্রথম অডিও তৈরি করুন
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {selectedClip && activeBlob && (
        <WaveformPlayer
          audioBlob={activeBlob}
          rawBlob={activeRawBlob}
          title={selectedClip.title}
          metaLine={`ভয়েস: ${selectedClip.voiceProfileName} · সময়কাল: ${selectedClip.durationSec.toFixed(1)}s`}
          fileName={`${selectedClip.id}.wav`}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              তৈরিকৃত অডিও লাইব্রেরি
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              মোট সংরক্ষিত ক্লিপ: {clips.length}টি
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="লেখা বা ভয়েস খুঁজুন..."
              className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {filtered.map((clip) => {
            const isSelected = clip.id === selectedClipId;
            return (
              <div
                key={clip.id}
                className={`p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                  isSelected ? "bg-blue-50/50" : "hover:bg-slate-50"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {clip.voiceProfileName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {clip.durationSec.toFixed(1)}s
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      পিচ {clip.pitchShiftSemitones >= 0 ? `+${clip.pitchShiftSemitones}` : clip.pitchShiftSemitones} st
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {new Date(clip.createdAt).toLocaleDateString("bn-BD")}
                    </span>
                  </div>
                  <p className="text-sm text-slate-900 font-medium mt-1 line-clamp-2">
                    {clip.text}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleLoadPlayer(clip)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>শুনুন</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onReuseText(clip.text)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    এডিটরে নিন
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDirectDownload(clip)}
                    aria-label="WAV ডাউনলোড"
                    className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteClip(clip.id)}
                    aria-label="ক্লিপ মুছুন"
                    className="p-2 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
