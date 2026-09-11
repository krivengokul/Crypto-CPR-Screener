import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Project, SyntaxKind } from "ts-morph";

/**
 * Builds a brand-new BACKTEST_TARGETS entry for a Pattern/Subpattern that
 * doesn't have a graded View of its own yet (BacktestPanel.tsx's
 * activePatternTarget undefined for it), rather than cloning an existing
 * entry (that's copy-view's job). Uses the fixed default recipe — target
 * R4, entry TC, stoploss S1, bullish — matching backtest.ts's own
 * fallback description ("U4 (today's R4)") shown for exactly this case,
 * and the overwhelming majority convention already used across
 * BACKTEST_TARGETS. Grades against `patternKey` itself via conditionKey,
 * since a Pattern/Subpattern node's own key is already a real
 * passesPattern condition — no new pattern-matching logic needed.
 */

function escapeForDoubleQuotedString(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getStringPropertyValue(obj, name) {
  const prop = obj.getProperty(name);
  if (!prop || !prop.isKind(SyntaxKind.PropertyAssignment)) return undefined;
  const initializer = prop.getInitializer();
  if (!initializer || !initializer.isKind(SyntaxKind.StringLiteral)) return undefined;
  return initializer.getLiteralText();
}

/**
 * Recursively walks a `patterns` ArrayLiteralExpression (BacktestSubCategoryDef[])
 * looking for the ObjectLiteralExpression whose own `key` === patternKey,
 * at any depth. Returns that node, or null.
 */
function findPatternNode(patternsArray, patternKey) {
  if (!patternsArray) return null;
  for (const el of patternsArray.getElements()) {
    if (!el.isKind(SyntaxKind.ObjectLiteralExpression)) continue;
    if (getStringPropertyValue(el, "key") === patternKey) return el;

    const nestedProp = el.getProperty("patterns");
    if (nestedProp && nestedProp.isKind(SyntaxKind.PropertyAssignment)) {
      const nestedArray = nestedProp.getInitializer();
      if (nestedArray && nestedArray.isKind(SyntaxKind.ArrayLiteralExpression)) {
        const found = findPatternNode(nestedArray, patternKey);
        if (found) return found;
      }
    }
  }
  return null;
}

/**
 * Pushes {id: newKey, label: newLabel} into ViewsSidebar.tsx's
 * Views.copyViews array — same as copy-view's patch.mjs. See that
 * script's own copy of this function for the full doc comment.
 */
function addToScreenerNav(sourceText, categoryKey, newKey, newLabel) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("ViewsSidebar.tsx", sourceText);

  const viewsDecl = sourceFile.getVariableDeclarationOrThrow("Views");
  const viewsObj = viewsDecl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  const categoryProp = viewsObj.getProperty(categoryKey);
  let arr;
  if (categoryProp && categoryProp.isKind(SyntaxKind.PropertyAssignment)) {
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
 * ViewsSidebar.tsx's `Views` record only has ONE level of nesting
 * (top-level Category key -> flat array of leaf View entries) — it
 * flattens away the Pattern/Subpattern layers BACKTEST_CATEGORIES has.
 * So "file this under the Subpattern picked in the attach dropdown" can
 * only mean: find that Subpattern's TOP-LEVEL ancestor Category in
 * BACKTEST_CATEGORIES, and use THAT category's key as the Views[...]
 * bucket — the same bucket every other View already nested anywhere
 * under that category lands in. Returns null if attachKey isn't found
 * anywhere in BACKTEST_CATEGORIES (caller falls back to "copyViews").
 */
function resolveTopLevelCategoryKey(backtestSourceText, attachKey) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("backtest.ts", backtestSourceText);
  const categoriesDecl = sourceFile.getVariableDeclarationOrThrow("BACKTEST_CATEGORIES");
  const categoriesArray = categoriesDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);

  const containsKeyRecursively = (patternsArray, key) => {
    for (const p of patternsArray.getElements()) {
      if (!p.isKind(SyntaxKind.ObjectLiteralExpression)) continue;
      if (getStringPropertyValue(p, "key") === key) return true;
      const nestedProp = p.getProperty("patterns");
      if (nestedProp && nestedProp.isKind(SyntaxKind.PropertyAssignment)) {
        const nestedArray = nestedProp.getInitializer();
        if (nestedArray && nestedArray.isKind(SyntaxKind.ArrayLiteralExpression)) {
          if (containsKeyRecursively(nestedArray, key)) return true;
        }
      }
    }
    return false;
  };

  for (const cat of categoriesArray.getElements()) {
    if (!cat.isKind(SyntaxKind.ObjectLiteralExpression)) continue;
    const catKey = getStringPropertyValue(cat, "key");
    if (catKey === attachKey) return catKey;
    const patternsProp = cat.getProperty("patterns");
    if (patternsProp && patternsProp.isKind(SyntaxKind.PropertyAssignment)) {
      const patternsArray = patternsProp.getInitializer();
      if (patternsArray && patternsArray.isKind(SyntaxKind.ArrayLiteralExpression)) {
        if (containsKeyRecursively(patternsArray, attachKey)) return catKey;
      }
    }
  }
  return null;
}

