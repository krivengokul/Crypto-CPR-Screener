import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Project, SyntaxKind } from "ts-morph";

function escapeForDoubleQuotedString(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Property names in these files are written both ways —
 * `copyViews: [...]` and `"levelsabove": [...]` — and ts-morph's
 * getProperty(name) matches the raw name text (quotes included), so a
 * plain getProperty("levelsabove") misses the quoted form and we end up
 * adding a SECOND "levelsabove" key. Compare on the unquoted name.
 */
function getObjectProperty(obj, name) {
  return obj.getProperties().find((prop) => {
    if (!prop.isKind(SyntaxKind.PropertyAssignment)) return false;
    return prop.getName().replace(/^["']|["']$/g, "") === name;
  });
}

function getStringPropertyValue(obj, name) {
  const prop = getObjectProperty(obj, name);
  if (!prop) return undefined;
  const initializer = prop.getInitializer();
  if (!initializer || !initializer.isKind(SyntaxKind.StringLiteral)) return undefined;
  return initializer.getLiteralText();
}

/**
 * Every id in ViewsSidebar.tsx's `pivotcategories` array — i.e. the
 * left-nav sections that actually render. A Views[...] bucket keyed on
 * anything else is dead weight (nothing displays it), so the nav step
 * checks against this before inserting.
 */
function getScreenerNavCategoryIds(sourceText) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("ViewsSidebar.tsx", sourceText);

  const decl = sourceFile.getVariableDeclaration("pivotcategories");
  if (!decl) return [];
  const arr = decl.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  if (!arr) return [];

  return arr
    .getElements()
    .filter((el) => el.isKind(SyntaxKind.ObjectLiteralExpression))
    .map((el) => getStringPropertyValue(el, "id"))
    .filter(Boolean);
}

/**
 * Pushes {id: newKey, label: newLabel} into ViewsSidebar.tsx's
 * Views[categoryKey] array (creating it if it doesn't exist yet).
 */
function addToScreenerNav(sourceText, categoryKey, newKey, newLabel) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("ViewsSidebar.tsx", sourceText);

  const viewsDecl = sourceFile.getVariableDeclarationOrThrow("Views");
  const viewsObj = viewsDecl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  const categoryProp = getObjectProperty(viewsObj, categoryKey);
  let arr;
  if (categoryProp) {
    const initializer = categoryProp.getInitializer();
    if (!initializer || !initializer.isKind(SyntaxKind.ArrayLiteralExpression)) {
      throw new Error(`Views["${categoryKey}"] isn't an array literal — can't insert into it.`);
    }
    arr = initializer;
  } else {
    const added = viewsObj.addPropertyAssignment({ name: `"${categoryKey}"`, initializer: "[]" });
    arr = added.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  }

  const alreadyExists = arr
    .getElements()
    .some((el) => el.isKind(SyntaxKind.ObjectLiteralExpression) && getStringPropertyValue(el, "id") === newKey);
  if (alreadyExists) {
    return sourceFile.getFullText();
  }

  arr.addElement(
    `{ id: "${escapeForDoubleQuotedString(newKey)}", label: "${escapeForDoubleQuotedString(newLabel)}" }`
  );

  return sourceFile.getFullText();
}

/**
 * The 97 compound Patterns ("B-B-BB-BB", "A-A-AA-OA", "E-E-OA-OB", ...)
 * are built at runtime by COMPOUND_COMBOS.map(makeCompoundView) — they
 * have NO object literal in views.ts, so the AST walk below can't find
 * them and used to give up (returning null → everything fell into
 * COPY_VIEWS / the "CREATED VIEWS" nav bucket). makeCompoundView reads
 * the parent off SSRR_INFO keyed on the first letter, so mirror that
 * here.
 */
const SSRR_LETTER_TO_CATEGORY = {
  A: "levelsabove",
  B: "levelsbelow",
  C: "compressed",
  E: "expanded",
};
const COMPOUND_KEY_RE = /^([ABCE])-[ABCE]-[A-Za-z]+-[A-Za-z]+$/;

/**
 * Walks the parentKey chain in views.ts to find the root category key.
 */
function resolveTopLevelCategoryKey(viewsSourceText, attachKey) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("views.ts", viewsSourceText);

  const allViewObjs = sourceFile
    .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
    .filter((obj) => getStringPropertyValue(obj, "key") !== undefined);

  const objMap = new Map();
  for (const obj of allViewObjs) {
    const k = getStringPropertyValue(obj, "key");
    if (k) objMap.set(k, obj);
  }

  let currKey = attachKey;
  const visited = new Set();
  while (currKey && !visited.has(currKey)) {
    visited.add(currKey);

    const obj = objMap.get(currKey);
    if (obj) {
      const kind = getStringPropertyValue(obj, "kind");
      if (kind === "category") return currKey;
      currKey = getStringPropertyValue(obj, "parentKey");
      continue;
    }

    // Not a literal — the generated compound Patterns land here.
    const compound = COMPOUND_KEY_RE.exec(currKey);
    if (compound) return SSRR_LETTER_TO_CATEGORY[compound[1]] ?? null;

    break;
  }

  return null;
}

