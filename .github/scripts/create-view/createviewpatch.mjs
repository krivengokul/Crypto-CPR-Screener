import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { Project, SyntaxKind } from "ts-morph";

function escapeForDoubleQuotedString(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

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

const SSRR_LETTER_TO_CATEGORY = {
  A: "levelsabove",
  B: "levelsbelow",
  C: "compressed",
  E: "expanded",
};
const COMPOUND_KEY_RE = /^([ABCE])-[ABCE]-[A-Za-z]+-[A-Za-z]+$/;

function resolveTopLevelCategoryKey(allViewObjs, attachKey) {
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

    const compound = COMPOUND_KEY_RE.exec(currKey);
    if (compound) return SSRR_LETTER_TO_CATEGORY[compound[1]] ?? null;

    break;
  }

  return null;
}

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

const ENTRY_DEFS = {
  R4: { label: "R4 (today's R4)", key: "r4" },
  R3: { label: "R3 (today's R3)", key: "r3" },
  R2: { label: "R2 (today's R2)", key: "r2" },
  R1: { label: "R1 (today's R1)", key: "r1" },
  TC: { label: "TC (today's TC)", key: "tc" },
  Pivot: { label: "Pivot (today's Pivot)", key: "pivot" },
  BC: { label: "BC (today's BC)", key: "bc" },
  S1: { label: "S1 (today's S1)", key: "s1" },
  S2: { label: "S2 (today's S2)", key: "s2" },
  S3: { label: "S3 (today's S3)", key: "s3" },
  S4: { label: "S4 (today's S4)", key: "s4" },
};

const CATEGORY_FILE_MAP = {
  levelsabove: { file: "categories/levelsAbove.ts", arr: "LEVELSABOVE_VIEWS" },
  levelsbelow: { file: "categories/levelsBelow.ts", arr: "LEVELSBELOW_VIEWS" },
  compressed: { file: "categories/compressed.ts", arr: "COMPRESSED_VIEWS" },
  expanded: { file: "categories/expanded.ts", arr: "EXPANDED_VIEWS" },
  R1AbovePR4: { file: "categories/r4s4.ts", arr: "R1ABOVEPR4_S1BELOWPS4_VIEWS" },
  S1BelowPS4: { file: "categories/r4s4.ts", arr: "R1ABOVEPR4_S1BELOWPS4_VIEWS" },
  "equal-cpr": { file: "categories/misc.ts", arr: "MISC_VIEWS" },
  top15gainers: { file: "categories/misc.ts", arr: "MISC_VIEWS" },
  top15losers: { file: "categories/misc.ts", arr: "MISC_VIEWS" },
  touch: { file: "categories/misc.ts", arr: "MISC_VIEWS" },
};
const DEFAULT_TARGET = { file: "categories/copyViews.ts", arr: "COPY_VIEWS" };

function normalizeDirection(raw) {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "down" || v === "bearish") return "Down";
  if (v === "up" || v === "bullish") return "Up";
  return null;
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
const entry = process.env.ENTRY && process.env.ENTRY.trim() !== "" ? process.env.ENTRY.trim() : direction === "Up" ? "TC" : "BC";
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

const baseFilePath = resolve(process.cwd(), "../../../", viewsFilePath);
const viewsDir = existsSync(baseFilePath) && statSync(baseFilePath).isDirectory()
  ? baseFilePath
  : resolve(dirname(baseFilePath), "views");
const isModular = existsSync(resolve(viewsDir, "categories"));

const project = new Project();
let targetFile, targetArrayDecl, targetArray, allViewObjs;

if (isModular) {
  project.addSourceFilesAtPaths(`${viewsDir}/categories/*.ts`);
  allViewObjs = project.getSourceFiles().flatMap((sf) =>
    sf
      .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
      .filter((obj) => getStringPropertyValue(obj, "key") !== undefined)
  );
} else {
  const sourceFile = project.addSourceFileAtPath(baseFilePath);
  allViewObjs = sourceFile
    .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
    .filter((obj) => getStringPropertyValue(obj, "key") !== undefined);
}

if (allViewObjs.some((el) => getStringPropertyValue(el, "key") === newKey)) {
  throw new Error(`"${newKey}" already exists — pick a different key.`);
}

const targetDef = direction === "Up" ? BULLISH_TARGETS[target] : BEARISH_TARGETS[target];
if (!targetDef) {
  throw new Error(`"${target}" isn't a valid target for direction "${direction}".`);
}

const entryDef = ENTRY_DEFS[entry ?? (direction === "Up" ? "TC" : "BC")];
if (!entryDef) {
  throw new Error(`"${entry}" isn't a valid Entry (see createviewpatch.mjs's ENTRY_DEFS).`);
}

const effectiveAttachKey = attachKey && attachKey.trim() !== "" ? attachKey : patternKey;

const entryText = `entryLabel: "${entryDef.label}",\n    getEntry: (r) => r.todayCPR.${entryDef.key},\n    stoplossLabel: "${
  direction === "Up" ? "S1 (today's S1)" : "R1 (today's R1)"
}",\n    getStoploss: (r) => r.todayCPR.${direction === "Up" ? "s1" : "r1"},`;

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

const topCat = resolveTopLevelCategoryKey(allViewObjs, effectiveAttachKey);
if (!topCat) {
  throw new Error(
    `Couldn't resolve a top-level category for attach point "${effectiveAttachKey}" — its parentKey chain doesn't reach a kind:"category" node.`
  );
}

let arrName;
if (isModular) {
  const targetInfo = CATEGORY_FILE_MAP[topCat] || DEFAULT_TARGET;
  arrName = targetInfo.arr;
  const targetPath = resolve(viewsDir, targetInfo.file);
  targetFile = project.getSourceFileOrThrow(targetPath);
  targetArrayDecl = targetFile.getVariableDeclarationOrThrow(targetInfo.arr);
  targetArray = targetArrayDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
} else {
  arrName = CATEGORY_FILE_MAP[topCat]?.arr || "COPY_VIEWS";
  targetFile = project.getSourceFiles()[0];
  targetArrayDecl = targetFile.getVariableDeclarationOrThrow(arrName);
  targetArray = targetArrayDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
}

targetArray.addElement(newViewLiteral);
targetFile.saveSync();

const viewsSidebarFilePath = resolve(process.cwd(), "../../../", viewsSidebarFilePathEnv);
const viewsSidebarText = readFileSync(viewsSidebarFilePath, "utf-8");

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
  `Created "${newKey}" (direction ${direction}, entry ${entry}, target ${target}, grades against "${patternKey}"${
    gapBadge ? ` AND Gap Badge "${gapBadge}"` : ""
  }) under "${attachKey}" in ${arrName} with ${levelCheckDefs.length} symbol-derived levelCheckDefs`
);
console.log(`Added "${newKey}" to ${viewsSidebarFilePathEnv}'s Views["${screenerCategoryKey}"]`);