const BULLISH_TARGETS = {
  R2: { label: "U2 (today's R2)", key: "r2" },
  R3: { label: "U3 (today's R3)", key: "r3" },
  R4: { label: "U4 (today's R4)", key: "r4" },
};
const BEARISH_TARGETS = {
  S2: { label: "L2 (today's S2)", key: "s2" },
  S3: { label: "L3 (today's S3)", key: "s3" },
  S4: { label: "L4 (today's S4)", key: "s4" },
};

function applyCreateViewPatch(sourceText, patternKey, newKey, newLabel, direction, target, levelCheckDefs, attachKey) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("backtest.ts", sourceText);

  const targetDef = direction === "bullish" ? BULLISH_TARGETS[target] : BEARISH_TARGETS[target];
  if (!targetDef) {
    throw new Error(`"${target}" isn't a valid target for direction "${direction}".`);
  }

  // --- 1. Guard against a duplicate key --------------------------------
  const targetsDecl = sourceFile.getVariableDeclarationOrThrow("BACKTEST_TARGETS");
  const targetsArray = targetsDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  const alreadyExists = targetsArray
    .getElements()
    .some((el) => el.isKind(SyntaxKind.ObjectLiteralExpression) && getStringPropertyValue(el, "key") === newKey);
  if (alreadyExists) {
    throw new Error(`"${newKey}" already exists in BACKTEST_TARGETS — pick a different key.`);
  }

  // --- 2. Locate the Pattern/Subpattern node this View attaches to -----
  // attachKey (defaulting to patternKey) picks WHERE in the tree the new
  // View is nested; patternKey always stays the View's conditionKey
  // below (what it grades against), so a View can be created from one
  // Pattern's row but filed under a different Subpattern.
  const categoriesDecl = sourceFile.getVariableDeclarationOrThrow("BACKTEST_CATEGORIES");
  const categoriesArray = categoriesDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  const effectiveAttachKey = attachKey && attachKey.trim() !== "" ? attachKey : patternKey;

  let patternNode = null;
  for (const cat of categoriesArray.getElements()) {
    if (!cat.isKind(SyntaxKind.ObjectLiteralExpression)) continue;
    // A bare Category can itself be the attach point now — checked
    // first, same reasoning as backtest.ts's in-memory createBacktestView.
    if (getStringPropertyValue(cat, "key") === effectiveAttachKey) {
      patternNode = cat;
      break;
    }
    const patternsProp = cat.getProperty("patterns");
    if (patternsProp && patternsProp.isKind(SyntaxKind.PropertyAssignment)) {
      const patternsArray = patternsProp.getInitializer();
      if (patternsArray && patternsArray.isKind(SyntaxKind.ArrayLiteralExpression)) {
        patternNode = findPatternNode(patternsArray, effectiveAttachKey);
        if (patternNode) break;
      }
    }
  }
  if (!patternNode) {
    throw new Error(
      `Couldn't find a Category/Pattern/Subpattern with key "${effectiveAttachKey}" in BACKTEST_CATEGORIES — can't attach the new View.`
    );
  }

  // --- 3. Build and insert the new BACKTEST_TARGETS entry --------------
  // direction: bullish -> entry TC, stoploss S1; bearish -> entry BC,
  // stoploss R1 — this codebase's own convention (see e.g.
  // "7PM:MoMi-<L4:2AM" for a real bearish example of this exact shape).
  const entryText =
    direction === "bullish"
      ? `entryLabel: "TC (today's TC)",\n    getEntry: (r) => r.todayCPR.tc,\n    stoplossLabel: "S1 (today's S1)",\n    getStoploss: (r) => r.todayCPR.s1,`
      : `entryLabel: "BC (today's BC)",\n    getEntry: (r) => r.todayCPR.bc,\n    stoplossLabel: "R1 (today's R1)",\n    getStoploss: (r) => r.todayCPR.r1,`;

  const newEntryText = `{
    key: "${escapeForDoubleQuotedString(newKey)}",
    label: "${escapeForDoubleQuotedString(newLabel)}",
    direction: "${direction}",
    targetLabel: "${targetDef.label}",
    getTarget: (r) => r.todayCPR.${targetDef.key},
    ${entryText}
    conditionKey: "${escapeForDoubleQuotedString(patternKey)}",
    levelCheckDefs: ${JSON.stringify(levelCheckDefs)},
  }`;
  targetsArray.addElement(newEntryText);

  // --- 4. Insert newKey into the pattern node's own subPatternKeys -----
  const subPatternKeysProp = patternNode.getProperty("subPatternKeys");
  if (subPatternKeysProp && subPatternKeysProp.isKind(SyntaxKind.PropertyAssignment)) {
    const arr = subPatternKeysProp.getInitializer();
    if (arr && arr.isKind(SyntaxKind.ArrayLiteralExpression)) {
      arr.addElement(`"${escapeForDoubleQuotedString(newKey)}"`);
    } else {
      throw new Error(`"${patternKey}"'s subPatternKeys isn't an array literal — can't insert into it.`);
    }
  } else {
    // Node had no subPatternKeys property at all — add one.
    patternNode.addPropertyAssignment({
      name: "subPatternKeys",
      initializer: `["${escapeForDoubleQuotedString(newKey)}"]`,
    });
  }

  return { patchedText: sourceFile.getFullText() };
}