/**
 * Mirrors views.ts's buildGapBadgeLabel/ALL_GAP_BADGES exactly (same 5
 * source dimensions, same label shape) so this script can validate a
 * GAP_BADGE input without executing TypeScript. Keep in sync with
 * views.ts if that logic ever changes.
 */
function buildGapBadgeLabel(letter1, letter2, letter3, letter4, gapWinsPrev, gapWinsToday) {
  const part3 = gapWinsPrev ? `Gap${letter3}` : letter3;
  const part4 = gapWinsToday ? `${letter4}Gap` : letter4;
  return `${letter1}${letter2}-${part3}${part4}`;
}

const ALL_GAP_BADGES = (() => {
  const letter1s = ["R", "S", "Q"];
  const letter2s = ["H", "L", "Q"];
  const abqs = ["A", "B", "Q"];
  const winners = ["prev", "today", "none"];
  const seen = new Set();
  const out = [];
  for (const letter1 of letter1s) {
    for (const letter2 of letter2s) {
      for (const letter3 of abqs) {
        for (const letter4 of abqs) {
          for (const winner of winners) {
            const gapWinsPrev = letter3 !== "Q" && winner === "prev";
            const gapWinsToday = letter4 !== "Q" && winner === "today";
            const label = buildGapBadgeLabel(letter1, letter2, letter3, letter4, gapWinsPrev, gapWinsToday);
            if (!seen.has(label)) {
              seen.add(label);
              out.push(label);
            }
          }
        }
      }
    }
  }
  return out.sort();
})();

const BULLISH_TARGETS = {
  R1: { label: "U1 (today's R1)", key: "r1" },
  R2: { label: "U2 (today's R2)", key: "r2" },
  R3: { label: "U3 (today's R3)", key: "r3" },
  R4: { label: "U4 (today's R4)", key: "r4" },
};
const BEARISH_TARGETS = {
  S1: { label: "L1 (today's S1)", key: "s1" },
  S2: { label: "L2 (today's S2)", key: "s2" },
  S3: { label: "L3 (today's S3)", key: "s3" },
  S4: { label: "L4 (today's S4)", key: "s4" },
};

const CATEGORY_ARRAY_MAP = {
  levelsabove: "LEVELSABOVE_VIEWS",
  levelsbelow: "LEVELSBELOW_VIEWS",
  compressed: "COMPRESSED_VIEWS",
  expanded: "EXPANDED_VIEWS",
  R1AbovePR4: "R1ABOVEPR4_S1BELOWPS4_VIEWS",
  S1BelowPS4: "R1ABOVEPR4_S1BELOWPS4_VIEWS",
  "equal-cpr": "MISC_VIEWS",
  top15gainers: "MISC_VIEWS",
  top15losers: "MISC_VIEWS",
  touch: "MISC_VIEWS",
};

/**
 * The UI's dropdown says Up/Down and ViewDef.direction is typed
 * "Up" | "Down" — but this workflow's input historically spelled the
 * same thing bullish/bearish. Accept either spelling, emit the one
 * views.ts's own type expects.
 */
function normalizeDirection(raw) {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "down" || v === "bearish") return "Down";
  if (v === "up" || v === "bullish") return "Up";
  return null;
}

