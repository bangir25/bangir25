import React from "react";
import { ArrowRight, Film, Folder, FolderOpen, History } from "lucide-react";
import { ActivityEntry, GeneratedClip, VoiceProfile } from "../types/voice";

interface DashboardHomeProps {
  profiles: VoiceProfile[];
  clips: GeneratedClip[];
  activities: ActivityEntry[];
  onOpenFolder: () => void;
  onOpenVideoStudio: () => void;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  profiles,
  clips,
  activities,
  onOpenFolder,
  onOpenVideoStudio,
}) => {

  return (
    <div className="space-y-8">
      {/* Main Clickable Folder Tiles (no white fill) */}
      <section aria-label="ফোল্ডার তালিকা" className="space-y-3">
        <button
          type="button"
          onClick={onOpenFolder}
          className="group w-full text-left bg-transparent hover:bg-slate-950/35 border border-white/25 hover:border-blue-400/80 rounded-xl p-5 sm:p-6 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-14 h-14 rounded-xl bg-blue-600/90 group-hover:bg-blue-500 text-white flex items-center justify-center shrink-0 transition-colors">
                <Folder className="w-7 h-7 group-hover:hidden" aria-hidden="true" />
                <FolderOpen className="w-7 h-7 hidden group-hover:block" aria-hidden="true" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 font-mono tabular-nums">
                  <span>/ড্যাশবোর্ড/কণ্ঠস্টুডিও</span>
                  <span aria-hidden="true">·</span>
                  <span>{profiles.length} প্রোফাইল</span>
                  <span aria-hidden="true">·</span>
                  <span>{clips.length} অডিও</span>
                </div>
                <h3 className="text-xl font-bold text-white mt-1 tracking-wide">
                  কণ্ঠস্টুডিও
                </h3>
                <p className="text-sm text-slate-200 mt-1">
                  ভেতরে রয়েছে: টেক্সট টু স্পিচ · অডিও রূপান্তর · ভয়েস প্রোফাইল · অডিও লাইব্রেরি · ভয়েস প্রোফাইলসমূহ ও ডাটা
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 group-hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center">
              <span>ফোল্ডার খুলুন</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenVideoStudio}
          className="group w-full text-left bg-transparent hover:bg-slate-950/35 border border-white/25 hover:border-indigo-400/80 rounded-xl p-5 sm:p-6 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-14 h-14 rounded-xl bg-indigo-600/90 group-hover:bg-indigo-500 text-white flex items-center justify-center shrink-0 transition-colors">
                <Film className="w-7 h-7 group-hover:hidden" aria-hidden="true" />
                <FolderOpen className="w-7 h-7 hidden group-hover:block" aria-hidden="true" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 font-mono tabular-nums">
                  <span>/ড্যাশবোর্ড/Video Studio</span>
                  <span aria-hidden="true">·</span>
                  <span>প্রোডাকশন স্টুডিও</span>
                </div>
                <h3 className="text-xl font-bold text-white mt-1 tracking-wide">
                  Video Studio
                </h3>
                <p className="text-sm text-slate-200 mt-1">
                  ভেতরে রয়েছে: অটো কালার কারেকশন ও ক্লিয়ার · লাইভ তুলনা · MP4 ডাউনলোড
                </p>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 group-hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center">
              <span>ফোল্ডার খুলুন</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
        </button>
      </section>

      {/* Recent Activity Preview on Dashboard (no white fill) */}
      {activities.length > 0 && (
        <section className="border-t border-white/20 pt-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-300" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-white tracking-wide">
                সাম্প্রতিক কার্যক্রম (কণ্ঠস্টুডিও)
              </h2>
            </div>
            <button
              type="button"
              onClick={onOpenFolder}
              className="text-xs font-semibold text-blue-300 hover:text-blue-200 hover:underline whitespace-nowrap cursor-pointer"
            >
              সব দেখুন
            </button>
          </div>

          <div className="divide-y divide-white/15">
            {activities.slice(0, 4).map((act) => (
              <div
                key={act.id}
                className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 truncate">
                  <span className="font-semibold text-white">
                    {act.title}
                  </span>
                  {act.detail && (
                    <span className="text-slate-300 ml-2">· {act.detail}</span>
                  )}
                </div>
                <span className="font-mono tabular-nums text-[11px] text-slate-300 shrink-0">
                  {new Date(act.createdAt).toLocaleString("bn-BD")}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
