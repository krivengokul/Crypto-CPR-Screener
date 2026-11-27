import { useEffect, useState } from "react";

/**
 * Small current date/time stamp shown above the global settings (top-right),
 * framed with a thin top line like the BuildFooter strip. Ticks every second; never blocks clicks.
 */
export function CurrentTimeStamp() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const date = now.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      className="pointer-events-none select-none flex items-center gap-1.5 rounded-sm px-2 py-1 font-mono text-[10px] leading-none"
      style={{
        color: "#6b8299",
        borderTop: "1px solid #1e2d3d",
        background: "rgba(13, 20, 34, 0.6)",
      }}
      aria-label="Current date and time"
    >
      <span style={{ color: "#3fb950" }}>●</span>
      <span style={{ color: "#8ba3bc" }}>{date}</span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span className="tabular-nums">{time}</span>
    </div>
  );
}
