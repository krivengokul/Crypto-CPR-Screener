import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Project,
  SyntaxKind,
} from "ts-morph";

/**
 * Same clone logic as backtestGitPatch.ts's applyCopyViewPatch, inlined
 * here as plain JS run directly by the Action. Because this runs inside
 * a checked-out copy of the repo (actions/checkout already did that),
 * there's no GitHub Contents API round trip needed at all — just read
 * the file, patch the text, write it back, and let a normal `git commit`
 * + `git push` (in the workflow's next step) record it. No token,
 * base64, or sha-conflict handling required; git itself handles the
 * write.
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

function applyCopyViewPatch(sourceText, sourceKey, newKey, newLabel, levelCheckDefs) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("backtest.ts", sourceText);

  // --- 1. Locate & clone the BACKTEST_TARGETS entry -----------------------
  const targetsDecl = sourceFile.getVariableDeclarationOrThrow("BACKTEST_TARGETS");
  const targetsArray = targetsDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);

  const elements = targetsArray.getElements();
  const sourceIndex = elements.findIndex(
    (el) => el.isKind(SyntaxKind.ObjectLiteralExpression) && getStringPropertyValue(el, "key") === sourceKey
  );
  if (sourceIndex === -1) {
    throw new Error(`No BACKTEST_TARGETS entry with key "${sourceKey}" found in backtest.ts.`);
  }
  const sourceObj = elements[sourceIndex];

  if (elements.some((el) => el.isKind(SyntaxKind.ObjectLiteralExpression) && getStringPropertyValue(el, "key") === newKey)) {
    throw new Error(`"${newKey}" already exists in BACKTEST_TARGETS — pick a different key.`);
  }

  const originalConditionKey = getStringPropertyValue(sourceObj, "conditionKey") ?? sourceKey;

  let clonedText = sourceObj.getText();
  clonedText = clonedText.replace(/key:\s*"(?:[^"\\]|\\.)*"/, `key: "${escapeForDoubleQuotedString(newKey)}"`);
  clonedText = clonedText.replace(/label:\s*"(?:[^"\\]|\\.)*"/, `label: "${escapeForDoubleQuotedString(newLabel)}"`);

  if (/conditionKey:\s*"/.test(clonedText)) {
    clonedText = clonedText.replace(
      /conditionKey:\s*"(?:[^"\\]|\\.)*"/,
      `conditionKey: "${escapeForDoubleQuotedString(originalConditionKey)}"`
    );
  } else {
    clonedText = clonedText.replace(
      /(key:\s*"(?:[^"\\]|\\.)*",?)/,
      `$1\n    conditionKey: "${escapeForDoubleQuotedString(originalConditionKey)}", // Copy View — grades against the original`
    );
  }

  const insertedElement = targetsArray.insertElement(sourceIndex + 1, clonedText);

  // --- 1b. Override levelCheckDefs with the symbol-specific derived set ---
  // (only when the browser actually sent one — a View with no
  // levelCheckDefs at all gets no override, staying without one too).
  //
  // Done via ts-morph's node API (replaceWithText / addPropertyAssignment)
  // on the ALREADY-INSERTED clone, not regex over its text — the clone's
  // levelCheckDefs is itself an array of objects (nested brackets), which
  // is exactly the kind of structure naive brace-matching gets wrong. The
  // clone was just inserted as text and re-parsed by ts-morph, so it's now
  // a real AST node we can query precisely.
  if (levelCheckDefs !== null) {
    const insertedObj = insertedElement.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const newValueText = JSON.stringify(levelCheckDefs);
    const levelCheckDefsProp = insertedObj.getProperty("levelCheckDefs");

    if (levelCheckDefsProp && levelCheckDefsProp.isKind(SyntaxKind.PropertyAssignment)) {
      const initializer = levelCheckDefsProp.getInitializer();
      if (initializer) {
        initializer.replaceWithText(newValueText);
      }
    } else {
      // Source object had no levelCheckDefs property at all — add one.
      insertedObj.addPropertyAssignment({ name: "levelCheckDefs", initializer: newValueText });
    }
  }

  // --- 2. Insert newKey into BACKTEST_CATEGORIES' matching subPatternKeys --
  const categoriesDecl = sourceFile.getVariableDeclarationOrThrow("BACKTEST_CATEGORIES");
  const categoriesArray = categoriesDecl.getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);

  const subPatternArrays = categoriesArray
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .filter((p) => p.getName() === "subPatternKeys")
    .map((p) => p.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression))
    .filter((a) => !!a);

  const siblingArray = subPatternArrays.find((arr) =>
    arr.getElements().some((el) => el.isKind(SyntaxKind.StringLiteral) && el.getLiteralText() === sourceKey)
  );

  if (siblingArray) {
    const siblingIndex = siblingArray
      .getElements()
      .findIndex((el) => el.isKind(SyntaxKind.StringLiteral) && el.getLiteralText() === sourceKey);
    siblingArray.insertElement(siblingIndex + 1, `"${escapeForDoubleQuotedString(newKey)}"`);
  } else {
    // sourceKey wasn't found as a CONTAINED element of any subPatternKeys
    // array — check whether it's instead a Pattern/Subpattern node's OWN
    // key (that node's activePatternTarget resolves directly, since it
    // has a BACKTEST_TARGETS entry matching its own identity, not via a
    // parent's list). A clone of "itself" was never a contained element
    // anywhere, so it belongs among ITS OWN children instead.
    const ownNode = categoriesArray
      .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
      .find((el) => getStringPropertyValue(el, "key") === sourceKey);

    if (!ownNode) {
      throw new Error(
        `Found "${sourceKey}" in BACKTEST_TARGETS but it isn't nested under any subPatternKeys in BACKTEST_CATEGORIES, ` +
          `and no Pattern/Subpattern node has that key either — can't place the copy in the dropdown tree.`
      );
    }

    const ownSubPatternKeysProp = ownNode.getProperty("subPatternKeys");
    if (ownSubPatternKeysProp && ownSubPatternKeysProp.isKind(SyntaxKind.PropertyAssignment)) {
      const arr = ownSubPatternKeysProp.getInitializer();
      if (arr && arr.isKind(SyntaxKind.ArrayLiteralExpression)) {
        arr.addElement(`"${escapeForDoubleQuotedString(newKey)}"`);
      } else {
        throw new Error(`"${sourceKey}"'s subPatternKeys isn't an array literal — can't insert into it.`);
      }
    } else {
      ownNode.addPropertyAssignment({
        name: "subPatternKeys",
        initializer: `["${escapeForDoubleQuotedString(newKey)}"]`,
      });
    }
  }

  return { patchedText: sourceFile.getFullText(), originalConditionKey };
}

// --- Entry point ------------------------------------------------------
const sourceKey = process.env.SOURCE_KEY;
const newKey = process.env.NEW_KEY;
const newLabel = process.env.NEW_LABEL;
const levelCheckDefsB64 = process.env.LEVEL_CHECK_DEFS_B64;
const backtestFilePath = process.env.BACKTEST_FILE_PATH ?? "artifacts/cpr-screener/src/lib/backtest.ts";

if (!sourceKey || !newKey || !newLabel) {
  console.error("SOURCE_KEY, NEW_KEY, and NEW_LABEL must all be set.");
  process.exit(1);
}

// null means "no override" (View has no levelCheckDefs, or the person's
// browser genuinely sent nothing) — distinct from "[]", a real empty array,
// which would be a legitimate (if unusual) override.
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

// Resolve relative to the repo root (this script runs from
// .github/scripts/copy-view, three levels below root).
const filePath = resolve(process.cwd(), "../../../", backtestFilePath);

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
    levelCheckDefs
  );
  writeFileSync(filePath, patchedText, "utf-8");
  const levelCheckNote = levelCheckDefs ? ` with ${levelCheckDefs.length} symbol-derived levelCheckDefs` : "";
  console.log(
    `Patched ${backtestFilePath}: "${sourceKey}" -> "${newKey}" (grades against "${originalConditionKey}")${levelCheckNote}`
  );
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
