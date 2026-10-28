/**
 * Pure View-key resolver shared by createviewpatch.mjs and
 * EditCopyViewpatch.mjs.
 *
 * This MUST stay behaviorally identical to resolveCreateViewKey /
 * areLevelCheckDefsEqual in
 * artifacts/cpr-screener/src/lib/views/createViewKey.ts — the app resolves a
 * key in memory and the workflow resolves it again when it writes the source
 * file, and the two must land on the same key. paperTrading.test.ts has a
 * parity test that runs both over the same scenarios.
 *
 * No dependencies on purpose (no ts-morph) so it can be unit-tested directly.
 */

/** "-13" / "-ANY" / "-LC<n>" disambiguation suffixes, stripped repeatedly. */
export function stripDisambiguationSuffixes(key) {
  let prev = (key || "").trim();
  while (true) {
    const next = prev.replace(/-(?:13|ANY|LC\d+)$/, "");
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

/** Order-independent structural equality of Level Check condition lists. */
export function areLevelCheckDefsEqual(a, b) {
  const listA = a ?? [];
  const listB = b ?? [];
  if (listA.length === 0 && listB.length === 0) return true;
  if (listA.length !== listB.length) return false;
  const sig = (c) => {
    const b0 = String(c.bandKeys?.[0] ?? "");
    const b1 = String(c.bandKeys?.[1] ?? "");
    return `${c.key}:${c.subject}:${[b0, b1].sort().join("-")}`;
  };
  const setA = listA.map(sig).sort();
  const setB = listB.map(sig).sort();
  return setA.every((s, i) => s === setB[i]);
}

/**
 * @param {string} baseKey  Key the user/app asked for.
 * @param {object} opts
 * @param {boolean} [opts.requireFullMatch]  13/13 MATCH of the View being saved.
 * @param {Array}   [opts.levelCheckDefs]    Level Check conditions of the View being saved.
 * @param {string}  [opts.ignoreKey]         Existing key to leave out (Edit: the View being rewritten).
 * @param {Array<{key:string, requireFullMatch?:boolean, levelCheckDefs?:Array}>} opts.views
 *        Every existing View. Callers that can't filter by key (e.g. the
 *        script, which excludes the source object itself) may pre-filter
 *        instead of passing ignoreKey.
 * @returns {{key: string, conflict: boolean}}  On conflict, `key` is the
 *          existing View that is an exact duplicate.
 */
export function resolveViewKey(baseKey, { requireFullMatch, levelCheckDefs, ignoreKey, views }) {
  const raw = (baseKey || "").trim();
  if (!raw) return { key: raw, conflict: true };
  const base = stripDisambiguationSuffixes(raw);
  if (!base) return { key: raw, conflict: true };
  const fm = requireFullMatch === true;

  const findOther = (k) => views.find((v) => v.key === k && (!ignoreKey || v.key !== ignoreKey));

  // Whole structural family: base, base-13, base-ANY, base-LC2, base-13-LC2, ...
  const familyViews = views.filter((v) => {
    if (ignoreKey && v.key === ignoreKey) return false;
    return stripDisambiguationSuffixes(v.key) === base;
  });

  const exactDuplicate = familyViews.find(
    (v) => (v.requireFullMatch === true) === fm && areLevelCheckDefsEqual(v.levelCheckDefs, levelCheckDefs),
  );
  if (exactDuplicate) return { key: exactDuplicate.key, conflict: true };

  const existingBase = findOther(base);
  let preferred;
  if (existingBase && (existingBase.requireFullMatch === true) !== fm) {
    preferred = fm ? `${base}-13` : `${base}-ANY`;
  } else {
    preferred = base;
  }

  if (!findOther(preferred)) return { key: preferred, conflict: false };

  let index = 2;
  while (true) {
    const candidate = `${preferred}-LC${index}`;
    if (!findOther(candidate)) return { key: candidate, conflict: false };
    index++;
  }
}
