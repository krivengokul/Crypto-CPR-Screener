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

const CATEGORY_ARRAY_MAP = {
  levelsabove: "LEVELSABOVE_VIEWS",
  levelsbelow: "LEVELSBELOW_VIEWS",
  compressed: "COMPRESSED_VIEWS",
  expanded: "EXPANDED_VIEWS",
  R1AbovePR4: "R1ABOVEPR4_S1BELOWPS4_VIEWS",
  S1BelowPS4: "R1ABOVEPR4_S1BELOWPS4_VIEWS",
  "equal-cpr": "MISC_VIEWS",
};

function applyCreateViewPatch(sourceText, patternKey, newKey, newLabel, direction, target, levelCheckDefs, attachKey) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("views.ts", sourceText);

  const targetDef = direction === "bullish" ? BULLISH_TARGETS[target] : BEARISH_TARGETS[target];
  if (!targetDef) {
    throw new Error(`"${target}" isn't a valid target for direction "${direction}".`);
  }

  const allViewObjs = sourceFile
    .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
    .filter((obj) => getStringPropertyValue(obj, "key") !== undefined);

  if (allViewObjs.some((el) => getStringPropertyValue(el, "key") === newKey)) {
    throw new Error(`"${newKey}" already exists in views.ts — pick a different key.`);
  }

  const effectiveAttachKey = attachKey && attachKey.trim() !== "" ? attachKey : patternKey;

  const entryText =
    direction === "bullish"
      ? `entryLabel: "TC (today's TC)",\n    getEntry: (r) => r.todayCPR.tc,\n    stoplossLabel: "S1 (today's S1)",\n    getStoploss: (r) => r.todayCPR.s1,`
      : `entryLabel: "BC (today's BC)",\n    getEntry: (r) => r.todayCPR.bc,\n    stoplossLabel: "R1 (today's R1)",\n    getStoploss: (r) => r.todayCPR.r1,`;

  const newViewLiteral = `{
    key: "${escapeForDoubleQuotedString(newKey)}",
    label: "${escapeForDoubleQuotedString(newLabel)}",
    parentKey: "${escapeForDoubleQuotedString(effectiveAttachKey)}",
    conditionKey: "${escapeForDoubleQuotedString(patternKey)}",
    kind: "view",
    direction: "${direction}",
    targetLabel: "${targetDef.label}",
    getTarget: (r) => r.todayCPR.${targetDef.key},
    ${entryText}
    levelCheckDefs: ${JSON.stringify(levelCheckDefs, null, 2)},
  }`;

  const topCat = resolveTopLevelCategoryKey(sourceText, effectiveAttachKey);
  const arrName = CATEGORY_ARRAY_MAP[topCat] ?? "COPY_VIEWS";

  let targetArrayDecl = sourceFile.getVariableDeclaration(arrName) ?? sourceFile.getVariableDeclaration("COPY_VIEWS");
  if (!targetArrayDecl) {
    targetArrayDecl = sourceFile.getVariableDeclarationOrThrow("LEVELSABOVE_VIEWS");
  }

  const targetArray = targetArrayDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  targetArray.addElement(newViewLiteral);

  return { patchedText: sourceFile.getFullText() };
}

// --- Entry point ------------------------------------------------------
const patternKey = process.env.PATTERN_KEY;
const newKey = process.env.NEW_KEY;
const newLabel = process.env.NEW_LABEL;
const levelCheckDefsB64 = process.env.LEVEL_CHECK_DEFS_B64;
const attachKey = process.env.ATTACH_KEY && process.env.ATTACH_KEY.trim() !== "" ? process.env.ATTACH_KEY : patternKey;
const direction = process.env.DIRECTION === "bearish" ? "bearish" : "bullish";
const target = process.env.TARGET && process.env.TARGET.trim() !== "" ? process.env.TARGET : direction === "bullish" ? "R4" : "S4";
const viewsFilePath = process.env.VIEWS_FILE_PATH ?? process.env.BACKTEST_FILE_PATH ?? "artifacts/cpr-screener/src/lib/views.ts";
const viewsSidebarFilePathEnv = process.env.VIEWS_SIDEBAR_FILE_PATH ?? "artifacts/cpr-screener/src/lib/ViewsSidebar.tsx";

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

const filePath = resolve(process.cwd(), "../../../", viewsFilePath);

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

  const screenerCategoryKey = resolveTopLevelCategoryKey(currentText, attachKey) ?? "copyViews";
  const viewsSidebarFilePath = resolve(process.cwd(), "../../../", viewsSidebarFilePathEnv);
  const viewsSidebarText = readFileSync(viewsSidebarFilePath, "utf-8");
  const patchedViewsSidebarText = addToScreenerNav(viewsSidebarText, screenerCategoryKey, newKey, newLabel);
  writeFileSync(viewsSidebarFilePath, patchedViewsSidebarText, "utf-8");

  console.log(
    `Created "${newKey}" (grades against "${patternKey}") under Category/Pattern/Subpattern "${attachKey}" with ${levelCheckDefs.length} symbol-derived levelCheckDefs`
  );
  console.log(`Added "${newKey}" to ${viewsSidebarFilePathEnv}'s Views["${screenerCategoryKey}"]`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
