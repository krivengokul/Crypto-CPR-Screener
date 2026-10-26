import { useState, useEffect } from "react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export default function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateStr = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  let hours = now.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const h = pad(hours);
  const m = pad(now.getMinutes());
  const s = pad(now.getSeconds());

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 py-2 shrink-0">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {dateStr}
        </span>
        <span className="font-mono text-base font-bold tabular-nums text-primary">
          {h}:{m}
          <span className="text-accent">:{s}</span>{" "}
          <span className="text-xs font-semibold text-muted-foreground">{ampm}</span>
        </span>
      </div>
    </div>
  );
}
