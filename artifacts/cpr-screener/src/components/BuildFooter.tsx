/**
 * Shows which git commit the current Pages build came from.
 * Document-flow footer (not position:fixed) so it never covers page controls.
 * Center: product credit · Right: commit / build meta.
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
      className="w-full shrink-0 select-none"
      aria-label="Build version"
      style={{
        borderTop: "1px solid #1e2d3d",
        background: "rgba(13, 20, 34, 0.6)",
      }}
    >
      <div
        className="grid grid-cols-3 items-center gap-2 px-3 py-1.5 text-[10px] font-mono leading-none"
        style={{ color: "#6b8299" }}
      >
        <div />
        <div
          className="justify-self-center text-center font-sans text-[11px] tracking-wide"
          style={{ color: "#8ba3bc" }}
        >
          Binance Futures Screener — by Kriven Gokul
        </div>
        <div
          className="justify-self-end flex items-center gap-2"
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
      </div>
    </footer>
  );
}
