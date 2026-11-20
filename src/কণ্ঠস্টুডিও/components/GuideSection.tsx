import React from "react";

interface GuideSectionProps {
  onStartCalibrate: () => void;
}

export const GuideSection: React.FC<GuideSectionProps> = ({ onStartCalibrate }) => {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8 space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <h2 className="text-2xl font-bold text-slate-900">
          নিজস্ব কণ্ঠস্বরে অডিও তৈরির পূর্ণাঙ্গ নির্দেশিকা
        </h2>
        <p className="text-sm text-slate-600 mt-1.5 max-w-3xl">
          সর্বোচ্চ স্বাভাবিক ও পরিষ্কার আউটপুট পেতে ভয়েস নমুনা রেকর্ড এবং স্ক্রিপ্ট লেখার সময় নিচের নিয়মগুলো অনুসরণ করুন।
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-slate-900">
            ০১. পরিষ্কার ভয়েস নমুনা ধারণ
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            নিরিবিলি ঘরে মাইক্রোফোন থেকে ১৫ থেকে ২০ সেন্টিমিটার দূরে রেখে স্বাভাবিক স্বরে ৮ থেকে ১৫ সেকেন্ড কথা বলুন। ফ্যান বা বাইরের শোরগোল এড়িয়ে চলুন যাতে মৌলিক পিচ (Hz) সঠিকভাবে পরিমাপ করা যায়।
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-base font-semibold text-slate-900">
            ০২. ভোকাল বিশ্লেষণ ও ম্যাচিং
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            আপনার রেকর্ড করা অডিও থেকে স্টুডিওটি স্বরের ফ্রিকোয়েন্সি, অনুরণন ও বলার ছন্দ বিশ্লেষণ করে সবচেয়ে কাছাকাছি ভোকাল বেস ও ভয়েস ডিজাইন নির্দেশনা তৈরি করে এবং WSOLA পিচ-শিফট ও EQ দিয়ে কণ্ঠ ম্যাচ করে।
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-base font-semibold text-slate-900">
            ০৩. বিরামচিহ্ন ও ভোকাল সংকেত
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            বাক্যের মাঝে স্বাভাবিক বিরতির জন্য বাংলা দাঁড়ি (।) ও কমা (,) ব্যবহার করুন। এছাড়া গল্প বা পডকাস্টের ক্ষেত্রে <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">&lt;breath&gt;</code> বা <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">&lt;laugh&gt;</code> ট্যাগ ব্যবহার করলে কণ্ঠ আরও জীবন্ত শোনায়।
          </p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            এখনো আপনার নিজের কণ্ঠ যুক্ত করেননি?
          </h4>
          <p className="text-xs text-slate-600 mt-0.5">
            মাত্র ১০ সেকেন্ডের একটি রেকর্ডিং দিয়েই আপনার নিজস্ব ভয়েস প্রোফাইল তৈরি করুন।
          </p>
        </div>
        <button
          type="button"
          onClick={onStartCalibrate}
          className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          ভয়েস রেকর্ড শুরু করুন
        </button>
      </div>
    </section>
  );
};
