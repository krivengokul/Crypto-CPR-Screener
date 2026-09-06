import type { HttpFunction } from "@google-cloud/functions-framework";
import { applyCopyViewPatch } from "./backtestGitPatch";

/**
 * Standalone Google Cloud Function (2nd gen, HTTP trigger) version of the
 * "Create copy" persist endpoint. Originally written as a Next.js
 * pages/api route, but the site itself is served from GitHub Pages
 * (static hosting only — no server, no env vars, no way to run this
 * there). This function stands alone instead: same patch logic
 * (applyCopyViewPatch / ts-morph AST edit of backtest.ts), same GitHub
 * Contents API GET -> patch -> PUT -> commit flow, called cross-origin
 * from the static site via CORS rather than a same-origin relative path.
 *
 * Deploy with (adjust project/region as needed):
 *   gcloud functions deploy copy-view \
 *     --gen2 \
 *     --runtime=nodejs20 \
 *     --region=us-central1 \
 *     --source=. \
 *     --entry-point=copyView \
 *     --trigger-http \
 *     --allow-unauthenticated \
 *     --set-env-vars=GITHUB_OWNER=krivengokul,GITHUB_REPO=Crypto-CPR-Screener,ALLOWED_ORIGIN=https://krivengokul.github.io \
 *     --set-secrets=GITHUB_TOKEN=copy-view-github-token:latest
 *
 * GITHUB_TOKEN is pulled from Secret Manager (--set-secrets), not a plain
 * env var — it's a repo-write credential, so it shouldn't sit in
 * `gcloud functions describe` output or Cloud Console env var lists in
 * plaintext. Create it once with:
 *   printf '%s' 'ghp_xxx...' | gcloud secrets create copy-view-github-token --data-file=-
 * and grant the function's runtime service account `Secret Manager Secret
 * Accessor` on it.
 */

const GITHUB_API = "https://api.github.com";
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
// Repo layout is artifacts/cpr-screener/src/... (not a repo-root app).
const BACKTEST_FILE_PATH =
  process.env.BACKTEST_FILE_PATH ?? "artifacts/cpr-screener/src/lib/backtest.ts";
const BRANCH = process.env.GITHUB_BRANCH ?? "main";
// Lock CORS down to the actual GitHub Pages origin, not "*" — this
// endpoint accepts a repo-write action, so anyone else's page shouldn't
// be able to trigger it against your token from a visitor's browser.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "https://krivengokul.github.io";

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

export const copyView: HttpFunction = async (req, res) => {
  // CORS: GitHub Pages is a different origin from this function's URL, so
  // the browser preflights with OPTIONS before the real POST.
  res.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.set("Allow", "POST, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
    res.status(500).json({ error: "GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN are not configured on the server." });
    return;
  }

  const { sourceKey, newKey, newLabel } = (req.body ?? {}) as Partial<CopyViewRequestBody>;
  if (!sourceKey || !newKey || !newLabel) {
    res.status(400).json({ error: "sourceKey, newKey, and newLabel are all required." });
    return;
  }

  const filePath = encodeURIComponent(BACKTEST_FILE_PATH);

  // One retry on a sha race: if backtest.ts changed between our GET and
  // PUT, GitHub rejects the PUT — re-fetch and re-apply once rather than
  // failing outright on an ordinary race.
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

      res.status(200).json({
        ok: true,
        commitUrl: putResult.commit?.html_url ?? null,
        conditionKey: originalConditionKey,
      });
      return;
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number } | undefined)?.status;
      const isShaConflict = status === 409 || status === 422;
      if (isShaConflict && attempt === 0) continue;
      break;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  const isPatchError = /BACKTEST_TARGETS|subPatternKeys|already exists/.test(message);
  res.status(isPatchError ? 400 : 500).json({ error: message });
};
