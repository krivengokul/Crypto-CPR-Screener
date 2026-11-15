/**
 * nlFilter — natural-language → screener filter spec.
 *
 * The Worker (cloudflare-worker/nl-filter-worker.js) asks Claude for a JSON
 * spec; this module is the trust boundary. Anything the model returns is
 * re-validated here against the closed vocabularies below, so a bad or
 * manipulated response can never set a filter the screener doesn't support.
 *
 * Kept free of "@/" and browser-only imports so it runs under `node --test`.
 */

export const NL_CLASS_FILTERS = ["CRYPTO", "COMMOD", "TRADFI"] as const;
export const NL_PDH_PDL_FILTERS = [
  "above",
  "below",
  "abovepu4",
  "belowpl4",
  "pdhgtu1",
  "pdlltl1",
  "s1r1in",
] as const;
export const NL_STRONG_BAR = ["up", "down"] as const;
export const NL_STATUS = ["active", "ready", "pass", "fail"] as const;

/**
 * Pattern codes the Screener's PatternFilter accepts. Only used when the user
 * types an exact code — the model is never asked to map a description to a code.
 */
export const NL_PATTERN_CODES = [
  "CL1U1", "CL2U1", "CL2U2", "CL3U2", "CL3U3", "CL4U2", "CL4U3", "CL4U4",
  "CU1L1", "CU2BC", "CU2L1", "CU2L2", "CU3L1", "CU3L2", "CU3L3", "CU4L2", "CU4L3", "CU4L4",
  "EL1L2", "EL1U1", "EL1U2", "EL1U3", "EL2L1", "EL2U3", "EL2U4", "EL3U3", "EL3U4", "EL4U4",
  "ELBU2", "ELBU3", "ELPU2", "ELPU3", "ELTU2", "ELTU3",
  "EU1L1", "EU1L2", "EU1L3", "EU1L4", "EU2L2", "EU2L3", "EU2L4", "EU3L3", "EU3L4", "EU4L4",
  "EUBL1", "EUBL2", "EUBL3", "EUPL1", "EUPL2", "EUPL3", "EUTL1", "EUTL2", "EUTL3", "EUTL4",
  "INCPR", "Inside", "OutCPR",
  "L1U4", "L2U3", "L2U4", "L3TC", "L3U2", "L3U3", "L3U4", "L4U2", "L4U3", "L4U4",
  "QU4L4",
  "U1L4", "U2L3", "U2L4", "U3L2", "U3L4", "U4L2", "U4L3", "U4L4",
] as const;

export type NlClassFilter = (typeof NL_CLASS_FILTERS)[number];
export type NlPdhPdlFilter = (typeof NL_PDH_PDL_FILTERS)[number];
export type NlStrongBar = (typeof NL_STRONG_BAR)[number];
export type NlStatus = (typeof NL_STATUS)[number];

/** Validated spec. Every field is optional; absent = leave that filter alone. */
export interface NlFilterSpec {
  search?: string;
  classFilter?: NlClassFilter;
  pdhPdlFilter?: NlPdhPdlFilter;
  strongBar?: NlStrongBar;
  status?: NlStatus;
  breakout?: "brk";
  reclaimS?: boolean;
  reclaimR?: boolean;
  patternCode?: string;
  /** Clear all the filters above before applying the rest. */
  reset?: boolean;
  /** Model's explanation when the request can't be expressed with these fields. */
  unsupported?: string;
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** Validate untrusted model output into an NlFilterSpec. Never throws. */
export function sanitizeNlFilterSpec(raw: unknown): NlFilterSpec {
  const out: NlFilterSpec = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;

  if (typeof r.search === "string") {
    // Symbols only: letters, digits and a few separators. Drops anything else.
    const s = r.search.replace(/[^A-Za-z0-9._\-/]/g, "").slice(0, 20);
    if (s) out.search = s;
  }
  const cls = pick(r.classFilter, NL_CLASS_FILTERS);
  if (cls) out.classFilter = cls;
  const pdh = pick(r.pdhPdlFilter, NL_PDH_PDL_FILTERS);
  if (pdh) out.pdhPdlFilter = pdh;
  const bar = pick(r.strongBar, NL_STRONG_BAR);
  if (bar) out.strongBar = bar;
  const status = pick(r.status, NL_STATUS);
  if (status) out.status = status;
  if (r.breakout === "brk") out.breakout = "brk";

  // S and R reclaim exclude each other in the UI; mirror that here.
  if (r.reclaimS === true && r.reclaimR !== true) out.reclaimS = true;
  else if (r.reclaimR === true && r.reclaimS !== true) out.reclaimR = true;

  if (typeof r.patternCode === "string") {
    const code = r.patternCode.trim().toLowerCase();
    const match = NL_PATTERN_CODES.find((c) => c.toLowerCase() === code);
    if (match) out.patternCode = match;
  }
  if (r.reset === true) out.reset = true;
  if (typeof r.unsupported === "string" && r.unsupported.trim()) {
    out.unsupported = r.unsupported.trim().slice(0, 200);
  }
  return out;
}

/** True when the spec would change at least one filter. */
export function hasNlFilterEffect(spec: NlFilterSpec): boolean {
  return !!(
    spec.reset ||
    spec.search ||
    spec.classFilter ||
    spec.pdhPdlFilter ||
    spec.strongBar ||
    spec.status ||
    spec.breakout ||
    spec.reclaimS ||
    spec.reclaimR ||
    spec.patternCode
  );
}

const PDH_PDL_LABEL: Record<NlPdhPdlFilter, string> = {
  above: "price above PDH",
  below: "price below PDL",
  abovepu4: "price above prev R4",
  belowpl4: "price below prev S4",
  pdhgtu1: "PDH above R1",
  pdlltl1: "PDL below S1",
  s1r1in: "S1/R1 inside prev range",
};

/** Short human-readable summary of what a spec applies, for the UI. */
export function describeNlFilterSpec(spec: NlFilterSpec): string {
  const parts: string[] = [];
  if (spec.search) parts.push(`symbol "${spec.search}"`);
  if (spec.classFilter) parts.push(spec.classFilter);
  if (spec.pdhPdlFilter) parts.push(PDH_PDL_LABEL[spec.pdhPdlFilter]);
  if (spec.strongBar) parts.push(`strong ${spec.strongBar} bar`);
  if (spec.status) parts.push(`status ${spec.status}`);
  if (spec.breakout) parts.push("breakout");
  if (spec.reclaimS) parts.push("RECLAIM-S");
  if (spec.reclaimR) parts.push("RECLAIM-R");
  if (spec.patternCode) parts.push(`pattern ${spec.patternCode}`);
  const text = parts.join(" · ");
  return spec.reset ? (text ? `Reset, then ${text}` : "Reset filters") : text;
}

export class NlFilterError extends Error {}

/** Call the Worker and return a validated spec. */
export async function requestNlFilter(
  query: string,
  endpoint: string,
  signal?: AbortSignal,
): Promise<NlFilterSpec> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new NlFilterError("Could not reach the AI filter service.");
  }
  if (!res.ok) {
    throw new NlFilterError(
      res.status === 400 ? "That request was too long or empty." : "The AI filter service returned an error.",
    );
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new NlFilterError("The AI filter service returned an unreadable response.");
  }
  return sanitizeNlFilterSpec((data as { spec?: unknown } | null)?.spec);
}
