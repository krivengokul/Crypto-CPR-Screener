import type { CPRResult } from "../cpr.ts";

export const ALL_CPR_SIZE_KEYS = [
  "micro",
  "tiny",
  "mini",
  "small",
  "medium",
  "large",
  "mega",
  "giant",
] as const;

export type CPRSizeKey = (typeof ALL_CPR_SIZE_KEYS)[number];

/** Canonicalize stored legacy `ultra` CPR size values to the `giant` key. */
export function normalizeCPRSizeKey(value: string | null | undefined): CPRSizeKey | undefined {
  const raw = value?.trim().toLowerCase();
  if (!raw) return undefined;
  const canonical = raw === "ultra" ? "giant" : raw;
  return ALL_CPR_SIZE_KEYS.includes(canonical as CPRSizeKey)
    ? canonical as CPRSizeKey
    : undefined;
}

function stripCPRSizePrefix(value: string): string {
  if (/^[pt]/i.test(value)) {
    const candidate = value.slice(1);
    if (normalizeCPRSizeKey(candidate)) return candidate;
  }
  return value;
}

/** Normalize user/stored filter values, including p/t prefixes and legacy Ultra. */
export function normalizeCPRSizeFilter(value: string | null | undefined): CPRSizeKey | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  return normalizeCPRSizeKey(stripCPRSizePrefix(raw));
}

export const PREV_CPR_SIZE_OPTIONS: Array<{ value: CPRSizeKey | ""; label: string }> = [
  { value: "", label: "Any Prev Size" },
  { value: "micro", label: "pMicro (≤0.10%)" },
  { value: "tiny", label: "pTiny (0.10%-0.22%)" },
  { value: "mini", label: "pMini (0.22%-0.60%)" },
  { value: "small", label: "pSmall (0.60%-1.10%)" },
  { value: "medium", label: "pMedium (1.10%-2.00%)" },
  { value: "large", label: "pLarge (2.00%-5.00%)" },
  { value: "mega", label: "pMega (5.00%-10.00%)" },
  { value: "giant", label: "pGiant (>10.00%)" },
];

export const TODAY_CPR_SIZE_OPTIONS: Array<{ value: CPRSizeKey | ""; label: string }> = [
  { value: "", label: "Any Today Size" },
  { value: "micro", label: "Micro (≤0.10%)" },
  { value: "tiny", label: "Tiny (0.10%-0.22%)" },
  { value: "mini", label: "Mini (0.22%-0.60%)" },
  { value: "small", label: "Small (0.60%-1.10%)" },
  { value: "medium", label: "Medium (1.10%-2.00%)" },
  { value: "large", label: "Large (2.00%-5.00%)" },
  { value: "mega", label: "Mega (5.00%-10.00%)" },
  { value: "giant", label: "Giant (>10.00%)" },
];

export function capitalizeSize(key: string): string {
  if (!key) return "";
  const canonical = normalizeCPRSizeKey(key) ?? key.toLowerCase();
  return canonical.charAt(0).toUpperCase() + canonical.slice(1);
}

/** Formats a previous-day CPR size code (e.g. "mini" -> "pMini"). */
export function formatPrevCPRSizeCode(key: string | undefined | null): string {
  if (!key) return "";
  const cleaned = stripCPRSizePrefix(key.trim());
  return `p${capitalizeSize(cleaned)}`;
}

/** Formats a today's CPR size code (e.g. "mini" -> "Mini"). */
export function formatTodayCPRSizeCode(key: string | undefined | null): string {
  if (!key) return "";
  const cleaned = stripCPRSizePrefix(key.trim());
  return capitalizeSize(cleaned);
}

/** Joins prev and today CPR size keys into a key segment string (e.g. "pMini+Mega", "pMini", "Mega"). */
export function joinCPRSize(prev?: string | null, today?: string | null): string {
  const p = prev ? formatPrevCPRSizeCode(prev) : "";
  const t = today ? formatTodayCPRSizeCode(today) : "";
  return [p, t].filter(Boolean).join("+");
}

/** Splits a joined CPR size code (e.g. "pMini+Mega" or single "pMini" / "Mega") into prev and today keys. */
export function splitCPRSize(code?: string | null): {
  prev?: CPRSizeKey;
  today?: CPRSizeKey;
} {
  const raw = (code ?? "").trim();
  if (!raw) return {};

  const parts = raw.split("+").map((s) => s.trim()).filter(Boolean);
  let prev: CPRSizeKey | undefined;
  let today: CPRSizeKey | undefined;

  for (const part of parts) {
    const isP = part.startsWith("p") || part.startsWith("P");
    const name = normalizeCPRSizeFilter(part);
    if (name) {
      if (isP) {
        prev = name;
      } else {
        today = name;
      }
    }
  }

  return { prev, today };
}

/** Classifies a CPR width% into its tier. */
export function getCPRSizeKey(widthPct: number): CPRSizeKey {
  if (!Number.isFinite(widthPct) || widthPct <= 0.10) return "micro";
  if (widthPct <= 0.22) return "tiny";
  if (widthPct <= 0.60) return "mini";
  if (widthPct <= 1.10) return "small";
  if (widthPct <= 2.00) return "medium";
  if (widthPct <= 5.00) return "large";
  if (widthPct <= 10.00) return "mega";
  return "giant";
}

/** Micro and Tiny CPR widths qualify as compact for VOL-C badges. */
export function isMicroOrTinyCPRSize(
  widthPct: number | undefined | null,
): boolean {
  if (typeof widthPct !== "number" || !Number.isFinite(widthPct)) return false;
  const size = getCPRSizeKey(widthPct);
  return size === "micro" || size === "tiny";
}

/** Matches a CPRResult against optional prev and today CPR size filters. */
export function matchesCPRSize(
  r: CPRResult,
  prevSize?: string | null,
  todaySize?: string | null
): boolean {
  if (prevSize && prevSize.trim() !== "") {
    const normPrev = normalizeCPRSizeFilter(prevSize);
    if (!normPrev) return false;
    if (getCPRSizeKey(r.prevCPR?.widthPct ?? 0) !== normPrev) return false;
  }
  if (todaySize && todaySize.trim() !== "") {
    const normToday = normalizeCPRSizeFilter(todaySize);
    if (!normToday) return false;
    if (getCPRSizeKey(r.todayCPR?.widthPct ?? 0) !== normToday) return false;
  }
  return true;
}
