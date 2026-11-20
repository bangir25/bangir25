import { useEffect, useState } from "react";
import {
  ArrowLeft,
  FolderOpen,
  Mic,
  Plus,
  Trash2,
  UserCheck,
} from "lucide-react";
import { FolderTab, RootView, TopBar } from "./কণ্ঠস্টুডিও/components/TopBar";
import { DashboardHome } from "./কণ্ঠস্টুডিও/components/DashboardHome";
import { DashboardView } from "./কণ্ঠস্টুডিও/components/DashboardView";
import { VoiceCalibrationPanel } from "./কণ্ঠস্টুডিও/components/VoiceCalibrationPanel";
import { TtsWorkspace } from "./কণ্ঠস্টুডিও/components/TtsWorkspace";
import { AudioToVoicePanel } from "./কণ্ঠস্টুডিও/components/AudioToVoicePanel";
import { AudioLibrary } from "./কণ্ঠস্টুডিও/components/AudioLibrary";
import { GuideSection } from "./কণ্ঠস্টুডিও/components/GuideSection";
import { VideoStudioWorkspace } from "./কণ্ঠস্টুডিও/components/VideoStudioWorkspace";
import {
  ActivityEntry,
  ActivityType,
  GeneratedClip,
  VoiceProfile,
} from "./কণ্ঠস্টুডিও/types/voice";
import {
  DEFAULT_STUDIO_PROFILES,
  deleteAudioBlob,
  loadActivityLog,
  loadGeneratedClips,
  loadVoiceProfiles,
  saveActivityLog,
  saveGeneratedClips,
  saveVoiceProfiles,
} from "./কণ্ঠস্টুডিও/utils/storage";

const FOLDER_TABS: { id: FolderTab; label: string }[] = [
  { id: "tts", label: "টেক্সট টু স্পিচ" },
  { id: "convert", label: "অডিও রূপান্তর" },
  { id: "calibrate", label: "ভয়েস প্রোফাইল" },
  { id: "library", label: "অডিও লাইব্রেরি" },
  { id: "data", label: "ফোল্ডার ডাটা ও লগ" },
];

