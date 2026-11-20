import React from "react";

export type RootView = "dashboard" | "folder" | "video_studio" | "guide";
export type FolderTab = "tts" | "convert" | "calibrate" | "library" | "data";

interface TopBarProps {
  rootView: RootView;
  onSelectRootView: (view: RootView) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  rootView,
  onSelectRootView,
}) => {
  const navItems: { id: RootView; label: string }[] = [
    { id: "dashboard", label: "ড্যাশবোর্ড" },
    { id: "guide", label: "নির্দেশিকা" },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-center">
        <nav
          aria-label="প্রধান মেনু"
          className="flex items-center gap-7 text-sm font-medium"
        >
          {navItems.map((item) => {
            const isActive = rootView === item.id;
            if (item.id === "dashboard") {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectRootView("dashboard")}
                  aria-label="ড্যাশবোর্ড"
                  title="ড্যাশবোর্ড"
                  className="relative py-2.5 flex items-center justify-center shrink-0 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xl"
                >
                  <span className="w-11 h-11 rounded-xl overflow-hidden border border-slate-200 shadow-xs block transition-transform duration-150 group-hover:scale-105">
                    <img
                      src="/assets/aistudio/Gemini_Generated_Image_taspx0taspx0tasp_3b178314.jpg"
                      alt="ড্যাশবোর্ড"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </span>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-700"
                    />
                  )}
                </button>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectRootView(item.id)}
                className={`relative py-5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isActive
                    ? "text-slate-900 font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-700"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
