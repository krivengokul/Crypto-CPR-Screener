import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Project, SyntaxKind } from "ts-morph";

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
 * Pushes {id: newKey, label: newLabel} into ViewsSidebar.tsx's
 * Views[categoryKey] array (creating it if it doesn't exist yet).
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
 * Walks parentKey chain in views.ts AST to find the root category key.
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
  let visited = new Set();
  while (currKey && !visited.has(currKey)) {
    visited.add(currKey);
    const obj = objMap.get(currKey);
    if (!obj) break;
    const kind = getStringPropertyValue(obj, "kind");
    if (kind === "category") return currKey;
    currKey = getStringPropertyValue(obj, "parentKey");
  }

  return null;
}

const CATEGORY_ARRAY_MAP = {
  levelsabove: "LEVELSABOVE_VIEWS",
  levelsbelow: "LEVELSBELOW_VIEWS",
  compressed: "COMPRESSED_VIEWS",
  expanded: "EXPANDED_VIEWS",
  R1AbovePR4: "R1ABOVEPR4_S1BELOWPS4_VIEWS",
  S1BelowPS4: "R1ABOVEPR4_S1BELOWPS4_VIEWS",
  "equal-cpr": "MISC_VIEWS",
};

function applyCopyViewPatch(sourceText, sourceKey, newKey, newLabel, levelCheckDefs, attachKey) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("views.ts", sourceText);

  // Locate the source view across all object literals in views.ts
  const allViewObjs = sourceFile
    .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
    .filter((obj) => getStringPropertyValue(obj, "key") !== undefined);

  const sourceObj = allViewObjs.find((el) => getStringPropertyValue(el, "key") === sourceKey);
  if (!sourceObj) {
    throw new Error(`No ViewDef entry with key "${sourceKey}" found in views.ts.`);
  }

  if (allViewObjs.some((el) => getStringPropertyValue(el, "key") === newKey)) {
    throw new Error(`"${newKey}" already exists in views.ts — pick a different key.`);
  }

  const effectiveAttachKey = attachKey && attachKey.trim() !== "" ? attachKey : (getStringPropertyValue(sourceObj, "parentKey") ?? sourceKey);
  const originalConditionKey = getStringPropertyValue(sourceObj, "conditionKey") ?? sourceKey;

  // Clone properties from sourceObj
  const direction = getStringPropertyValue(sourceObj, "direction") ?? "bullish";
  const targetLabel = getStringPropertyValue(sourceObj, "targetLabel") ?? "U4 (today's R4)";
  const entryLabel = getStringPropertyValue(sourceObj, "entryLabel") ?? "TC (today's TC)";
  const stoplossLabel = getStringPropertyValue(sourceObj, "stoplossLabel") ?? "S1 (today's S1)";

  const getTargetProp = sourceObj.getProperty("getTarget");
  const getTargetText = getTargetProp && getTargetProp.isKind(SyntaxKind.PropertyAssignment)
    ? getTargetProp.getInitializer().getText()
    : "(r) => r.todayCPR.r4";

  const getEntryProp = sourceObj.getProperty("getEntry");
  const getEntryText = getEntryProp && getEntryProp.isKind(SyntaxKind.PropertyAssignment)
    ? getEntryProp.getInitializer().getText()
    : direction === "bullish" ? "(r) => r.todayCPR.tc" : "(r) => r.todayCPR.bc";

  const getStoplossProp = sourceObj.getProperty("getStoploss");
  const getStoplossText = getStoplossProp && getStoplossProp.isKind(SyntaxKind.PropertyAssignment)
    ? getStoplossProp.getInitializer().getText()
    : direction === "bullish" ? "(r) => r.todayCPR.s1" : "(r) => r.todayCPR.r1";

  // Level check defs: override if provided, else copy from source if present
  let levelCheckDefsJson = "undefined";
  if (levelCheckDefs !== null) {
    levelCheckDefsJson = JSON.stringify(levelCheckDefs, null, 2);
  } else {
    const sourceLcd = sourceObj.getProperty("levelCheckDefs");
    if (sourceLcd && sourceLcd.isKind(SyntaxKind.PropertyAssignment)) {
      levelCheckDefsJson = sourceLcd.getInitializer().getText();
    }
  }

  const newViewLiteral = `{
    key: "${escapeForDoubleQuotedString(newKey)}",
    label: "${escapeForDoubleQuotedString(newLabel)}",
    parentKey: "${escapeForDoubleQuotedString(effectiveAttachKey)}",
    conditionKey: "${escapeForDoubleQuotedString(originalConditionKey)}",
    kind: "view",
    direction: "${direction}",
    targetLabel: "${escapeForDoubleQuotedString(targetLabel)}",
    getTarget: ${getTargetText},
    entryLabel: "${escapeForDoubleQuotedString(entryLabel)}",
    getEntry: ${getEntryText},
    stoplossLabel: "${escapeForDoubleQuotedString(stoplossLabel)}",
    getStoploss: ${getStoplossText},
    levelCheckDefs: ${levelCheckDefsJson},
  }`;

  // Find COPY_VIEWS array to append into
  let targetArrayDecl = sourceFile.getVariableDeclaration("COPY_VIEWS");
  if (!targetArrayDecl) {
    const topCat = resolveTopLevelCategoryKey(sourceText, effectiveAttachKey);
    const arrName = CATEGORY_ARRAY_MAP[topCat] ?? "LEVELSABOVE_VIEWS";
    targetArrayDecl = sourceFile.getVariableDeclarationOrThrow(arrName);
  }

  const targetArray = targetArrayDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  targetArray.addElement(newViewLiteral);

  return { patchedText: sourceFile.getFullText(), originalConditionKey };
}

