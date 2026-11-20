import React, { useMemo, useState } from "react";
import {
  Download,
  FileAudio,
  Folder,
  FolderOpen,
  History,
  Play,
  Search,
  Trash2,
  UserCheck,
} from "lucide-react";
import { ActivityEntry, GeneratedClip, VoiceProfile } from "../types/voice";
import { loadAudioBlob } from "../utils/storage";
import { FolderTab } from "./TopBar";
import { WaveformPlayer } from "./WaveformPlayer";

interface DashboardViewProps {
  profiles: VoiceProfile[];
  activeProfile: VoiceProfile;
  clips: GeneratedClip[];
  activities: ActivityEntry[];
  onSelectProfile: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  onDeleteClip: (clipId: string) => void;
  onReuseText: (text: string) => void;
  onSelectFolderTab: (tab: FolderTab) => void;
}

type FolderSection = "all" | "profiles" | "clips" | "activity";

function formatTotalDuration(totalSec: number): string {
  const rounded = Math.max(0, Math.round(totalSec));
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  profiles,
  activeProfile,
  clips,
  activities,
  onSelectProfile,
  onDeleteProfile,
  onDeleteClip,
  onReuseText,
  onSelectFolderTab,
}) => {
  const [folderSection, setFolderSection] = useState<FolderSection>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewClip, setPreviewClip] = useState<GeneratedClip | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewRawBlob, setPreviewRawBlob] = useState<Blob | null>(null);

  const customProfiles = useMemo(
    () => profiles.filter((p) => p.isCustom),
    [profiles]
  );
  const presetProfiles = useMemo(
    () => profiles.filter((p) => !p.isCustom),
    [profiles]
  );

  const totalDurationSec = useMemo(
    () => clips.reduce((acc, c) => acc + (c.durationSec || 0), 0),
    [clips]
  );

  const q = searchQuery.trim().toLowerCase();

  const filteredProfiles = useMemo(() => {
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.baseVoice.toLowerCase().includes(q) ||
        p.toneSummaryBn.toLowerCase().includes(q)
    );
  }, [profiles, q]);

  const filteredClips = useMemo(() => {
    if (!q) return clips;
    return clips.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.text.toLowerCase().includes(q) ||
        c.voiceProfileName.toLowerCase().includes(q)
    );
  }, [clips, q]);

  const filteredActivities = useMemo(() => {
    if (!q) return activities;
    return activities.filter(
      (a) =>
        a.title.toLowerCase().includes(q) || a.detail.toLowerCase().includes(q)
    );
  }, [activities, q]);

  const handlePlayClip = async (clip: GeneratedClip) => {
    setPreviewClip(clip);
    const processed = await loadAudioBlob(`clipProcessed:${clip.id}`);
    const raw = await loadAudioBlob(`clipRaw:${clip.id}`);
    setPreviewBlob(processed || raw);
    setPreviewRawBlob(raw);
  };

  const handleDownloadClip = async (clip: GeneratedClip) => {
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

  const handleExportFolderBackup = () => {
    const folderPayload = {
      folderName: "কণ্ঠস্টুডিও",
      exportedAt: new Date().toISOString(),
      activeProfileId: activeProfile.id,
      summary: {
        customProfilesCount: customProfiles.length,
        presetProfilesCount: presetProfiles.length,
        totalClipsCount: clips.length,
        totalDurationSec: Number(totalDurationSec.toFixed(2)),
      },
      data: {
        voiceProfiles: profiles,
        generatedClips: clips,
        activityHistory: activities,
      },
    };
    const blob = new Blob([JSON.stringify(folderPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `কণ্ঠস্টুডিও-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activityTypeLabel = (type: ActivityEntry["type"]) => {
    switch (type) {
      case "voice_created":
        return "ভয়েস প্রোফাইল তৈরি";
      case "tts_generated":
        return "টেক্সট থেকে অডিও";
      case "audio_converted":
        return "অডিও রূপান্তর";
      case "profile_deleted":
        return "প্রোফাইল অপসারণ";
      case "clip_deleted":
        return "ক্লিপ অপসারণ";
    }
  };

  return (
    <div className="space-y-6">
      {/* 4-Column Real KPI Metrics moved inside কণ্ঠস্টুডিও folder */}
      <section
        aria-label="কণ্ঠস্টুডিও পরিসংখ্যান"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">নিজস্ব কণ্ঠ প্রোফাইল</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {customProfiles.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            মোট প্রোফাইল: {profiles.length}টি
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">তৈরিকৃত অডিও ক্লিপ</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {clips.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            কণ্ঠস্টুডিও ফোল্ডারে সংরক্ষিত
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">মোট অডিও সময়কাল</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatTotalDuration(totalDurationSec)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            মিনিট : সেকেন্ড
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">সর্বশেষ কার্যক্রম</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {activities.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            মোট লগ রেকর্ড
          </div>
        </div>
      </section>

      {previewClip && previewBlob && (
        <WaveformPlayer
          audioBlob={previewBlob}
          rawBlob={previewRawBlob}
          title={previewClip.title}
          metaLine={`ফোল্ডার: কণ্ঠস্টুডিও / অডিও আউটপুট · ভয়েস: ${previewClip.voiceProfileName}`}
          fileName={`${previewClip.id}.wav`}
        />
      )}

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
              <FolderOpen className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">
                কণ্ঠস্টুডিও ফোল্ডার ডাটা ও কার্যক্রম
              </h2>
              <div className="text-xs text-slate-500 font-mono tabular-nums truncate">
                /কণ্ঠস্টুডিও ({profiles.length} প্রোফাইল · {clips.length} অডিও ·{" "}
                {activities.length} কার্যক্রম)
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-56">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ফোল্ডারে খুঁজুন..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <button
              type="button"
              onClick={handleExportFolderBackup}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>ফোল্ডার ব্যাকআপ (.json)</span>
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2 bg-white">
          {(
            [
              { id: "all", label: "সকল ডাটা" },
              { id: "profiles", label: `ভয়েস প্রোফাইল (${profiles.length})` },
              { id: "clips", label: `অডিও আউটপুট (${clips.length})` },
              { id: "activity", label: `কার্যক্রম লগ (${activities.length})` },
            ] as { id: FolderSection; label: string }[]
          ).map((tab) => {
            const active = folderSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFolderSection(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <Folder className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {(folderSection === "all" || folderSection === "profiles") && (
          <div className="p-5 border-b border-slate-200">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                ভয়েস প্রোফাইল তালিকা
              </h3>
              <button
                type="button"
                onClick={() => onSelectFolderTab("calibrate")}
                className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap cursor-pointer"
              >
                + নতুন কণ্ঠ যুক্ত করুন
              </button>
            </div>

            {filteredProfiles.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">
                কোনো ভয়েস প্রোফাইল পাওয়া যায়নি।
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-2 pr-4 font-medium">নাম</th>
                      <th className="py-2 pr-4 font-medium">ধরন</th>
                      <th className="py-2 pr-4 font-medium">বেস মডেল</th>
                      <th className="py-2 pr-4 font-medium">মৌলিক পিচ</th>
                      <th className="py-2 text-right font-medium">কার্যক্রম</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredProfiles.map((p) => {
                      const isActive = p.id === activeProfile.id;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="py-2.5 pr-4 font-semibold text-slate-900">
                            <div className="flex items-center gap-2">
                              <UserCheck
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isActive ? "text-blue-700" : "text-slate-400"
                                }`}
                                aria-hidden="true"
                              />
                              <span className="truncate max-w-[220px]">
                                {p.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-4 text-slate-600 whitespace-nowrap">
                            {p.isCustom ? "নিজস্ব কণ্ঠ" : "স্টুডিও প্রিসেট"}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-slate-600 whitespace-nowrap">
                            {p.baseVoice}
                          </td>
                          <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {p.metrics.avgPitchHz} Hz
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectProfile(p.id);
                                  onSelectFolderTab("tts");
                                }}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                                  isActive
                                    ? "bg-blue-700 text-white"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                }`}
                              >
                                {isActive ? "সক্রিয়" : "ব্যবহার করুন"}
                              </button>
                              {p.isCustom && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteProfile(p.id)}
                                  aria-label={`${p.name} মুছুন`}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {(folderSection === "all" || folderSection === "clips") && (
          <div className="p-5 border-b border-slate-200">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                অডিও আউটপুটসমূহ
              </h3>
              <button
                type="button"
                onClick={() => onSelectFolderTab("tts")}
                className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap cursor-pointer"
              >
                + নতুন অডিও তৈরি করুন
              </button>
            </div>

            {filteredClips.length === 0 ? (
              <div className="py-6 text-center bg-slate-50 rounded-lg border border-slate-200">
                <FileAudio
                  className="w-6 h-6 text-slate-400 mx-auto mb-2"
                  aria-hidden="true"
                />
                <p className="text-xs text-slate-600">
                  এখনো কোনো অডিও ক্লিপ তৈরি হয়নি।
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredClips.map((clip) => (
                  <div
                    key={clip.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-800">
                          {clip.voiceProfileName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {clip.durationSec.toFixed(1)}s
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {new Date(clip.createdAt).toLocaleString("bn-BD")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 mt-1 line-clamp-1">
                        {clip.text}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePlayClip(clip)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer whitespace-nowrap"
                      >
                        <Play className="w-3 h-3" aria-hidden="true" />
                        <span>শুনুন</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onReuseText(clip.text)}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer whitespace-nowrap"
                      >
                        এডিটরে নিন
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadClip(clip)}
                        aria-label="WAV ডাউনলোড"
                        className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteClip(clip.id)}
                        aria-label="ক্লিপ মুছুন"
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(folderSection === "all" || folderSection === "activity") && (
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-900">
                কার্যক্রম লগ
              </h3>
            </div>

            {filteredActivities.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
                ভয়েস প্রোফাইল তৈরি বা অডিও জেনারেট করলে এখানে প্রতিটি কার্যক্রমের সময়সহ ইতিহাস সংরক্ষিত হবে।
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredActivities.slice(0, 20).map((act) => (
                  <div
                    key={act.id}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-800">
                        {activityTypeLabel(act.type)}
                      </span>
                      <span className="text-slate-400 mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-700">{act.title}</span>
                      {act.detail && (
                        <>
                          <span className="text-slate-400 mx-1.5" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-slate-500">{act.detail}</span>
                        </>
                      )}
                    </div>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                      {new Date(act.createdAt).toLocaleString("bn-BD")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