function applyCreateViewPatch(sourceText, patternKey, newKey, newLabel, direction, target, levelCheckDefs, attachKey, gapBadge) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("views.ts", sourceText);

  const targetDef = direction === "Up" ? BULLISH_TARGETS[target] : BEARISH_TARGETS[target];
  if (!targetDef) {
    throw new Error(`"${target}" isn't a valid target for direction "${direction}".`);
  }

  if (gapBadge && !ALL_GAP_BADGES.includes(gapBadge)) {
    throw new Error(`"${gapBadge}" isn't a known Gap Badge (see views.ts's ALL_GAP_BADGES).`);
  }

  const allViewObjs = sourceFile
    .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
    .filter((obj) => getStringPropertyValue(obj, "key") !== undefined);

  if (allViewObjs.some((el) => getStringPropertyValue(el, "key") === newKey)) {
    throw new Error(`"${newKey}" already exists in views.ts — pick a different key.`);
  }

  const effectiveAttachKey = attachKey && attachKey.trim() !== "" ? attachKey : patternKey;

  const entryText =
    direction === "Up"
      ? `entryLabel: "TC (today's TC)",\n    getEntry: (r) => r.todayCPR.tc,\n    stoplossLabel: "S1 (today's S1)",\n    getStoploss: (r) => r.todayCPR.s1,`
      : `entryLabel: "BC (today's BC)",\n    getEntry: (r) => r.todayCPR.bc,\n    stoplossLabel: "R1 (today's R1)",\n    getStoploss: (r) => r.todayCPR.r1,`;

  // Plain redirect (no Gap Badge picked): grade entirely via
  // conditionKey, same as before. With a Gap Badge picked: grade via an
  // explicit condition ANDing patternKey's own condition (passesView)
  // with this exact composite Gap Badge label (matchesGapBadge) —
  // standalone: true so passesView doesn't ALSO chain parentKey (the
  // attach point, which is display-only and may differ from patternKey).
  // Both matchesGapBadge and passesView are defined in this same
  // views.ts file, so no new import is needed in the generated code.
  const conditionText = gapBadge
    ? `condition: (r) => passesView(r, "${escapeForDoubleQuotedString(patternKey)}") && matchesGapBadge(r, "${escapeForDoubleQuotedString(gapBadge)}"),
    standalone: true,`
    : `conditionKey: "${escapeForDoubleQuotedString(patternKey)}",`;

  const newViewLiteral = `{
    key: "${escapeForDoubleQuotedString(newKey)}",
    label: "${escapeForDoubleQuotedString(newLabel)}",
    parentKey: "${escapeForDoubleQuotedString(effectiveAttachKey)}",
    ${conditionText}
    kind: "view",
    direction: "${direction}",
    targetLabel: "${targetDef.label}",
    getTarget: (r) => r.todayCPR.${targetDef.key},
    ${entryText}
    levelCheckDefs: ${JSON.stringify(levelCheckDefs, null, 2)},
  }`;

  const topCat = resolveTopLevelCategoryKey(sourceText, effectiveAttachKey);
  if (!topCat) {
    throw new Error(
      `Couldn't resolve a top-level category for attach point "${effectiveAttachKey}" — its parentKey chain in views.ts doesn't reach a kind:"category" node. Fix the chain (or add the key to SSRR_LETTER_TO_CATEGORY if it's a generated compound Pattern) rather than letting the View fall into CREATED VIEWS.`
    );
  }

  const arrName = CATEGORY_ARRAY_MAP[topCat];
  if (!arrName) {
    throw new Error(
      `No views.ts array is mapped for category "${topCat}" — add it to CATEGORY_ARRAY_MAP in patch.mjs.`
    );
  }

  const targetArrayDecl = sourceFile.getVariableDeclarationOrThrow(arrName);
  const targetArray = targetArrayDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  targetArray.addElement(newViewLiteral);

  return { patchedText: sourceFile.getFullText(), topCat, arrName };
}