export default function App() {
  const [profiles, setProfiles] = useState<VoiceProfile[]>(() =>
    loadVoiceProfiles()
  );
  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    const initial = loadVoiceProfiles();
    const custom = initial.find((p) => p.isCustom);
    return custom ? custom.id : initial[0]?.id ?? DEFAULT_STUDIO_PROFILES[0].id;
  });

  const [clips, setClips] = useState<GeneratedClip[]>(() =>
    loadGeneratedClips()
  );
  const [activities, setActivities] = useState<ActivityEntry[]>(() =>
    loadActivityLog()
  );

  // Start cleanly on the Dashboard showing the "কণ্ঠস্টুডিও" folder
  const [rootView, setRootView] = useState<RootView>("dashboard");
  const [folderTab, setFolderTab] = useState<FolderTab>("tts");
  const [draftText, setDraftText] = useState<string | undefined>(undefined);

  useEffect(() => {
    saveVoiceProfiles(profiles);
  }, [profiles]);

  useEffect(() => {
    saveGeneratedClips(clips);
  }, [clips]);

  useEffect(() => {
    saveActivityLog(activities);
  }, [activities]);

  const logActivity = (type: ActivityType, title: string, detail: string) => {
    const entry: ActivityEntry = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      title,
      detail,
      createdAt: new Date().toISOString(),
    };
    setActivities((prev) => [entry, ...prev]);
  };

  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) ||
    profiles[0] ||
    DEFAULT_STUDIO_PROFILES[0];

  const customProfiles = profiles.filter((p) => p.isCustom);
  const presetProfiles = profiles.filter((p) => !p.isCustom);

  const openFolderAt = (tab: FolderTab) => {
    setFolderTab(tab);
    setRootView("folder");
  };

  const handleProfileCreated = (newProfile: VoiceProfile) => {
    setProfiles((prev) => [newProfile, ...prev]);
    setActiveProfileId(newProfile.id);
    logActivity(
      "voice_created",
      newProfile.name,
      `মৌলিক পিচ ${newProfile.metrics.avgPitchHz} Hz`
    );
    openFolderAt("tts");
  };

  const handleDeleteProfile = async (id: string) => {
    const target = profiles.find((p) => p.id === id);
    await deleteAudioBlob(`referenceAudio:${id}`);
    setProfiles((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (activeProfileId === id && next.length > 0) {
        setActiveProfileId(next[0].id);
      }
      return next.length > 0 ? next : DEFAULT_STUDIO_PROFILES;
    });
    if (target) {
      logActivity("profile_deleted", target.name, "ভয়েস প্রোফাইল মুছে ফেলা হয়েছে");
    }
  };

  const handleClipGenerated = (clip: GeneratedClip) => {
    setClips((prev) => [clip, ...prev]);
    logActivity(
      folderTab === "convert" ? "audio_converted" : "tts_generated",
      clip.title,
      `${clip.voiceProfileName} · ${clip.durationSec.toFixed(1)}s`
    );
  };

  const handleDeleteClip = async (id: string) => {
    const target = clips.find((c) => c.id === id);
    await deleteAudioBlob(`clipRaw:${id}`);
    await deleteAudioBlob(`clipProcessed:${id}`);
    setClips((prev) => prev.filter((c) => c.id !== id));
    if (target) {
      logActivity("clip_deleted", target.title, "অডিও ক্লিপ মুছে ফেলা হয়েছে");
    }
  };

  const handleReuseText = (text: string) => {
    setDraftText(text);
    openFolderAt("tts");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F7F9] text-[#0F172A]">
      <TopBar
        rootView={rootView}
        onSelectRootView={setRootView}
      />

      <main className="relative flex-1 w-full">
        {rootView === "dashboard" && (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 overflow-hidden bg-slate-950"
          >
            <img
              src="/assets/aistudio/Gemini_Generated_Image_xo1dndxo1dndxo1d_f3cccb35.jpg"
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-slate-950/60" />
          </div>
        )}

        <div className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {/* Root View 1: Clean Dashboard displaying the কণ্ঠস্টুডিও Folder */}
          {rootView === "dashboard" && (
            <DashboardHome
              profiles={profiles}
              clips={clips}
              activities={activities}
              onOpenFolder={() => openFolderAt("tts")}
              onOpenVideoStudio={() => setRootView("video_studio")}
            />
          )}

        {/* Root View 2: Inside the Opened কণ্ঠস্টুডিও Folder (all tools + voice profiles + data) */}
        {rootView === "folder" && (
          <div className="space-y-6">
            {/* Folder Navigation Bar: Breadcrumb + Screenshot 1 Options */}
            <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setRootView("dashboard")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>ড্যাশবোর্ড</span>
                </button>
                <span className="text-slate-300" aria-hidden="true">
                  /
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen
                    className="w-4 h-4 text-blue-700 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-bold text-slate-900 truncate">
                    কণ্ঠস্টুডিও
                  </span>
                </div>
              </div>

              {/* Screenshot 1 Options inside the Folder */}
              <nav
                aria-label="কণ্ঠস্টুডিও ফোল্ডার অপশনসমূহ"
                className="flex flex-wrap items-center gap-1.5"
              >
                {FOLDER_TABS.map((tab) => {
                  const isActive = folderTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFolderTab(tab.id)}
                      className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Folder Interior: Screenshot 2 Voice Profiles Sidebar + Active Studio Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-[272px_1fr] gap-6 lg:gap-8 items-start">
              <aside
                aria-label="ভয়েস প্রোফাইলসমূহ"
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-5 lg:sticky lg:top-24"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-900">
                    ভয়েস প্রোফাইলসমূহ
                  </h2>
                  <button
                    type="button"
                    onClick={() => setFolderTab("calibrate")}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>নতুন</span>
                  </button>
                </div>

                {/* Custom User Voices */}
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-2">
                    আপনার নিজস্ব কণ্ঠ
                  </div>

                  {customProfiles.length === 0 ? (
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        আপনি এখনো নিজের কণ্ঠ রেকর্ড করেননি। মাত্র ১০ সেকেন্ডের নমুনা দিয়ে প্রোফাইল তৈরি করুন।
                      </p>
                      <button
                        type="button"
                        onClick={() => setFolderTab("calibrate")}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer"
                      >
                        <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>আমার কণ্ঠ যুক্ত করুন</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {customProfiles.map((profile) => {
                        const isSelected = profile.id === activeProfile.id;
                        return (
                          <div
                            key={profile.id}
                            className={`group flex items-center justify-between gap-2 p-2.5 rounded-lg border transition-colors ${
                              isSelected
                                ? "bg-blue-50/70 border-blue-300"
                                : "bg-white border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveProfileId(profile.id);
                                if (folderTab === "calibrate") {
                                  setFolderTab("tts");
                                }
                              }}
                              className="flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5">
                                <UserCheck
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    isSelected
                                      ? "text-blue-700"
                                      : "text-slate-400"
                                  }`}
                                  aria-hidden="true"
                                />
                                <span className="text-xs font-semibold text-slate-900 truncate">
                                  {profile.name}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5 pl-5 truncate">
                                {profile.metrics.avgPitchHz} Hz ·{" "}
                                {profile.baseVoice}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProfile(profile.id)}
                              aria-label={`${profile.name} মুছুন`}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <hr className="border-slate-200" />

                {/* Studio Presets */}
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-2">
                    স্টুডিও প্রিসেট ভয়েস
                  </div>
                  <div className="space-y-1.5">
                    {presetProfiles.map((profile) => {
                      const isSelected = profile.id === activeProfile.id;
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => {
                            setActiveProfileId(profile.id);
                            if (folderTab === "calibrate") {
                              setFolderTab("tts");
                            }
                          }}
                          className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-slate-900 text-white border-slate-900"
                              : "bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <div className="text-xs font-semibold truncate">
                            {profile.name}
                          </div>
                          <div
                            className={`text-[11px] font-mono tabular-nums mt-0.5 truncate ${
                              isSelected ? "text-slate-300" : "text-slate-500"
                            }`}
                          >
                            {profile.metrics.avgPitchHz} Hz ·{" "}
                            {profile.vocalTraitsBn[0]}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </aside>

              <div className="min-w-0">
                {folderTab === "tts" && (
                  <TtsWorkspace
                    activeProfile={activeProfile}
                    initialText={draftText}
                    onOpenCalibrate={() => setFolderTab("calibrate")}
                    onClipGenerated={handleClipGenerated}
                  />
                )}

                {folderTab === "convert" && (
                  <AudioToVoicePanel
                    activeProfile={activeProfile}
                    onOpenCalibrate={() => setFolderTab("calibrate")}
                    onClipGenerated={handleClipGenerated}
                  />
                )}

                {folderTab === "calibrate" && (
                  <VoiceCalibrationPanel
                    onProfileCreated={handleProfileCreated}
                    onCancel={() => setFolderTab("tts")}
                  />
                )}

                {folderTab === "library" && (
                  <AudioLibrary
                    clips={clips}
                    onDeleteClip={handleDeleteClip}
                    onReuseText={handleReuseText}
                    onGoToStudio={() => setFolderTab("tts")}
                  />
                )}

                {folderTab === "data" && (
                  <DashboardView
                    profiles={profiles}
                    activeProfile={activeProfile}
                    clips={clips}
                    activities={activities}
                    onSelectProfile={setActiveProfileId}
                    onDeleteProfile={handleDeleteProfile}
                    onDeleteClip={handleDeleteClip}
                    onReuseText={handleReuseText}
                    onSelectFolderTab={setFolderTab}
                  />
                )}
              </div>
            </div>
          </div>
        )}

          {/* Root View 3: Video Studio Folder */}
          {rootView === "video_studio" && (
            <VideoStudioWorkspace
              onBackToDashboard={() => setRootView("dashboard")}
            />
          )}

          {/* Root View 4: Guide */}
          {rootView === "guide" && (
            <GuideSection onStartCalibrate={() => openFolderAt("calibrate")} />
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>কণ্ঠস্টুডিও — বাংলা ও বহুভাষিক টেক্সট-টু-স্পিচ ওয়ার্কস্পেস</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setRootView("guide")}
              className="hover:text-slate-900 hover:underline cursor-pointer"
            >
              ব্যবহার নির্দেশিকা
            </button>
            <span aria-hidden="true">·</span>
            <span>সকল ভয়েস প্রোফাইল ও অডিও “কণ্ঠস্টুডিও” ফোল্ডারে সংরক্ষিত থাকে</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
