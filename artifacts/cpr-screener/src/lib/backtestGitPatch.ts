import {
  Project,
  SyntaxKind,
  type ArrayLiteralExpression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
} from "ts-morph";

/**
 * Text-level equivalent of lib/backtest.ts's in-memory copyBacktestView.
 * That function clones a BACKTEST_TARGETS entry and pushes into live JS
 * arrays — good enough to preview a copy for the rest of a session, but it
 * never touches backtest.ts on disk (see the "will this survive a
 * refresh?" conversation this replaces). This module does the same clone
 * at the SOURCE TEXT level, so the result can be committed straight to
 * backtest.ts and survive a redeploy.
 *
 * Uses ts-morph (a real TS AST) rather than regex/brace-counting over the
 * file text directly — this file is dense with inline comments containing
 * stray braces/parens, which makes naive "find the closing brace" logic
 * fragile. Parsing it properly sidesteps that entirely.
 */

function escapeForDoubleQuotedString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getStringPropertyValue(obj: ObjectLiteralExpression, name: string): string | undefined {
  const prop = obj.getProperty(name);
  if (!prop || !prop.isKind(SyntaxKind.PropertyAssignment)) return undefined;
  const initializer = (prop as PropertyAssignment).getInitializer();
  if (!initializer || !initializer.isKind(SyntaxKind.StringLiteral)) return undefined;
  return initializer.getLiteralText();
}

export interface CopyViewPatchResult {
  patchedText: string;
  /** The real condition string passesPattern will grade the clone against — useful for the commit message / logging. */
  originalConditionKey: string;
}

/**
 * Clones the BACKTEST_TARGETS entry keyed `sourceKey` under `newKey` /
 * `newLabel`, setting `conditionKey` so grading still resolves to the
 * ORIGINAL condition (see BacktestTargetDef.conditionKey's doc comment in
 * backtest.ts), and adds `newKey` into whichever BACKTEST_CATEGORIES
 * `subPatternKeys` array currently contains `sourceKey`, right next to it.
 * Throws with a descriptive message on any lookup failure — the API route
 * calling this should surface that message as-is rather than a generic
 * 500, since it's almost always "no such key" or "not nested anywhere",
 * both of which are meaningful to whoever's clicking "Create copy".
 */
export function applyCopyViewPatch(
  sourceText: string,
  sourceKey: string,
  newKey: string,
  newLabel: string
): CopyViewPatchResult {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("backtest.ts", sourceText);

  // --- 1. Locate & clone the BACKTEST_TARGETS entry -----------------------
  const targetsDecl = sourceFile.getVariableDeclarationOrThrow("BACKTEST_TARGETS");
  const targetsArray = targetsDecl.getInitializerIfKindOrThrow(
    SyntaxKind.ArrayLiteralExpression
  ) as ArrayLiteralExpression;

  const elements = targetsArray.getElements();
  const sourceIndex = elements.findIndex(
    (el) =>
      el.isKind(SyntaxKind.ObjectLiteralExpression) &&
      getStringPropertyValue(el as ObjectLiteralExpression, "key") === sourceKey
  );
  if (sourceIndex === -1) {
    throw new Error(`No BACKTEST_TARGETS entry with key "${sourceKey}" found in backtest.ts.`);
  }
  const sourceObj = elements[sourceIndex] as ObjectLiteralExpression;

  if (elements.some((el) => el.isKind(SyntaxKind.ObjectLiteralExpression) && getStringPropertyValue(el as ObjectLiteralExpression, "key") === newKey)) {
    throw new Error(`"${newKey}" already exists in BACKTEST_TARGETS — pick a different key.`);
  }

  // Chain through the source's own conditionKey (if it's itself a copy) so
  // grading always resolves to the true original passesPattern case, never
  // an intermediate clone's key.
  const originalConditionKey = getStringPropertyValue(sourceObj, "conditionKey") ?? sourceKey;

  // Clone the source object's own TEXT rather than rebuilding it property
  // by property — every getTarget/getEntry/getStoploss/levelCheckDefs/
  // direction/targetLabel/comment carries over verbatim, and only the
  // three identity fields get swapped.
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

  targetsArray.insertElement(sourceIndex + 1, clonedText);

  // --- 2. Insert newKey into BACKTEST_CATEGORIES' matching subPatternKeys --
  const categoriesDecl = sourceFile.getVariableDeclarationOrThrow("BACKTEST_CATEGORIES");
  const categoriesArray = categoriesDecl.getInitializerIfKindOrThrow(
    SyntaxKind.ArrayLiteralExpression
  ) as ArrayLiteralExpression;

  const subPatternArrays = categoriesArray
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .filter((p) => p.getName() === "subPatternKeys")
    .map((p) => p.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression))
    .filter((a): a is ArrayLiteralExpression => !!a);

  const siblingArray = subPatternArrays.find((arr) =>
    arr.getElements().some((el) => el.isKind(SyntaxKind.StringLiteral) && el.getLiteralText() === sourceKey)
  );
  if (!siblingArray) {
    throw new Error(
      `Found "${sourceKey}" in BACKTEST_TARGETS but it isn't nested under any subPatternKeys in BACKTEST_CATEGORIES — can't place the copy in the dropdown tree.`
    );
  }
  const siblingIndex = siblingArray
    .getElements()
    .findIndex((el) => el.isKind(SyntaxKind.StringLiteral) && el.getLiteralText() === sourceKey);
  siblingArray.insertElement(siblingIndex + 1, `"${escapeForDoubleQuotedString(newKey)}"`);

  return { patchedText: sourceFile.getFullText(), originalConditionKey };
}
