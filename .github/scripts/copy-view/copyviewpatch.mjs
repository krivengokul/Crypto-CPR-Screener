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

function getInitializerText(obj, name) {
  const prop = getObjectProperty(obj, name);
  if (!prop) return undefined;
  return prop.getInitializer()?.getText();
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
 * them and used to give up (returning null → the nav chip fell into the
 * "CREATED VIEWS" bucket). makeCompoundView reads the parent off
 * SSRR_INFO keyed on the first letter, so mirror that here.
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

  const effectiveAttachKey =
    attachKey && attachKey.trim() !== ""
      ? attachKey
      : getStringPropertyValue(sourceObj, "parentKey") ?? sourceKey;
  const originalConditionKey = getStringPropertyValue(sourceObj, "conditionKey") ?? sourceKey;

  // Clone properties from sourceObj. ViewDef.direction is "Up" | "Down"
  // — the old "bullish" fallback here wasn't assignable to it.
  const rawDirection = getStringPropertyValue(sourceObj, "direction") ?? "Up";
  const direction = rawDirection === "Down" || rawDirection === "bearish" ? "Down" : "Up";
  const isUp = direction === "Up";
  const targetLabel = getStringPropertyValue(sourceObj, "targetLabel") ?? "U4 (today's R4)";
  const entryLabel = getStringPropertyValue(sourceObj, "entryLabel") ?? (isUp ? "TC (today's TC)" : "BC (today's BC)");
  const stoplossLabel =
    getStringPropertyValue(sourceObj, "stoplossLabel") ?? (isUp ? "S1 (today's S1)" : "R1 (today's R1)");

  const getTargetText = getInitializerText(sourceObj, "getTarget") ?? "(r) => r.todayCPR.r4";
  const getEntryText = getInitializerText(sourceObj, "getEntry") ?? (isUp ? "(r) => r.todayCPR.tc" : "(r) => r.todayCPR.bc");
  const getStoplossText =
    getInitializerText(sourceObj, "getStoploss") ?? (isUp ? "(r) => r.todayCPR.s1" : "(r) => r.todayCPR.r1");

  // Level check defs: override if provided, else copy from source if present
  let levelCheckDefsJson = "undefined";
  if (levelCheckDefs !== null) {
    levelCheckDefsJson = JSON.stringify(levelCheckDefs, null, 2);
  } else {
    levelCheckDefsJson = getInitializerText(sourceObj, "levelCheckDefs") ?? "undefined";
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

  // File the copy in the array that belongs to the attach point's own
  // top-level Category, same as create-view's createviewpatch.mjs.
  // COPY_VIEWS is only the fallback now — it used to be the
  // unconditional first choice, which is why every copy ended up in the
  // flat "CREATED VIEWS" bucket no matter what was picked in the attach
  // dropdown.
  const topCat = resolveTopLevelCategoryKey(sourceText, effectiveAttachKey);
  const arrName = (topCat && CATEGORY_ARRAY_MAP[topCat]) || "COPY_VIEWS";

  const targetArrayDecl =
    sourceFile.getVariableDeclaration(arrName) ?? sourceFile.getVariableDeclarationOrThrow("COPY_VIEWS");

  const targetArray = targetArrayDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  targetArray.addElement(newViewLiteral);

  return { patchedText: sourceFile.getFullText(), originalConditionKey, topCat, arrName };
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
  const { patchedText, originalConditionKey, topCat, arrName } = applyCopyViewPatch(
    currentText,
    sourceKey,
    newKey,
    newLabel,
    levelCheckDefs,
    attachKey
  );
  writeFileSync(filePath, patchedText, "utf-8");

  const viewsSidebarFilePath = resolve(process.cwd(), "../../../", viewsSidebarFilePathEnv);
  const viewsSidebarText = readFileSync(viewsSidebarFilePath, "utf-8");

  // Only sections that exist in pivotcategories actually render; anything
  // else would be an invisible bucket, so those fall back to copyViews.
  const navIds = getScreenerNavCategoryIds(viewsSidebarText);
  const screenerCategoryKey = topCat && navIds.includes(topCat) ? topCat : "copyViews";
  if (screenerCategoryKey !== topCat) {
    console.warn(
      `"${topCat ?? attachKey}" has no entry in ViewsSidebar.tsx's pivotcategories — putting the nav chip in "copyViews" instead.`
    );
  }

  const patchedViewsSidebarText = addToScreenerNav(viewsSidebarText, screenerCategoryKey, newKey, newLabel);
  writeFileSync(viewsSidebarFilePath, patchedViewsSidebarText, "utf-8");

  const levelCheckNote = levelCheckDefs ? ` with ${levelCheckDefs.length} symbol-derived levelCheckDefs` : "";
  console.log(
    `Patched ${viewsFilePath}: "${sourceKey}" -> "${newKey}" under "${attachKey}" in ${arrName} (grades against "${originalConditionKey}")${levelCheckNote}`
  );
  console.log(`Added "${newKey}" to ${viewsSidebarFilePathEnv}'s Views["${screenerCategoryKey}"]`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
