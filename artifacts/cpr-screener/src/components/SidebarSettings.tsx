import React, { useEffect, useRef, useState } from "react";
import { Settings, Volume2, VolumeX, Webhook, CalendarDays } from "lucide-react";
import {
  isAlertMuted,
  setAlertMuted,
  unlockAlertAudio,
  ALERT_MUTE_EVENT,
} from "@/lib/alertSound";
import {
  getAlertWebhookUrl,
  setAlertWebhookUrl,
  ALERT_WEBHOOK_CHANGED_EVENT,
} from "@/lib/alertWebhook";
import {
  isWeekend,
  readHideTradfiWeekend,
  writeHideTradfiWeekend,
} from "@/lib/weekendMarketFilter";

const BORDER = "rgba(30, 45, 61, 0.95)";
const DIM = "#4b6a8a";

function toggleAlertMuted() {
  unlockAlertAudio();
  setAlertMuted(!isAlertMuted());
}

/**
 * Compact settings control for the left nav: gear opens a panel with
 * Sound / Hook (Telegram webhook) / Week (TRADFI·COMMOD weekend filter).
 * Same behavior as the old always-visible header chips, without clutter.
 */
export function SidebarSettings({
  collapsed = false,
}: {
  /** Icon-only gear when the sidebar is collapsed. */
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [alertMuted, setAlertMutedState] = useState(() => isAlertMuted());
  const [webhookUrl, setWebhookUrlState] = useState(() => getAlertWebhookUrl());
  const [webhookDraft, setWebhookDraft] = useState(() => getAlertWebhookUrl());
  const [hookEditorOpen, setHookEditorOpen] = useState(false);
  const [hideTradfiWeekend, setHideTradfiWeekend] = useState(() => readHideTradfiWeekend());
  const weekendNow = isWeekend();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onMute = (e: Event) => {
      const muted = (e as CustomEvent<{ muted: boolean }>).detail?.muted;
      if (typeof muted === "boolean") setAlertMutedState(muted);
    };
    const onHook = () => {
      const url = getAlertWebhookUrl();
      setWebhookUrlState(url);
      setWebhookDraft(url);
    };
    window.addEventListener(ALERT_MUTE_EVENT, onMute);
    window.addEventListener(ALERT_WEBHOOK_CHANGED_EVENT, onHook);
    return () => {
      window.removeEventListener(ALERT_MUTE_EVENT, onMute);
      window.removeEventListener(ALERT_WEBHOOK_CHANGED_EVENT, onHook);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHookEditorOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setHookEditorOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const gearActive = open || alertMuted || !!webhookUrl || hideTradfiWeekend;

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Settings — Sound, Hook, Week"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center justify-center rounded-full border transition-colors shrink-0"
        style={{
          width: collapsed ? 32 : 30,
          height: collapsed ? 32 : 30,
          background: gearActive ? "rgba(148,163,184,0.12)" : "rgba(255,255,255,0.04)",
          borderColor: gearActive ? "rgba(148,163,184,0.35)" : BORDER,
          color: gearActive ? "#e2e8f0" : DIM,
          cursor: "pointer",
        }}
      >
        <Settings style={{ width: collapsed ? 15 : 14, height: collapsed ? 15 : 14 }} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="App settings"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 80,
            width: 220,
            borderRadius: 12,
            border: `1px solid ${BORDER}`,
            background: "#0c131f",
            boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
            padding: 10,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#64748b",
              marginBottom: 8,
            }}
          >
            Settings
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Sound */}
            <button
              type="button"
              onClick={toggleAlertMuted}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors w-full"
              style={{
                background: alertMuted ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.10)",
                borderColor: alertMuted ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.35)",
                color: alertMuted ? "#fca5a5" : "#86efac",
                cursor: "pointer",
              }}
              title={alertMuted ? "Alerts muted — click to enable sound" : "Alerts on — click to mute"}
              aria-pressed={alertMuted}
            >
              {alertMuted ? <VolumeX style={{ width: 13, height: 13 }} /> : <Volume2 style={{ width: 13, height: 13 }} />}
              <span style={{ flex: 1 }}>{alertMuted ? "Sound · muted" : "Sound · on"}</span>
            </button>

            {/* Hook */}
            <button
              type="button"
              onClick={() => {
                setWebhookDraft(getAlertWebhookUrl());
                setHookEditorOpen((v) => !v);
              }}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors w-full"
              style={{
                background: webhookUrl ? "rgba(56,189,248,0.12)" : "rgba(255,255,255,0.04)",
                borderColor: webhookUrl ? "rgba(56,189,248,0.4)" : BORDER,
                color: webhookUrl ? "#7dd3fc" : DIM,
                cursor: "pointer",
              }}
              title={webhookUrl ? "Cloudflare Worker configured — click to edit" : "Set Cloudflare Worker URL for Telegram alerts"}
            >
              <Webhook style={{ width: 13, height: 13 }} />
              <span style={{ flex: 1 }}>Hook{webhookUrl ? " · on" : " · off"}</span>
            </button>

            {hookEditorOpen && (
              <div
                style={{
                  padding: 8,
                  borderRadius: 8,
                  border: `1px solid ${BORDER}`,
                  background: "rgba(0,0,0,0.25)",
                }}
              >
                <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 6, lineHeight: 1.35 }}>
                  Cloudflare Worker URL. Entry-cross POSTs JSON here; the Worker forwards to Telegram (token stays in Cloudflare).
                </div>
                <input
                  type="url"
                  value={webhookDraft}
                  onChange={(e) => setWebhookDraft(e.target.value)}
                  placeholder="https://cpr-alert.your-name.workers.dev"
                  spellCheck={false}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    fontSize: 11,
                    fontFamily: "ui-monospace, monospace",
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: `1px solid ${BORDER}`,
                    background: "#0b1220",
                    color: "#e2e8f0",
                    marginBottom: 6,
                  }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setAlertWebhookUrl(webhookDraft);
                      setWebhookUrlState(webhookDraft.trim());
                      setHookEditorOpen(false);
                    }}
                    style={{
                      flex: 1,
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "5px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(56,189,248,0.45)",
                      background: "rgba(56,189,248,0.15)",
                      color: "#7dd3fc",
                      cursor: "pointer",
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAlertWebhookUrl("");
                      setWebhookDraft("");
                      setWebhookUrlState("");
                    }}
                    style={{
                      fontSize: 11,
                      padding: "5px 8px",
                      borderRadius: 6,
                      border: `1px solid ${BORDER}`,
                      background: "transparent",
                      color: "#94a3b8",
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Week */}
            <button
              type="button"
              onClick={() => {
                setHideTradfiWeekend((prev) => {
                  const next = !prev;
                  writeHideTradfiWeekend(next);
                  return next;
                });
              }}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors w-full"
              style={{
                background: hideTradfiWeekend
                  ? weekendNow
                    ? "rgba(245,158,11,0.18)"
                    : "rgba(245,158,11,0.10)"
                  : "rgba(255,255,255,0.04)",
                borderColor: hideTradfiWeekend ? "rgba(245,158,11,0.45)" : BORDER,
                color: hideTradfiWeekend ? "#fcd34d" : DIM,
                cursor: "pointer",
              }}
              title={
                hideTradfiWeekend
                  ? weekendNow
                    ? "Week ON: TRADFI & COMMOD hidden (weekend). Click for always-hide."
                    : "Week ON: TRADFI & COMMOD shown on weekdays; hidden Sat/Sun. Click for always-hide."
                  : "Week OFF: TRADFI & COMMOD always hidden. Click for weekend-only hide."
              }
              aria-pressed={hideTradfiWeekend}
            >
              <CalendarDays style={{ width: 13, height: 13 }} />
              <span style={{ flex: 1 }}>
                Week{hideTradfiWeekend ? (weekendNow ? " · hide" : " · on") : " · off"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
