import type { NextApiRequest, NextApiResponse } from "next";
import { applyCopyViewPatch } from "@/lib/backtestGitPatch";

/**
 * Persists a Copy View (see lib/backtest.ts's in-memory copyBacktestView,
 * and CopyViewControl in BacktestPanel.tsx) by patching backtest.ts's
 * actual source text and pushing straight to `main` via the GitHub
 * Contents API — no local git, no filesystem checkout (doesn't fit Cloud
 * Run's stateless/cold-start model), and no PR: a Copy View is a pure
 * duplicate of an already-reviewed View (nothing generated to sanity-check,
 * unlike "Create View"'s derived levelCheckDefs), so direct-push keeps the
 * ceremony proportional to the risk. "Create View" should still go through
 * a PR when it's built — see the branch+PR flow discussed for that.
 */

const GITHUB_API = "https://api.github.com";
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // fine-grained PAT / GitHub App token, contents:write only — never sent to the client
const BACKTEST_FILE_PATH = process.env.BACKTEST_FILE_PATH ?? "src/lib/backtest.ts"; // adjust to this repo's actual path
const BRANCH = process.env.GITHUB_BRANCH ?? "main";

interface CopyViewRequestBody {
  sourceKey: string;
  newKey: string;
  newLabel: string;
}

interface GithubContentGetResponse {
  content: string; // base64
  sha: string;
}

interface GithubContentPutResponse {
  commit?: { sha?: string; html_url?: string };
}

async function githubFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`GitHub ${init.method ?? "GET"} ${path} -> ${res.status} ${res.statusText}: ${body}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
    return res.status(500).json({ error: "GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN are not configured on the server." });
  }

  const { sourceKey, newKey, newLabel } = (req.body ?? {}) as Partial<CopyViewRequestBody>;
  if (!sourceKey || !newKey || !newLabel) {
    return res.status(400).json({ error: "sourceKey, newKey, and newLabel are all required." });
  }

  const filePath = encodeURIComponent(BACKTEST_FILE_PATH);

  // One retry on a sha race: if backtest.ts changed between our GET and
  // PUT (someone else's commit, or a concurrent Copy View), GitHub rejects
  // the PUT — re-fetch the latest content and re-apply the patch once
  // rather than failing outright on an ordinary race.
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fileData = await githubFetch<GithubContentGetResponse>(
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${BRANCH}`
      );
      const currentText = Buffer.from(fileData.content, "base64").toString("utf-8");

      const { patchedText, originalConditionKey } = applyCopyViewPatch(currentText, sourceKey, newKey, newLabel);

      const putResult = await githubFetch<GithubContentPutResponse>(
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
        {
          method: "PUT",
          body: JSON.stringify({
            message: `Copy View: "${sourceKey}" -> "${newKey}"`,
            content: Buffer.from(patchedText, "utf-8").toString("base64"),
            sha: fileData.sha,
            branch: BRANCH,
          }),
        }
      );

      return res.status(200).json({
        ok: true,
        commitUrl: putResult.commit?.html_url ?? null,
        conditionKey: originalConditionKey,
      });
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number } | undefined)?.status;
      const isShaConflict = status === 409 || status === 422;
      if (isShaConflict && attempt === 0) continue; // one retry against the latest content
      break;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  // Patch-logic errors (bad key, not found in the dropdown tree, duplicate
  // key) are meaningful to whoever clicked "Create copy" — surface them as
  // 400s. Anything else (GitHub auth/network) is a genuine server error.
  const isPatchError = /BACKTEST_TARGETS|subPatternKeys|already exists/.test(message);
  return res.status(isPatchError ? 400 : 500).json({ error: message });
}