// --- Entry point ------------------------------------------------------
const patternKey = process.env.PATTERN_KEY;
const newKey = process.env.NEW_KEY;
const newLabel = process.env.NEW_LABEL;
const levelCheckDefsB64 = process.env.LEVEL_CHECK_DEFS_B64;
// Where in BACKTEST_CATEGORIES the new View is nested — defaults to
// patternKey (the node "Create View" was opened from) when left blank,
// which is the original behavior. patternKey itself always stays the
// View's conditionKey (what it grades against) regardless of attachKey.
const attachKey = process.env.ATTACH_KEY && process.env.ATTACH_KEY.trim() !== "" ? process.env.ATTACH_KEY : patternKey;
const direction = process.env.DIRECTION === "bearish" ? "bearish" : "bullish";
const target = process.env.TARGET && process.env.TARGET.trim() !== "" ? process.env.TARGET : direction === "bullish" ? "R4" : "S4";
const backtestFilePath = process.env.BACKTEST_FILE_PATH ?? "artifacts/cpr-screener/src/lib/backtest.ts";
const VIEWS_SIDEBAR_FILE_PATH = process.env.VIEWS_SIDEBAR_FILE_PATH ?? "artifacts/cpr-screener/src/lib/ViewsSidebar.tsx";

if (!patternKey || !newKey || !newLabel || !levelCheckDefsB64) {
  console.error("PATTERN_KEY, NEW_KEY, NEW_LABEL, and LEVEL_CHECK_DEFS_B64 must all be set.");
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

// Resolve relative to the repo root (this script runs from
// .github/scripts/create-view, three levels below root).
const filePath = resolve(process.cwd(), "../../../", backtestFilePath);

let currentText;
try {
  currentText = readFileSync(filePath, "utf-8");
} catch (err) {
  console.error(`Could not read ${filePath}: ${err.message}`);
  process.exit(1);
}

try {
  const { patchedText } = applyCreateViewPatch(
    currentText,
    patternKey,
    newKey,
    newLabel,
    direction,
    target,
    levelCheckDefs,
    attachKey
  );
  writeFileSync(filePath, patchedText, "utf-8");

  // File the ViewsSidebar nav entry under the TOP-LEVEL Category that
  // owns attachKey (ViewsSidebar's Views record only nests one level
  // deep, so this is the closest real match to "the Subpattern picked
  // in the attach dropdown" — see resolveTopLevelCategoryKey's doc
  // comment above). Falls back to "copyViews" only if attachKey somehow
  // can't be resolved (shouldn't happen — applyCreateViewPatch already
  // validated it exists in this same tree).
  const screenerCategoryKey = resolveTopLevelCategoryKey(currentText, attachKey) ?? "copyViews";
  const viewsSidebarFilePath = resolve(process.cwd(), "../../../", VIEWS_SIDEBAR_FILE_PATH);
  const viewsSidebarText = readFileSync(viewsSidebarFilePath, "utf-8");
  const patchedViewsSidebarText = addToScreenerNav(viewsSidebarText, screenerCategoryKey, newKey, newLabel);
  writeFileSync(viewsSidebarFilePath, patchedViewsSidebarText, "utf-8");

  console.log(
    `Created "${newKey}" (grades against "${patternKey}") under Category/Pattern/Subpattern "${attachKey}" with ${levelCheckDefs.length} symbol-derived levelCheckDefs`
  );
  console.log(`Added "${newKey}" to ${VIEWS_SIDEBAR_FILE_PATH}'s Views["${screenerCategoryKey}"]`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
