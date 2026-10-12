/**
 * Shows which git commit the current Pages build came from.
 * Values are injected at build time via VITE_* env (see deploy.yml).
 */
export function BuildFooter() {
  const full = (import.meta.env.VITE_GIT_SHA ?? "").trim();
  const short =
    (import.meta.env.VITE_GIT_SHORT ?? full).trim().slice(0, 7) || "dev";
  const builtAt = (import.meta.env.VITE_BUILD_TIME ?? "").trim();
  const runId = (import.meta.env.VITE_GITHUB_RUN_ID ?? "").trim();

  let builtLabel = "";
  if (builtAt) {
    const d = new Date(builtAt);
    builtLabel = Number.isNaN(d.getTime())
      ? builtAt
      : d.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
  }

  const commitUrl = full
    ? `https://github.com/krivengokul/Crypto-CPR-Screener/commit/${full}`
    : null;
  const runUrl = runId
    ? `https://github.com/krivengokul/Crypto-CPR-Screener/actions/runs/${runId}`
    : null;

  return (
    <footer
      className="pointer-events-none fixed bottom-2 right-2 z-40 select-none"
      aria-label="Build version"
    >
      <div
        className="pointer-events-auto flex items-center gap-2 rounded-md border px-2 py-1 text-[10px] font-mono leading-none"
        style={{
          background: "rgba(13, 20, 34, 0.85)",
          borderColor: "#1e2d3d",
          color: "#6b8299",
          backdropFilter: "blur(6px)",
        }}
        title={
          full
            ? `Commit ${full}${builtLabel ? ` · built ${builtLabel}` : ""}`
            : "Local / unknown build"
        }
      >
        <span style={{ color: "#3fb950" }}>●</span>
        {commitUrl ? (
          <a
            href={commitUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
            style={{ color: "#8ba3bc" }}
          >
            {short}
          </a>
        ) : (
          <span style={{ color: "#8ba3bc" }}>{short}</span>
        )}
        {builtLabel && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{builtLabel}</span>
          </>
        )}
        {runUrl && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <a
              href={runUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
              style={{ color: "#6b8299" }}
            >
              run
            </a>
          </>
        )}
      </div>
    </footer>
  );
}
