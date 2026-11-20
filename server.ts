import "dotenv/config";
import express from "express";
import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: "v1beta",
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function isTransientOverloadError(err: unknown): boolean {
  const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    raw.includes("503") ||
    raw.includes("unavailable") ||
    raw.includes("high demand") ||
    raw.includes("overloaded") ||
    raw.includes("temporarily") ||
    raw.includes("econnreset") ||
    raw.includes("etimedout")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithModelFallback<T>(
  models: string[],
  fn: (model: string) => Promise<T>
): Promise<{ result: T; modelUsed: string }> {
  let lastError: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await fn(model);
        return { result, modelUsed: model };
      } catch (err) {
        lastError = err;
        if (!isTransientOverloadError(err)) {
          throw err;
        }
        // Exponential backoff before retry or switching to fallback model
        await sleep(700 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

function buildAcousticFallbackProfile(clientMetrics?: {
  avgPitchHz?: number;
  pitchMinHz?: number;
  pitchMaxHz?: number;
  spectralCentroidHz?: number;
  durationSec?: number;
}) {
  const f0 = clientMetrics?.avgPitchHz ?? 160;
  const centroid = clientMetrics?.spectralCentroidHz ?? 1400;

  let baseVoice: "Charon" | "Fenrir" | "Puck" | "Kore" | "Zephyr" = "Kore";
  let baseF0 = 204;
  let gender = "female";
  let toneSummaryBn = "সাবলীল ও স্পষ্ট কণ্ঠস্বর, স্বাভাবিক ছন্দে কথা বলার ভঙ্গি।";
  let traits = ["স্বাভাবিক পিচ", "স্পষ্ট উচ্চারণ", "স্থির গতি"];

  if (f0 < 128) {
    baseVoice = "Charon";
    baseF0 = 116;
    gender = "male";
    toneSummaryBn = "গভীর ও ভরাট ব্যারিটোন কণ্ঠ, ধীর ও দৃঢ় উচ্চারণভঙ্গি।";
    traits = ["গভীর পিচ", "ভরাট স্বর", "ধীর ও দৃঢ়"];
  } else if (f0 < 155) {
    baseVoice = "Fenrir";
    baseF0 = 138;
    gender = "male";
    toneSummaryBn = "দৃঢ় ও উষ্ণ পুরুষ কণ্ঠ, সাবলীল এবং অভিব্যক্তিপূর্ণ উচ্চারণ।";
    traits = ["মধ্যম ব্যারিটোন", "উষ্ণ অনুরণন", "স্পষ্ট উচ্চারণ"];
  } else if (f0 < 186) {
    baseVoice = "Puck";
    baseF0 = 168;
    gender = "neutral";
    toneSummaryBn = "প্রাণবন্ত ও উজ্জ্বল কণ্ঠস্বর, সাবলীল ও স্বাভাবিক গতি।";
    traits = ["উজ্জ্বল পিচ", "প্রাণবন্ত গতি", "সাবলীল স্বর"];
  } else if (f0 < 220) {
    baseVoice = "Kore";
    baseF0 = 204;
    gender = "female";
    toneSummaryBn = "উষ্ণ ও স্পষ্ট মধ্যম-উচ্চ কণ্ঠ, প্রাকৃতিক ও ভারসাম্যপূর্ণ ছন্দ।";
    traits = ["উষ্ণ ও স্পষ্ট", "ভারসাম্যপূর্ণ ছন্দ", "স্বাভাবিক গতি"];
  } else {
    baseVoice = "Zephyr";
    baseF0 = 232;
    gender = "female";
    toneSummaryBn = "কোমল ও মধুর কণ্ঠস্বর, শান্ত ও পরিচ্ছন্ন উচ্চারণভঙ্গি।";
    traits = ["কোমল ও উচ্চ পিচ", "শান্ত স্বর", "মধুর উচ্চারণ"];
  }

  const semitones = Math.max(
    -4.5,
    Math.min(4.5, Number((12 * Math.log2(f0 / baseF0)).toFixed(1)))
  );
  const warmthDb = centroid < 1300 ? 2.0 : 1.0;
  const clarityDb = centroid > 1600 ? 1.5 : 1.0;

  return {
    voiceGender: gender,
    recommendedBaseVoice: baseVoice,
    recommendedPitchShiftSemitones: semitones,
    warmthDb,
    clarityDb,
    toneSummaryBn,
    vocalTraitsBn: traits,
    ttsStylePrompt: `Natural conversational ${gender} voice around ${Math.round(f0)} Hz with balanced pacing, warm chest resonance, and clear articulation.`,
    transcriptSample: "",
  };
}

function formatApiError(err: unknown): { status: number; message: string; detail?: string } {
  console.error("[KonthoStudio API Error]", err);
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("high demand") ||
    lower.includes("overloaded")
  ) {
    return {
      status: 503,
      message:
        "AI ভয়েস সার্ভারে এই মুহূর্তে অতিরিক্ত চাপ রয়েছে (503)। সিস্টেম স্বয়ংক্রিয়ভাবে বিকল্প মডেল চেষ্টা করেছে—অনুগ্রহ করে ৫–১০ সেকেন্ড পর আবার ক্লিক করুন।",
      detail: raw,
    };
  }
  if (raw.includes("API_KEY_INVALID") || raw.includes("PERMISSION_DENIED") || raw.includes("403")) {
    return {
      status: 403,
      message: "API কী সঠিক নয় বা অনুমতি নেই। Settings > Secrets থেকে GEMINI_API_KEY যাচাই করুন।",
      detail: raw,
    };
  }
  if (raw.includes("RESOURCE_EXHAUSTED") || raw.includes("429")) {
    return {
      status: 429,
      message: "এই মুহূর্তে অনুরোধের সীমা অতিক্রম করেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
      detail: raw,
    };
  }
  if (raw.includes("GEMINI_API_KEY is not configured")) {
    return {
      status: 500,
      message: "সার্ভারে GEMINI_API_KEY সেট করা নেই। অনুগ্রহ করে Secrets প্যানেলে কী যুক্ত করুন।",
      detail: raw,
    };
  }
  if (lower.includes("400") || lower.includes("invalid_argument")) {
    return {
      status: 400,
      message: "অডিও অনুরোধের ফরম্যাট বা প্যারামিটার গ্রহণযোগ্য হয়নি। লেখাটি পরিবর্তন করে আবার চেষ্টা করুন।",
      detail: raw,
    };
  }
  return {
    status: 500,
    message: "সার্ভারে সাময়িক ত্রুটি ঘটেছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।",
    detail: raw,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  // Analyze user's recorded or uploaded voice sample
  app.post("/api/voice/analyze", async (req, res) => {
    try {
      const { audioBase64, mimeType, clientMetrics } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        clientMetrics?: {
          avgPitchHz?: number;
          pitchMinHz?: number;
          pitchMaxHz?: number;
          spectralCentroidHz?: number;
          durationSec?: number;
        };
      };

      if (!audioBase64 || !mimeType) {
        return res.status(400).json({ error: "অডিও ডেটা পাওয়া যায়নি।" });
      }

      const ai = getGenAIClient();

      const metricsHint = clientMetrics?.avgPitchHz
        ? `Measured acoustic metrics from DSP: Fundamental pitch F0 = ${Math.round(clientMetrics.avgPitchHz)} Hz (range ${Math.round(clientMetrics.pitchMinHz ?? clientMetrics.avgPitchHz)}-${Math.round(clientMetrics.pitchMaxHz ?? clientMetrics.avgPitchHz)} Hz), Spectral Centroid = ${Math.round(clientMetrics.spectralCentroidHz ?? 1400)} Hz, Duration = ${(clientMetrics.durationSec ?? 0).toFixed(1)}s.`
        : "";

      const analysisPrompt = `You are a master vocal acoustics engineer and voice casting director.
Listen carefully to the user's voice recording and analyze every acoustic and stylistic nuance:
- Vocal register & gender presentation (male/female/neutral)
- Fundamental pitch warmth, chest vs head resonance, breathiness, nasal/open timbre
- Speaking cadence, syllable rhythm, pause habits, articulation clarity, and emotional warmth
- Language/accent flavor (e.g., standard Bengali, Dhaka/Kolkata cadence, conversational English)

${metricsHint}

Based on your listening, choose the SINGLE closest base voice from these 5 Gemini TTS voices:
- "Charon": Deep, warm, authoritative, resonant male baritone (~105-125 Hz)
- "Fenrir": Grounded, expressive, textured, firm male tenor/baritone (~125-150 Hz)
- "Puck": Bright, lively, youthful, agile voice (~150-185 Hz)
- "Kore": Clear, warm, balanced, articulate female alto/mezzo (~185-225 Hz)
- "Zephyr": Soft, airy, gentle, soothing female soprano/mezzo (~210-255 Hz)

Also determine the exact pitch shift in semitones (-5.0 to +5.0) needed to shift that base voice's natural F0 toward the speaker's measured F0, plus subtle warmth (low-shelf dB, -3 to +4) and clarity (presence dB, -3 to +4) EQ adjustments.

Write:
1. "toneSummaryBn": A natural, accurate 1-sentence Bengali description of the speaker's voice quality (e.g. "গভীর ও উষ্ণ ব্যারিটোন কণ্ঠ, ধীর ও স্পষ্ট উচ্চারণভঙ্গি।").
2. "vocalTraitsBn": 3 short Bengali descriptors (2-4 words each, no emojis) describing pitch, pace, and tone.
3. "ttsStylePrompt": A rich, concrete English vocal direction string (25-45 words) for Gemini TTS speechMetadata.style so the synthesizer replicates the user's pacing, resonance, warmth, breathiness, and articulation style.
4. "transcriptSample": Brief transcription of what the speaker said in the audio (in the original language).`;

      try {
        const { result: response } = await runWithModelFallback(
          ["gemini-4-hydrogen", "gemini-3.1-flash-lite"],
          (model) =>
            ai.models.generateContent({
              model,
              contents: {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: audioBase64,
                    },
                  },
                  { text: analysisPrompt },
                ],
              },
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    voiceGender: {
                      type: Type.STRING,
                      description: "male, female, or neutral",
                    },
                    recommendedBaseVoice: {
                      type: Type.STRING,
                      description: "Must be exactly one of: Puck, Charon, Kore, Fenrir, Zephyr",
                    },
                    recommendedPitchShiftSemitones: {
                      type: Type.NUMBER,
                      description: "Recommended pitch calibration in semitones between -5.0 and 5.0",
                    },
                    warmthDb: {
                      type: Type.NUMBER,
                      description: "Low-mid warmth EQ gain in dB between -3 and 4",
                    },
                    clarityDb: {
                      type: Type.NUMBER,
                      description: "Vocal presence EQ gain in dB between -3 and 4",
                    },
                    toneSummaryBn: {
                      type: Type.STRING,
                      description: "One sentence Bengali description of the voice",
                    },
                    vocalTraitsBn: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "3 concise Bengali vocal descriptors",
                    },
                    ttsStylePrompt: {
                      type: Type.STRING,
                      description: "Detailed English vocal style directive for Gemini TTS",
                    },
                    transcriptSample: {
                      type: Type.STRING,
                      description: "Transcript of what the user spoke in the sample",
                    },
                  },
                  required: [
                    "voiceGender",
                    "recommendedBaseVoice",
                    "recommendedPitchShiftSemitones",
                    "warmthDb",
                    "clarityDb",
                    "toneSummaryBn",
                    "vocalTraitsBn",
                    "ttsStylePrompt",
                    "transcriptSample",
                  ],
                },
              },
            })
        );

        const parsed = JSON.parse((response.text ?? "{}").trim());
        const validVoices = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];
        if (!validVoices.includes(parsed.recommendedBaseVoice)) {
          parsed.recommendedBaseVoice = "Kore";
        }

        return res.json(parsed);
      } catch (aiErr) {
        if (isTransientOverloadError(aiErr)) {
          // Graceful acoustic-metrics fallback when Gemini models are temporarily overloaded (503)
          return res.json(buildAcousticFallbackProfile(clientMetrics));
        }
        throw aiErr;
      }
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Generate TTS Audio using Gemini 3.8 TTS
  app.post("/api/tts/generate", async (req, res) => {
    try {
      const {
        text,
        voiceName = "Kore",
        stylePrompt = "",
        emotion = "natural",
        pace = "normal",
        engine = "flash",
      } = req.body as {
        text?: string;
        voiceName?: string;
        stylePrompt?: string;
        emotion?: string;
        pace?: string;
        engine?: "flash" | "lite";
      };

      if (!text || !text.trim()) {
        return res.status(400).json({ error: "অডিও তৈরির জন্য অনুগ্রহ করে কিছু লেখা লিখুন।" });
      }

      const validVoices = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];
      const safeVoice = validVoices.includes(voiceName) ? voiceName : "Kore";

      const emotionMap: Record<string, string> = {
        natural: "natural conversational warmth and authentic phrasing",
        storytelling: "expressive storytelling narration with engaging cadence and gentle pauses",
        news: "crisp, authoritative, clear broadcast anchor articulation",
        enthusiastic: "bright, energetic, uplifting delivery",
        calm: "calm, soothing, unhurried, reassuring tone",
      };

      const paceMap: Record<string, string> = {
        slow: "measured, unhurried speaking pace",
        normal: "natural steady speaking rhythm",
        fast: "brisk, crisp, dynamic speaking pace",
      };

      const combinedStyle = [
        stylePrompt?.trim(),
        emotionMap[emotion] ?? emotionMap.natural,
        paceMap[pace] ?? paceMap.normal,
        "Pronounce Bengali and English words clearly and naturally without robotic cadence.",
      ]
        .filter(Boolean)
        .join(". ");

      const modelOrder =
        engine === "lite"
          ? ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"]
          : ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"];

      const ai = getGenAIClient();

      const { result: response, modelUsed } = await runWithModelFallback(
        modelOrder,
        (model) =>
          ai.models.generateContent({
            model,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: text.trim(),
                    speechMetadata: {
                      style: combinedStyle,
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: safeVoice,
                  },
                },
              },
            },
          })
      );

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const audioBase64 = part?.inlineData?.data;

      if (!audioBase64) {
        return res.status(502).json({
          error: "অডিও তৈরি করা যায়নি। লেখাটি সংক্ষিপ্ত করে আবার চেষ্টা করুন।",
        });
      }

      return res.json({
        audioBase64,
        mimeType: part?.inlineData?.mimeType || "audio/wav",
        modelUsed,
        voiceUsed: safeVoice,
      });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Enhance Bengali/English script for natural TTS delivery
  app.post("/api/script/enhance", async (req, res) => {
    try {
      const { text, style = "natural" } = req.body as {
        text?: string;
        style?: string;
      };

      if (!text || !text.trim()) {
        return res.status(400).json({ error: "পরিমার্জনের জন্য লেখা লিখুন।" });
      }

      const ai = getGenAIClient();
      const { result: response } = await runWithModelFallback(
        ["gemini-4-hydrogen", "gemini-3.1-flash-lite"],
        (model) =>
          ai.models.generateContent({
            model,
            contents: `Refine the following Bengali or English text solely for natural Text-to-Speech narration (${style} style).
Rules:
- Keep the exact original meaning, facts, and language (do NOT translate).
- Improve punctuation (দাঁড়ি, কমা, প্রশ্নবোধক, ড্যাশ) so the voice pauses naturally at breath boundaries.
- Optionally add at most 1 or 2 subtle "<breath>" tags at major paragraph or thought transitions if it makes storytelling feel natural.
- Return ONLY the refined text, with no commentary or quotes.

Input text:
${text.trim()}`,
          })
      );

      const refined = (response.text ?? text).trim();
      return res.json({ enhancedText: refined });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Transcribe uploaded audio file so it can be recreated in the user's own voice
  app.post("/api/audio/transcribe", async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };

      if (!audioBase64 || !mimeType) {
        return res.status(400).json({ error: "অনুগ্রহ করে একটি বৈধ অডিও ফাইল দিন।" });
      }

      const ai = getGenAIClient();
      const { result: response, modelUsed } = await runWithModelFallback(
        ["gemini-3.5-transcribe", "gemini-4-hydrogen", "gemini-3.1-flash-lite"],
        (model) =>
          ai.models.generateContent({
            model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: audioBase64,
                  },
                },
                {
                  text: "Transcribe the spoken words in this audio accurately in the original language (such as Bengali or English) with natural punctuation (দাঁড়ি, কমা, প্রশ্নবোধক). Return ONLY the transcribed text without extra commentary or timestamps.",
                },
              ],
            },
          })
      );

      const transcript = (response.text ?? "").trim();
      if (!transcript) {
        return res.status(422).json({
          error: "অডিও ফাইল থেকে স্পষ্ট কোনো কথা শনাক্ত করা যায়নি। পরিষ্কার ভয়েস ফাইল দিয়ে চেষ্টা করুন।",
        });
      }

      return res.json({ transcript, modelUsed });
    } catch (err) {
      const formatted = formatApiError(err);
      return res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Color-correct, sharpen/clear, and export uploaded video as genuine MP4 (H.264 + AAC)
  app.post(
    "/api/video/export-mp4",
    express.raw({ type: "application/octet-stream", limit: "300mb" }),
    async (req, res) => {
      const id = crypto.randomUUID();
      const tmpDir = os.tmpdir();
      const rawName = String(req.query.filename || "video.mp4");
      const extMatch = path.extname(rawName).toLowerCase();
      const safeExt = /^[.][a-z0-9]{2,5}$/.test(extMatch) ? extMatch : ".mp4";
      const inputPath = path.join(tmpDir, `vs-in-${id}${safeExt}`);
      const outputPath = path.join(tmpDir, `vs-out-${id}.mp4`);

      try {
        const buffer = req.body as Buffer;
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
          return res.status(400).json({ error: "ভিডিও ফাইল পাওয়া যায়নি।" });
        }

        await fs.writeFile(inputPath, buffer);

        const clampNum = (val: unknown, min: number, max: number, fallback: number) => {
          const n = Number(val);
          return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
        };

        const brightnessPct = clampNum(req.query.brightness, 50, 160, 100);
        const contrastPct = clampNum(req.query.contrast, 50, 180, 100);
        const saturatePct = clampNum(req.query.saturate, 0, 200, 100);
        const hueDeg = clampNum(req.query.hueRotate, -90, 90, 0);
        const warmthPct = clampNum(req.query.sepia, 0, 100, 0);
        const sharpnessPct = clampNum(req.query.sharpness, 0, 100, 45);
        const denoisePct = clampNum(req.query.denoise, 0, 100, 20);
        const speed = clampNum(req.query.speed, 0.5, 2.0, 1.0);

        const ffBrightness = ((brightnessPct - 100) / 200).toFixed(3);
        const ffContrast = (contrastPct / 100).toFixed(3);
        const ffSaturation = (saturatePct / 100).toFixed(3);

        const vfFilters: string[] = [
          "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        ];

        if (denoisePct > 0) {
          const d = (denoisePct / 100) * 3.5;
          vfFilters.push(
            `hqdn3d=${d.toFixed(2)}:${(d * 0.75).toFixed(2)}:${(d * 1.4).toFixed(2)}:${(d * 1.1).toFixed(2)}`
          );
        }

        vfFilters.push(
          `eq=brightness=${ffBrightness}:contrast=${ffContrast}:saturation=${ffSaturation}`
        );

        if (Math.abs(hueDeg) > 0.5) {
          vfFilters.push(`hue=h=${hueDeg.toFixed(1)}`);
        }

        if (warmthPct > 0) {
          const w = ((warmthPct / 100) * 0.18).toFixed(3);
          vfFilters.push(`colorbalance=rs=${w}:bs=-${w}`);
        }

        if (sharpnessPct > 0) {
          const amount = ((sharpnessPct / 100) * 1.5).toFixed(2);
          vfFilters.push(`unsharp=5:5:${amount}:5:5:0.0`);
        }

        if (Math.abs(speed - 1.0) > 0.01) {
          vfFilters.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);
        }

        const args = [
          "-y",
          "-i",
          inputPath,
          "-map",
          "0:v:0",
          "-map",
          "0:a?",
          "-vf",
          vfFilters.join(","),
        ];

        if (Math.abs(speed - 1.0) > 0.01) {
          args.push("-af", `atempo=${speed.toFixed(2)}`);
        }

        args.push(
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "19",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-movflags",
          "+faststart",
          outputPath
        );

        await new Promise<void>((resolve, reject) => {
          const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
          let stderr = "";
          proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
            if (stderr.length > 4000) stderr = stderr.slice(-4000);
          });
          proc.on("error", (err) => reject(err));
          proc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
          });
        });

        const baseName = path.basename(rawName, path.extname(rawName)) || "video-studio";
        const downloadName = `${baseName}-clear.mp4`;
        const outBuffer = await fs.readFile(outputPath);

        res.setHeader("Content-Type", "video/mp4");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
        );
        return res.send(outBuffer);
      } catch (err) {
        console.error("[Video Studio Export Error]", err);
        return res.status(500).json({
          error: "MP4 ভিডিও প্রসেস করতে সমস্যা হয়েছে। অনুগ্রহ করে ছোট বা সমর্থিত ভিডিও ফাইল দিয়ে চেষ্টা করুন।",
        });
      } finally {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
      }
    }
  );

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`KonthoStudio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
