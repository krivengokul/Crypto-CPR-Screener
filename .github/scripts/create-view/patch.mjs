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
function addToScreenerNav(sourceText, newKey, newLabel) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("ViewsSidebar.tsx", sourceText);

  const viewsDecl = sourceFile.getVariableDeclarationOrThrow("Views");
  const viewsObj = viewsDecl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  const copyViewsProp = viewsObj.getProperty("copyViews");
  if (!copyViewsProp || !copyViewsProp.isKind(SyntaxKind.PropertyAssignment)) {
    throw new Error("Views.copyViews not found in ViewsSidebar.tsx — has it been removed or renamed?");
  }
  const arr = copyViewsProp.getInitializer();
  if (!arr || !arr.isKind(SyntaxKind.ArrayLiteralExpression)) {
    throw new Error("Views.copyViews isn't an array literal — can't insert into it.");
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

function applyCreateViewPatch(sourceText, patternKey, newKey, newLabel, levelCheckDefs) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("backtest.ts", sourceText);

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
  const categoriesDecl = sourceFile.getVariableDeclarationOrThrow("BACKTEST_CATEGORIES");
  const categoriesArray = categoriesDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);

  let patternNode = null;
  for (const cat of categoriesArray.getElements()) {
    if (!cat.isKind(SyntaxKind.ObjectLiteralExpression)) continue;
    const patternsProp = cat.getProperty("patterns");
    if (patternsProp && patternsProp.isKind(SyntaxKind.PropertyAssignment)) {
      const patternsArray = patternsProp.getInitializer();
      if (patternsArray && patternsArray.isKind(SyntaxKind.ArrayLiteralExpression)) {
        patternNode = findPatternNode(patternsArray, patternKey);
        if (patternNode) break;
      }
    }
  }
  if (!patternNode) {
    throw new Error(
      `Couldn't find a Pattern/Subpattern with key "${patternKey}" in BACKTEST_CATEGORIES — can't attach the new View.`
    );
  }

  // --- 3. Build and insert the new BACKTEST_TARGETS entry --------------
  const newEntryText = `{
    key: "${escapeForDoubleQuotedString(newKey)}",
    label: "${escapeForDoubleQuotedString(newLabel)}",
    direction: "bullish",
    targetLabel: "U4 (today's R4)",
    getTarget: (r) => r.todayCPR.r4,
    entryLabel: "TC (today's TC)",
    getEntry: (r) => r.todayCPR.tc,
    stoplossLabel: "S1 (today's S1)",
    getStoploss: (r) => r.todayCPR.s1,
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
  const { patchedText } = applyCreateViewPatch(currentText, patternKey, newKey, newLabel, levelCheckDefs);
  writeFileSync(filePath, patchedText, "utf-8");

  // Also add the new key to ViewsSidebar.tsx's Views.copyViews — see
  // addToScreenerNav's doc comment above.
  const viewsSidebarFilePath = resolve(process.cwd(), "../../../", VIEWS_SIDEBAR_FILE_PATH);
  const viewsSidebarText = readFileSync(viewsSidebarFilePath, "utf-8");
  const patchedViewsSidebarText = addToScreenerNav(viewsSidebarText, newKey, newLabel);
  writeFileSync(viewsSidebarFilePath, patchedViewsSidebarText, "utf-8");

  console.log(
    `Created "${newKey}" under Pattern/Subpattern "${patternKey}" with ${levelCheckDefs.length} symbol-derived levelCheckDefs`
  );
  console.log(`Added "${newKey}" to ${VIEWS_SIDEBAR_FILE_PATH}'s Views.copyViews`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