// --- Entry point ------------------------------------------------------
const patternKey = process.env.PATTERN_KEY;
const newKey = process.env.NEW_KEY;
const newLabel = process.env.NEW_LABEL;
const levelCheckDefsB64 = process.env.LEVEL_CHECK_DEFS_B64;
const attachKey = process.env.ATTACH_KEY && process.env.ATTACH_KEY.trim() !== "" ? process.env.ATTACH_KEY : patternKey;
const direction = normalizeDirection(process.env.DIRECTION) ?? "Up";
const target = process.env.TARGET && process.env.TARGET.trim() !== "" ? process.env.TARGET.trim() : direction === "Up" ? "R4" : "S4";
const gapBadge = process.env.GAP_BADGE && process.env.GAP_BADGE.trim() !== "" ? process.env.GAP_BADGE.trim() : undefined;
const viewsFilePath = process.env.VIEWS_FILE_PATH ?? process.env.BACKTEST_FILE_PATH ?? "artifacts/cpr-screener/src/lib/views.ts";
const viewsSidebarFilePathEnv = process.env.VIEWS_SIDEBAR_FILE_PATH ?? "artifacts/cpr-screener/src/lib/ViewsSidebar.tsx";

if (!patternKey || !newKey || !newLabel || !levelCheckDefsB64) {
  console.error("PATTERN_KEY, NEW_KEY, NEW_LABEL, and LEVEL_CHECK_DEFS_B64 must all be set.");
  process.exit(1);
}

if (process.env.DIRECTION && !normalizeDirection(process.env.DIRECTION)) {
  console.error(`DIRECTION "${process.env.DIRECTION}" isn't one of Up/Down (bullish/bearish also accepted).`);
  process.exit(1);
}

let levelCheckDefs;
try {
  const json = Buffer.from(levelCheckDefsB64, "base64").toString("utf-8");
  levelCheckDefs = JSON.parse(json);
  if (!Array.isArray(levelCheckDefs)) {
    throw new Error("Decoded levelCheckDefs is not an array.");
  }
  for (const cond of levelCheckDefs) {
    if (
      typeof cond !== "object" ||
      cond === null ||
      typeof cond.key !== "string" ||
      (cond.subject !== "today" && cond.subject !== "previous") ||
      !Array.isArray(cond.bandKeys) ||
      cond.bandKeys.length !== 2
    ) {
      throw new Error(`Malformed levelCheckDefs entry: ${JSON.stringify(cond)}`);
    }
  }
} catch (err) {
  console.error(`Couldn't decode LEVEL_CHECK_DEFS_B64: ${err.message}`);
  process.exit(1);
}

const filePath = resolve(process.cwd(), "../../../", viewsFilePath);

let currentText;
try {
  currentText = readFileSync(filePath, "utf-8");
} catch (err) {
  console.error(`Could not read ${filePath}: ${err.message}`);
  process.exit(1);
}

try {
  const { patchedText, topCat, arrName } = applyCreateViewPatch(
    currentText,
    patternKey,
    newKey,
    newLabel,
    direction,
    target,
    levelCheckDefs,
    attachKey,
    gapBadge
  );
  writeFileSync(filePath, patchedText, "utf-8");

  const viewsSidebarFilePath = resolve(process.cwd(), "../../../", viewsSidebarFilePathEnv);
  const viewsSidebarText = readFileSync(viewsSidebarFilePath, "utf-8");

  // Only sections that exist in pivotcategories actually render; anything
  // else would be an invisible bucket, so those fall back to copyViews.
  const navIds = getScreenerNavCategoryIds(viewsSidebarText);
  const screenerCategoryKey = navIds.includes(topCat) ? topCat : "copyViews";
  if (screenerCategoryKey !== topCat) {
    console.warn(
      `"${topCat}" has no entry in ViewsSidebar.tsx's pivotcategories — putting the nav chip in "copyViews" instead.`
    );
  }

  const patchedViewsSidebarText = addToScreenerNav(viewsSidebarText, screenerCategoryKey, newKey, newLabel);
  writeFileSync(viewsSidebarFilePath, patchedViewsSidebarText, "utf-8");

  console.log(
    `Created "${newKey}" (direction ${direction}, target ${target}, grades against "${patternKey}"${
      gapBadge ? ` AND Gap Badge "${gapBadge}"` : ""
    }) under "${attachKey}" in ${arrName} with ${levelCheckDefs.length} symbol-derived levelCheckDefs`
  );
  console.log(`Added "${newKey}" to ${viewsSidebarFilePathEnv}'s Views["${screenerCategoryKey}"]`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