// --- Entry point ------------------------------------------------------
const sourceKey = process.env.SOURCE_KEY;
const newKey = process.env.NEW_KEY;
const newLabel = process.env.NEW_LABEL;
const levelCheckDefsB64 = process.env.LEVEL_CHECK_DEFS_B64;
const attachKey = process.env.ATTACH_KEY && process.env.ATTACH_KEY.trim() !== "" ? process.env.ATTACH_KEY : sourceKey;
const viewsFilePath = process.env.VIEWS_FILE_PATH ?? process.env.BACKTEST_FILE_PATH ?? "artifacts/cpr-screener/src/lib/views.ts";
const viewsSidebarFilePathEnv = process.env.VIEWS_SIDEBAR_FILE_PATH ?? "artifacts/cpr-screener/src/lib/ViewsSidebar.tsx";

if (!sourceKey || !newKey || !newLabel) {
  console.error("SOURCE_KEY, NEW_KEY, and NEW_LABEL must all be set.");
  process.exit(1);
}

let levelCheckDefs = null;
if (levelCheckDefsB64 && levelCheckDefsB64.trim() !== "") {
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
  const { patchedText, originalConditionKey } = applyCopyViewPatch(
    currentText,
    sourceKey,
    newKey,
    newLabel,
    levelCheckDefs,
    attachKey
  );
  writeFileSync(filePath, patchedText, "utf-8");

  const screenerCategoryKey = resolveTopLevelCategoryKey(currentText, attachKey) ?? "copyViews";
  const viewsSidebarFilePath = resolve(process.cwd(), "../../../", viewsSidebarFilePathEnv);
  const viewsSidebarText = readFileSync(viewsSidebarFilePath, "utf-8");
  const patchedViewsSidebarText = addToScreenerNav(viewsSidebarText, screenerCategoryKey, newKey, newLabel);
  writeFileSync(viewsSidebarFilePath, patchedViewsSidebarText, "utf-8");

  const levelCheckNote = levelCheckDefs ? ` with ${levelCheckDefs.length} symbol-derived levelCheckDefs` : "";
  console.log(
    `Patched ${viewsFilePath}: "${sourceKey}" -> "${newKey}" under "${attachKey}" (grades against "${originalConditionKey}")${levelCheckNote}`
  );
  console.log(`Added "${newKey}" to ${viewsSidebarFilePathEnv}'s Views["${screenerCategoryKey}"]`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
