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

function getInitializerText(obj, name) {
  const prop = getObjectProperty(obj, name);
  if (!prop) return undefined;
  return prop.getInitializer()?.getText();
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

function updateScreenerNav(sourceText, categoryKey, sourceKey, newKey, newLabel, isEdit) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("ViewsSidebar.tsx", sourceText);

  const viewsDecl = sourceFile.getVariableDeclarationOrThrow("Views");
  const viewsObj = viewsDecl.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);

  if (isEdit) {
    for (const prop of viewsObj.getProperties()) {
      if (!prop.isKind(SyntaxKind.PropertyAssignment)) continue;
      const arr = prop.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
      if (!arr) continue;
      const elements = arr.getElements();
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (el.isKind(SyntaxKind.ObjectLiteralExpression) && getStringPropertyValue(el, "id") === sourceKey) {
          const propName = prop.getName().replace(/^["']|["']$/g, "");
          if (propName === categoryKey) {
            el.replaceWithText(
              `{ id: "${escapeForDoubleQuotedString(newKey)}", label: "${escapeForDoubleQuotedString(newLabel)}" }`
            );
            return sourceFile.getFullText();
          } else {
            arr.removeElement(i);
            break;
          }
        }
      }
    }
  }

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
  R1: { label: "U1 (today's R1)", prop: "r1" },
  R2: { label: "U2 (today's R2)", prop: "r2" },
  R3: { label: "U3 (today's R3)", prop: "r3" },
  R4: { label: "U4 (today's R4)", prop: "r4" },
};
const BEARISH_TARGETS = {
  S1: { label: "L1 (today's S1)", prop: "s1" },
  S2: { label: "L2 (today's S2)", prop: "s2" },
  S3: { label: "L3 (today's S3)", prop: "s3" },
  S4: { label: "L4 (today's S4)", prop: "s4" },
};
const ENTRY_MAP = {
  R4: { label: "R4 (today's R4)", prop: "r4" },
  R3: { label: "R3 (today's R3)", prop: "r3" },
  R2: { label: "R2 (today's R2)", prop: "r2" },
  R1: { label: "R1 (today's R1)", prop: "r1" },
  TC: { label: "TC (today's TC)", prop: "tc" },
  Pivot: { label: "Pivot (today's Pivot)", prop: "pivot" },
  BC: { label: "BC (today's BC)", prop: "bc" },
  S1: { label: "S1 (today's S1)", prop: "s1" },
  S2: { label: "S2 (today's S2)", prop: "s2" },
  S3: { label: "S3 (today's S3)", prop: "s3" },
  S4: { label: "S4 (today's S4)", prop: "s4" },
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

// --- Entry point ------------------------------------------------------
const isEdit = process.env.IS_EDIT === "true";
const sourceKey = process.env.SOURCE_KEY;
const newKey = process.env.NEW_KEY ?? sourceKey;
const newLabel = process.env.NEW_LABEL;
const levelCheckDefsB64 = process.env.LEVEL_CHECK_DEFS_B64;
const attachKey = process.env.ATTACH_KEY && process.env.ATTACH_KEY.trim() !== "" ? process.env.ATTACH_KEY : sourceKey;
const viewsFilePath = process.env.VIEWS_FILE_PATH ?? process.env.BACKTEST_FILE_PATH ?? "artifacts/cpr-screener/src/lib/views.ts";
const viewsSidebarFilePathEnv = process.env.VIEWS_SIDEBAR_FILE_PATH ?? "artifacts/cpr-screener/src/lib/ViewsSidebar.tsx";

const overrides = {
  direction: process.env.DIRECTION,
  entry: process.env.ENTRY,
  target: process.env.TARGET,
  gapBadge: process.env.GAP_BADGE,
};

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

const baseFilePath = resolve(process.cwd(), "../../../", viewsFilePath);
const viewsDir = existsSync(baseFilePath) && statSync(baseFilePath).isDirectory()
  ? baseFilePath
  : resolve(dirname(baseFilePath), "views");
const isModular = existsSync(resolve(viewsDir, "categories"));

const project = new Project();
let targetFile, targetArrayDecl, targetArray, allViewObjs, sourceObj, sourceFile;

if (isModular) {
  project.addSourceFilesAtPaths(`${viewsDir}/categories/*.ts`);
  allViewObjs = project.getSourceFiles().flatMap((sf) =>
    sf
      .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
      .filter((obj) => getStringPropertyValue(obj, "key") !== undefined)
  );

  for (const sf of project.getSourceFiles()) {
    const objs = sf
      .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
      .filter((el) => getStringPropertyValue(el, "key") === sourceKey);
    if (objs.length > 0) {
      sourceObj = objs[0];
      sourceFile = sf;
      break;
    }
  }
} else {
  sourceFile = project.addSourceFileAtPath(baseFilePath);
  allViewObjs = sourceFile
    .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
    .filter((obj) => getStringPropertyValue(obj, "key") !== undefined);
  sourceObj = allViewObjs.find((el) => getStringPropertyValue(el, "key") === sourceKey);
}

if (!sourceObj) {
  throw new Error(`No ViewDef entry with key "${sourceKey}" found.`);
}

if (isEdit) {
  if (newKey !== sourceKey && allViewObjs.some((el) => el !== sourceObj && getStringPropertyValue(el, "key") === newKey)) {
    throw new Error(`"${newKey}" already exists — pick a different key.`);
  }
} else {
  if (allViewObjs.some((el) => getStringPropertyValue(el, "key") === newKey)) {
    throw new Error(`"${newKey}" already exists — pick a different key.`);
  }
}

const effectiveAttachKey =
  attachKey && attachKey.trim() !== ""
    ? attachKey
    : getStringPropertyValue(sourceObj, "parentKey") ?? sourceKey;

let originalConditionKey = getStringPropertyValue(sourceObj, "conditionKey");
if (!originalConditionKey || originalConditionKey === sourceKey) {
  const condProp = getObjectProperty(sourceObj, "condition");
  if (condProp) {
    const condText = condProp.getInitializer()?.getText() ?? "";
    const match = condText.match(/passesView\(r,\s*[\"\']([^\"\']+)[\"\']\)/);
    if (match && match[1] && match[1] !== sourceKey) {
      originalConditionKey = match[1];
    }
  }
}
if (!originalConditionKey || originalConditionKey === sourceKey) {
  originalConditionKey = getStringPropertyValue(sourceObj, "parentKey") ?? effectiveAttachKey;
}

const rawDirection = overrides.direction ?? getStringPropertyValue(sourceObj, "direction") ?? "Up";
const direction = rawDirection === "Down" || rawDirection === "bearish" ? "Down" : "Up";
const isUp = direction === "Up";

let targetLabel, getTargetText;
if (overrides.target) {
  const tDef = (isUp ? BULLISH_TARGETS : BEARISH_TARGETS)[overrides.target];
  targetLabel = tDef ? tDef.label : (isUp ? "U4 (today's R4)" : "L4 (today's S4)");
  getTargetText = tDef ? `(r) => r.todayCPR.${tDef.prop}` : (isUp ? "(r) => r.todayCPR.r4" : "(r) => r.todayCPR.s4");
} else {
  targetLabel = getStringPropertyValue(sourceObj, "targetLabel") ?? (isUp ? "U4 (today's R4)" : "L4 (today's S4)");
  getTargetText = getInitializerText(sourceObj, "getTarget") ?? (isUp ? "(r) => r.todayCPR.r4" : "(r) => r.todayCPR.s4");
}

let entryLabel, getEntryText;
if (overrides.entry && ENTRY_MAP[overrides.entry]) {
  const eDef = ENTRY_MAP[overrides.entry];
  entryLabel = eDef.label;
  getEntryText = `(r) => r.todayCPR.${eDef.prop}`;
} else {
  entryLabel = getStringPropertyValue(sourceObj, "entryLabel") ?? (isUp ? "TC (today's TC)" : "BC (today's BC)");
  getEntryText = getInitializerText(sourceObj, "getEntry") ?? (isUp ? "(r) => r.todayCPR.tc" : "(r) => r.todayCPR.bc");
}

const stoplossLabel = isUp ? "S1 (today's S1)" : "R1 (today's R1)";
const getStoplossText = isUp ? "(r) => r.todayCPR.s1" : "(r) => r.todayCPR.r1";

let levelCheckDefsJson = "undefined";
if (levelCheckDefs !== null) {
  levelCheckDefsJson = JSON.stringify(levelCheckDefs, null, 2);
} else {
  levelCheckDefsJson = getInitializerText(sourceObj, "levelCheckDefs") ?? "undefined";
}

const gapBadge = overrides.gapBadge?.trim();
const conditionField = gapBadge
  ? `condition: (r) => passesView(r, "${escapeForDoubleQuotedString(originalConditionKey)}") && matchesGapBadge(r, "${escapeForDoubleQuotedString(gapBadge)}"),\n    standalone: true,`
  : `conditionKey: "${escapeForDoubleQuotedString(originalConditionKey)}",`;

const newViewLiteral = `{
    key: "${escapeForDoubleQuotedString(newKey)}",
    label: "${escapeForDoubleQuotedString(newLabel)}",
    parentKey: "${escapeForDoubleQuotedString(effectiveAttachKey)}",
    ${conditionField}
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

const topCat = resolveTopLevelCategoryKey(allViewObjs, effectiveAttachKey);
let arrName;

if (isModular) {
  const targetInfo = (topCat && CATEGORY_FILE_MAP[topCat]) || DEFAULT_TARGET;
  arrName = targetInfo.arr;
  const targetPath = resolve(viewsDir, targetInfo.file);
  targetFile = project.getSourceFileOrThrow(targetPath);
  targetArrayDecl = targetFile.getVariableDeclarationOrThrow(targetInfo.arr);
  targetArray = targetArrayDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
} else {
  arrName = (topCat && CATEGORY_FILE_MAP[topCat]?.arr) || "COPY_VIEWS";
  targetFile = sourceFile;
  targetArrayDecl = sourceFile.getVariableDeclaration(arrName) ?? sourceFile.getVariableDeclarationOrThrow("COPY_VIEWS");
  targetArray = targetArrayDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
}

if (isEdit) {
  const parentArr = sourceObj.getFirstAncestorByKind(SyntaxKind.ArrayLiteralExpression);
  if (parentArr && parentArr === targetArray) {
    sourceObj.replaceWithText(newViewLiteral);
  } else {
    if (!parentArr) {
      throw new Error(`Couldn't find the array literal containing "${sourceKey}".`);
    }
    parentArr.removeElement(sourceObj);
    targetArray.addElement(newViewLiteral);
  }
} else {
  targetArray.addElement(newViewLiteral);
}

targetFile.saveSync();
if (isEdit && sourceFile !== targetFile) {
  sourceFile.saveSync();
}

const viewsSidebarFilePath = resolve(process.cwd(), "../../../", viewsSidebarFilePathEnv);
const viewsSidebarText = readFileSync(viewsSidebarFilePath, "utf-8");

const navIds = getScreenerNavCategoryIds(viewsSidebarText);
const screenerCategoryKey = topCat && navIds.includes(topCat) ? topCat : "copyViews";
if (screenerCategoryKey !== topCat) {
  console.warn(
    `"${topCat ?? attachKey}" has no entry in ViewsSidebar.tsx's pivotcategories — putting the nav chip in "copyViews" instead.`
  );
}

const patchedViewsSidebarText = updateScreenerNav(viewsSidebarText, screenerCategoryKey, sourceKey, newKey, newLabel, isEdit);
writeFileSync(viewsSidebarFilePath, patchedViewsSidebarText, "utf-8");

const levelCheckNote = levelCheckDefs ? ` with ${levelCheckDefs.length} symbol-derived levelCheckDefs` : "";
console.log(
  `Patched: "${sourceKey}" -> "${newKey}" under "${attachKey}" in ${arrName} (grades against "${originalConditionKey}")${levelCheckNote}`
);
console.log(`Added "${newKey}" to ${viewsSidebarFilePathEnv}'s Views["${screenerCategoryKey}"]`);
