import React, { useState, useEffect, useMemo, useRef } from "react";
import { CheckCircle2, Circle, RotateCcw, Sunrise } from "lucide-react";

/* ---------- date / math helpers ---------- */

function parseISO(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
function daysInYear(y) {
  return isLeapYear(y) ? 366 : 365;
}
function dayNumberOf(dateStr, startDateStr) {
  const d = parseISO(dateStr);
  const s = parseISO(startDateStr);
  return Math.round((d - s) / 86400000) + 1;
}
function formatDisplay(dateStr) {
  const d = parseISO(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
function calculateSets(total, minSetSize = 25) {
  if (total <= 0) return [];
  if (total < minSetSize * 2) return [total];
  const numberOfSets = Math.floor(total / minSetSize);
  const baseSize = Math.floor(total / numberOfSets);
  const remainder = total % numberOfSets;
  const sets = [];
  for (let i = 0; i < remainder; i++) sets.push(baseSize + 1);
  for (let i = 0; i < numberOfSets - remainder; i++) sets.push(baseSize);
  return sets;
}
function setsForDate(dateStr) {
  const y = parseISO(dateStr).getUTCFullYear();
  const total = dayNumberOf(dateStr, `${y}-01-01`);
  return calculateSets(total, 25);
}
const EMOJI_DIGITS = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
function toEmojiNumber(n) {
  return String(n)
    .split("")
    .map((ch) => EMOJI_DIGITS[Number(ch)] ?? ch)
    .join("");
}

const STORAGE_KEY = "ladder-today-v1";

export default function App() {
  const [loading, setLoading] = useState(true);
  // `day` is the ladder's pinned active date — it does NOT follow the clock.
  // It only changes when the user taps "Go to Current Day".
  const [day, setDay] = useState({ date: null, checked: [] });
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState(null);
  const [, forceTick] = useState(0);
  const hasLoaded = useRef(false);
  const skipNextSave = useRef(true);
  const toastTimer = useRef(null);

  // Re-check the real date periodically so the "new day" button shows up
  // even if the person isn't actively tapping anything around midnight.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const realToday = todayISO();
  const activeDate = day.date || realToday;
  const year = parseISO(activeDate).getUTCFullYear();
  const startDate = `${year}-01-01`;
  const total = dayNumberOf(activeDate, startDate);
  const sets = useMemo(() => calculateSets(total, 25), [total]);
  const dayHasChanged = day.date !== null && day.date !== realToday;

  const showToast = (msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  // Load saved progress on mount — whatever date was last pinned, stays pinned.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (!cancelled) {
          if (res && res.value) {
            const parsed = JSON.parse(res.value);
            if (parsed && typeof parsed.date === "string" && Array.isArray(parsed.checked)) {
              const expected = setsForDate(parsed.date);
              const checked =
                parsed.checked.length === expected.length
                  ? parsed.checked
                  : new Array(expected.length).fill(false);
              setDay({ date: parsed.date, checked });
            } else {
              const t = todayISO();
              setDay({ date: t, checked: new Array(setsForDate(t).length).fill(false) });
            }
          } else {
            const t = todayISO();
            setDay({ date: t, checked: new Array(setsForDate(t).length).fill(false) });
          }
        }
      } catch {
        if (!cancelled) {
          const t = todayISO();
          setDay({ date: t, checked: new Array(setsForDate(t).length).fill(false) });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          hasLoaded.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on change — retries quietly a few times before ever bothering the user
  useEffect(() => {
    if (!hasLoaded.current || !day.date) return;
    // The very first time `day` settles after load, nothing has actually
    // changed yet — skip that save instead of writing right after reading.
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    let cancelled = false;
    const payload = JSON.stringify(day);
    const t = setTimeout(async () => {
      const attempts = 3;
      for (let i = 0; i < attempts; i++) {
        if (cancelled) return;
        try {
          const result = await window.storage.set(STORAGE_KEY, payload, false);
          if (result) return; // saved fine, say nothing
        } catch {
          // fall through to retry
        }
        if (i < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
        }
      }
      if (!cancelled) showToast("Progress could not be saved. Check your connection.");
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const toggleSet = (idx) => {
    setDay((prev) => {
      const next = [...prev.checked];
      next[idx] = !next[idx];
      return { ...prev, checked: next };
    });
  };

  const resetToday = () => {
    setDay((prev) => ({ ...prev, checked: new Array(prev.checked.length).fill(false) }));
    setConfirmReset(false);
  };

  const goToCurrentDay = () => {
    const t = todayISO();
    setDay({ date: t, checked: new Array(setsForDate(t).length).fill(false) });
    setConfirmReset(false);
  };

  const allChecked = day.checked.length > 0 && day.checked.every(Boolean);
  const anyChecked = day.checked.some(Boolean);

  if (loading) {
    return (
      <div className="pl-app">
        <style>{CSS}</style>
        <div className="pl-shell pl-loading">
          <div className="pl-mono pl-eyebrow">LADDER</div>
          <div className="pl-loading-bar">
            <div className="pl-loading-bar-fill" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pl-app">
      <style>{CSS}</style>
      <div className="pl-shell">
        <div className="pl-word">
          <span className="pl-display pl-word-main">LADDER</span>
          <span className="pl-mono pl-word-sub">one more rung, every day</span>
        </div>

        <div className="pl-summary">
          <div className="pl-mono pl-eyebrow">
            RUNG {total} OF {daysInYear(year)}
          </div>
          <div className="pl-summary-date">{formatDisplay(activeDate)}</div>
          <div className="pl-display pl-bignum">{total}</div>
          <div className="pl-rungbar">
            <div
              className="pl-rungbar-fill"
              style={{
                width: `${Math.round((day.checked.filter(Boolean).length / (sets.length || 1)) * 100)}%`,
              }}
            />
          </div>
        </div>

        {allChecked && (
          <div className="pl-celebrate">
            <span className="pl-celebrate-emoji">{toEmojiNumber(total)}</span>
            <span className="pl-display pl-celebrate-text">complete!</span>
          </div>
        )}

        <div className={"pl-tiles" + (sets.length === 1 ? " single" : "")}>
          {sets.map((n, i) => {
            const isChecked = day.checked[i];
            return (
              <button
                key={i}
                className={"pl-tile" + (isChecked ? " done" : "")}
                onClick={() => toggleSet(i)}
              >
                <span className="pl-tile-icon">
                  {isChecked ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </span>
                <span className="pl-tile-num pl-display">{n}</span>
                <span className="pl-tile-label pl-mono">SET {i + 1}</span>
              </button>
            );
          })}
        </div>

        <div className="pl-resetrow">
          {!confirmReset ? (
            anyChecked && (
              <button className="pl-textbtn pl-mono" onClick={() => setConfirmReset(true)}>
                <RotateCcw size={12} /> RESET TODAY
              </button>
            )
          ) : (
            <div className="pl-confirm-inline">
              <span className="pl-mono">Uncheck all sets for today?</span>
              <div className="pl-confirm-inline-actions">
                <button className="pl-textbtn pl-mono danger" onClick={resetToday}>
                  Reset
                </button>
                <button className="pl-textbtn pl-mono" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {dayHasChanged && (
          <div className="pl-advance-row">
            <div className="pl-mono pl-advance-hint">The calendar has moved to a new day.</div>
            <button className="pl-advance" onClick={goToCurrentDay}>
              <Sunrise size={16} />
              Go to Current Day
            </button>
          </div>
        )}

        {toast && <div className="pl-toast pl-mono">{toast}</div>}
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

.pl-app{
  --bg:#ECE8DF; --surface:#FFFFFF; --surface-alt:#F5F2EA; --ink:#201F1B; --ink-soft:#8A8578;
  --accent:#E2571C; --accent-deep:#B23E14; --line:rgba(32,31,27,0.14); --danger:#B23A2E;
  font-family:'Inter',sans-serif; background:var(--bg); color:var(--ink); min-height:100vh;
  display:flex; justify-content:center; box-sizing:border-box;
}
.pl-app *{ box-sizing:border-box; }
.pl-shell{ width:100%; max-width:440px; padding:24px 18px 60px; position:relative; }
.pl-display{ font-family:'Anton',sans-serif; font-weight:400; }
.pl-mono{ font-family:'IBM Plex Mono',monospace; }

.pl-loading{ display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; gap:16px; }
.pl-loading-bar{ width:160px; height:6px; border-radius:3px; background:var(--surface-alt); overflow:hidden; }
.pl-loading-bar-fill{ width:40%; height:100%; background:var(--accent); animation:pl-load 1.1s ease-in-out infinite; }
@keyframes pl-load{ 0%{ transform:translateX(-100%);} 100%{ transform:translateX(350%);} }

.pl-word{ display:flex; flex-direction:column; line-height:1; margin-bottom:18px; text-align:center; align-items:center; }
.pl-word-main{ font-size:26px; letter-spacing:.02em; }
.pl-word-sub{ font-size:10px; letter-spacing:.08em; color:var(--ink-soft); text-transform:uppercase; margin-top:5px; }

.pl-summary{ background:var(--surface); border:1px solid var(--line); border-radius:22px; padding:22px 20px 20px;
  margin-bottom:16px; text-align:center; }
.pl-eyebrow{ font-size:11px; letter-spacing:.14em; color:var(--ink-soft); }
.pl-summary-date{ font-size:14.5px; font-weight:600; margin-top:4px; }
.pl-bignum{ font-size:92px; line-height:1; margin:8px 0 14px; color:var(--ink); }

.pl-rungbar{ height:14px; border-radius:7px; background:var(--surface-alt); border:1px solid var(--line);
  overflow:hidden; position:relative;
  background-image: repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px 15px); }
.pl-rungbar-fill{ height:100%; background-color:var(--accent);
  background-image: repeating-linear-gradient(90deg, rgba(255,255,255,0.4) 0 2px, transparent 2px 15px);
  border-radius:7px; transition:width .25s ease; }

.pl-celebrate{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; background:var(--ink);
  color:var(--surface-alt); border-radius:16px; padding:16px 14px; margin-bottom:16px; }
.pl-celebrate-emoji{ font-size:26px; line-height:1.3; letter-spacing:1px; word-break:break-all; text-align:center; }
.pl-celebrate-text{ font-size:15px; letter-spacing:.04em; }

.pl-tiles{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px; }
.pl-tiles.single{ grid-template-columns:1fr; }
.pl-tile{ position:relative; border-radius:16px; border:1px solid var(--line); background:var(--surface);
  padding:16px 14px 14px; display:flex; flex-direction:column; align-items:flex-start; gap:8px; cursor:pointer;
  transition:transform .1s ease, background .15s ease, color .15s ease; text-align:left; }
.pl-tile:active{ transform:scale(0.97); }
.pl-tile.done{ background:var(--ink); color:var(--surface-alt); border-color:var(--ink); }
.pl-tile-icon{ position:absolute; top:12px; right:12px; color:var(--ink-soft); }
.pl-tile.done .pl-tile-icon{ color:var(--accent); }
.pl-tile-num{ font-size:30px; line-height:1; }
.pl-tile-label{ font-size:10.5px; letter-spacing:.08em; color:var(--ink-soft); }
.pl-tile.done .pl-tile-label{ color:rgba(245,242,234,0.65); }
.pl-tile.single .pl-tile-num{ font-size:44px; }

.pl-resetrow{ display:flex; justify-content:center; min-height:20px; }
.pl-textbtn{ background:none; border:none; display:flex; align-items:center; gap:5px; color:var(--ink-soft);
  font-size:11px; letter-spacing:.05em; cursor:pointer; padding:6px 8px; }
.pl-textbtn.danger{ color:var(--danger); }
.pl-textbtn:hover{ color:var(--accent-deep); }

.pl-advance-row{ margin-top:18px; display:flex; flex-direction:column; align-items:center; gap:8px; }
.pl-advance-hint{ font-size:10.5px; color:var(--ink-soft); letter-spacing:.03em; }
.pl-advance{ width:100%; display:flex; align-items:center; justify-content:center; gap:8px; background:var(--surface);
  border:1.5px solid var(--accent); color:var(--accent-deep); border-radius:16px; padding:14px;
  font-family:'Inter',sans-serif; font-weight:700; font-size:13.5px; cursor:pointer; transition:background .15s ease; }
.pl-advance:hover{ background:var(--surface-alt); }

.pl-confirm-inline{ width:100%; display:flex; flex-direction:column; gap:8px; align-items:center; background:var(--surface-alt);
  border:1px solid var(--line); border-radius:14px; padding:12px 14px; font-size:12px; text-align:center; }
.pl-confirm-inline-actions{ display:flex; gap:10px; }

.pl-toast{ position:fixed; bottom:22px; left:50%; transform:translateX(-50%); background:var(--ink); color:var(--surface-alt);
  padding:10px 16px; border-radius:12px; font-size:11.5px; letter-spacing:.03em; max-width:340px; text-align:center;
  box-shadow:0 8px 24px rgba(0,0,0,0.25); z-index:50; }
`;
