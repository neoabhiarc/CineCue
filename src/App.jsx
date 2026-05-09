import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const zonePositions = [0, 34, 67, 100];

const baseZones = [
  { id: 0, name: "Sky / Top Light", role: "Ambient sky tone", start: 0, stop: 14 },
  { id: 1, name: "Train Side Key", role: "Directional sunlight", start: 14, stop: 27 },
  { id: 2, name: "Station Practical", role: "Motivated warm glow", start: 27, stop: 39 },
  { id: 3, name: "Background Glow", role: "World extension light", start: 39, stop: 52 },
];

const defaultCues = [
  {
    id: "dawn-siliguri",
    name: "Dawn at Siliguri",
    shortName: "Dawn",
    time: "Cue 01",
    intent: "Soft early morning departure with misty warmth",
    intensity: 78,
    transitionSpeed: 62,
    zones: [
      [196, 224, 255, 62],
      [255, 182, 104, 66],
      [255, 142, 76, 38],
      [122, 172, 255, 44],
    ],
  },
  {
    id: "mid-journey-noon",
    name: "Mid-journey noon",
    shortName: "Noon",
    time: "Cue 02",
    intent: "Clear hard daylight for open hill travel",
    intensity: 90,
    transitionSpeed: 74,
    zones: [
      [225, 242, 255, 88],
      [255, 226, 150, 92],
      [255, 204, 128, 34],
      [118, 178, 255, 38],
    ],
  },
  {
    id: "bridge-shadow",
    name: "Bridge shadow",
    shortName: "Bridge",
    time: "Cue 03",
    intent: "Short directional drop in light while crossing a structure",
    intensity: 58,
    transitionSpeed: 86,
    zones: [
      [82, 104, 136, 42],
      [255, 174, 92, 38],
      [72, 52, 38, 18],
      [42, 70, 124, 36],
    ],
  },
  {
    id: "monsoon-clouds",
    name: "Monsoon clouds roll in",
    shortName: "Monsoon",
    time: "Cue 04",
    intent: "Cool overcast shift with tension and reduced contrast",
    intensity: 70,
    transitionSpeed: 42,
    zones: [
      [76, 104, 148, 64],
      [120, 156, 210, 48],
      [72, 78, 96, 20],
      [92, 130, 190, 70],
    ],
  },
  {
    id: "ghum-dusk-arrival",
    name: "Ghum dusk arrival",
    shortName: "Ghum dusk",
    time: "Cue 05",
    intent: "Cool dusk ambience with warm station practicals taking over",
    intensity: 72,
    transitionSpeed: 54,
    zones: [
      [62, 92, 210, 66],
      [255, 134, 72, 48],
      [255, 146, 58, 88],
      [32, 64, 160, 62],
    ],
  },
  {
    id: "night-platform",
    name: "Night platform",
    shortName: "Night",
    time: "Cue 06",
    intent: "Low night ambience with motivated platform glow",
    intensity: 46,
    transitionSpeed: 48,
    zones: [
      [42, 86, 180, 42],
      [36, 62, 124, 26],
      [255, 166, 72, 78],
      [20, 42, 118, 58],
    ],
  },
];

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function safeStorageGet(key, fallback) {
  try {
    if (typeof window === "undefined") return fallback;
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function safeStorageSet(key, value) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {}
}

function safeParseArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function makeId(prefix = "id") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function vibrate(ms = 15) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  } catch {}
}

function normalizeHost(host) {
  const trimmed = String(host || "").trim();
  if (!trimmed) return "";
  const withProtocol = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function normalizeColor(color) {
  const source = Array.isArray(color) ? color : [255, 255, 255];
  return [0, 1, 2].map((index) => clamp(Math.round(Number(source[index]) || 0), 0, 255));
}

function rgbToHex(color) {
  return `#${normalizeColor(color).map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [255, 255, 255];
  return [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16));
}

function interpolateColor(startHex, endHex, amount) {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  return start.map((value, index) => clamp(Math.round(value + (end[index] - value) * amount), 0, 255));
}

function normalizeZones(zones) {
  return baseZones.map((zone, index) => {
    const source = Array.isArray(zones?.[index]) ? zones[index] : [255, 255, 255, 0];
    return [...normalizeColor(source.slice(0, 3)), clamp(Math.round(Number(source[3]) || 0), 0, 100)];
  });
}

function stopsFromZones(zones) {
  return normalizeZones(zones).map((zone, index) => ({
    id: makeId("stop"),
    position: zonePositions[index] ?? 0,
    color: rgbToHex(zone),
  }));
}

function normalizeStops(stops, zones) {
  const fallback = stopsFromZones(zones);
  const source = Array.isArray(stops) && stops.length >= 2 ? stops : fallback;
  return source
    .map((stop, index) => ({
      id: stop.id || makeId("stop"),
      position: clamp(Math.round(Number(stop.position) || (index === 0 ? 0 : 100)), 0, 100),
      color: /^#[0-9a-fA-F]{6}$/.test(String(stop.color || "")) ? String(stop.color).toLowerCase() : fallback[Math.min(index, fallback.length - 1)].color,
    }))
    .sort((a, b) => a.position - b.position);
}

function colorAtPosition(stops, position) {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  if (position <= sorted[0].position) return hexToRgb(sorted[0].color);
  if (position >= sorted[sorted.length - 1].position) return hexToRgb(sorted[sorted.length - 1].color);
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index];
    const right = sorted[index + 1];
    if (position >= left.position && position <= right.position) {
      const range = Math.max(1, right.position - left.position);
      return interpolateColor(left.color, right.color, (position - left.position) / range);
    }
  }
  return hexToRgb(sorted[0].color);
}

function zonesFromStops(cue, stops) {
  const currentZones = normalizeZones(cue.zones);
  return baseZones.map((zone, index) => {
    const intensity = currentZones[index]?.[3] ?? 0;
    return [...colorAtPosition(stops, zonePositions[index] ?? 0), intensity];
  });
}

function normalizeCue(cue) {
  const zones = normalizeZones(cue.zones);
  return {
    id: cue.id || makeId("cue"),
    name: cue.name || "Untitled cue",
    shortName: cue.shortName || cue.name || "Cue",
    time: cue.time || "Cue",
    intent: cue.intent || "Custom lighting cue",
    intensity: clamp(Math.round(Number(cue.intensity) || 70), 0, 100),
    transitionSpeed: clamp(Math.round(Number(cue.transitionSpeed) || 60), 0, 100),
    zones,
    gradientStops: normalizeStops(cue.gradientStops, zones),
  };
}

function canonicalCue(cue) {
  const normalized = normalizeCue(cue);
  return normalizeCue({ ...normalized, gradientStops: stopsFromZones(normalized.zones) });
}

function zoneGradient(cue) {
  const normalized = normalizeCue(cue);
  const stops = normalized.zones.map((zone, index) => `${rgbToHex(zone)} ${zonePositions[index] ?? 0}%`).join(", ");
  return { background: `linear-gradient(90deg, ${stops})` };
}

function stopGradient(cue) {
  const normalized = normalizeCue(cue);
  const stops = normalized.gradientStops.map((stop) => `${stop.color} ${stop.position}%`).join(", ");
  return { background: `linear-gradient(90deg, ${stops})` };
}

function buildPayload(cue) {
  const normalized = normalizeCue(cue);
  return {
    on: true,
    bri: 255,
    transition: Math.round((101 - normalized.transitionSpeed) * 3),
    seg: baseZones.map((zone, index) => {
      const cueZone = normalized.zones[index];
      const zoneIntensity = clamp(Math.round(Number(cueZone[3]) || 0), 0, 100);
      return {
        id: zone.id,
        start: zone.start,
        stop: zone.stop,
        on: zoneIntensity > 0,
        bri: Math.round((zoneIntensity / 100) * (normalized.intensity / 100) * 255),
        col: [normalizeColor(cueZone)],
      };
    }),
  };
}

function payloadMatchesState(payload, state) {
  if (!payload || !state?.ok || !state.raw) return "unknown";
  if (typeof state.raw.bri === "number" && Math.abs(state.raw.bri - payload.bri) > 3) return "diverged";
  if (!Array.isArray(state.raw.seg)) return "unknown";
  for (const expected of payload.seg) {
    const actual = state.raw.seg.find((segment) => segment.id === expected.id) || state.raw.seg[expected.id];
    if (!actual) return "unknown";
    if (typeof actual.bri === "number" && Math.abs(actual.bri - expected.bri) > 5) return "diverged";
    const actualColor = actual.col?.[0];
    if (Array.isArray(actualColor)) {
      for (let index = 0; index < 3; index += 1) {
        if (Math.abs(Number(actualColor[index] || 0) - expected.col[0][index]) > 8) return "diverged";
      }
    }
  }
  return "matched";
}

function CueCard({ cue, isLive, isDiverged, onFire, onEdit }) {
  const timerRef = useRef(null);
  const startPointRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);

  function clearPress() {
    clearTimeout(timerRef.current);
  }

  function startPress(event) {
    suppressClickRef.current = false;
    startPointRef.current = { x: event.clientX || 0, y: event.clientY || 0 };
    timerRef.current = setTimeout(() => {
      suppressClickRef.current = true;
      onEdit();
      vibrate(25);
    }, 550);
  }

  function movePress(event) {
    const dx = Math.abs((event.clientX || 0) - startPointRef.current.x);
    const dy = Math.abs((event.clientY || 0) - startPointRef.current.y);
    if (dx > 8 || dy > 8) clearPress();
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onFire();
  }

  return (
    <div className={`relative min-h-36 w-full rounded-3xl p-4 text-left shadow-xl transition ${isLive ? (isDiverged ? "bg-amber-300 text-slate-950 ring-4 ring-amber-100/40" : "bg-cyan-300 text-slate-950 ring-4 ring-cyan-100/40") : "bg-white/[0.06] text-white ring-1 ring-white/10 hover:bg-white/[0.1]"}`}>
      <button onClick={(event) => { event.stopPropagation(); onEdit(); }} className={`absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-black active:scale-95 ${isLive ? "bg-slate-950 text-cyan-200" : "bg-black/30 text-white ring-1 ring-white/10"}`} aria-label={`Edit ${cue.name}`}>✎</button>
      <button onPointerDown={startPress} onPointerMove={movePress} onPointerUp={clearPress} onPointerCancel={clearPress} onPointerLeave={clearPress} onContextMenu={(event) => { event.preventDefault(); onEdit(); }} onClick={handleClick} className="w-full text-left active:scale-[0.98]" style={{ touchAction: "pan-y" }}>
        <div className="mb-4 h-14 w-full rounded-2xl ring-1 ring-white/10" style={zoneGradient(cue)} />
        <div className="flex items-start justify-between gap-3 pr-12">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLive ? "text-slate-700" : "text-cyan-200/70"}`}>{cue.time}</p>
            <h3 className="mt-1 text-lg font-black leading-tight">{cue.name}</h3>
          </div>
          {isLive && <span className="rounded-full bg-slate-950 px-2 py-1 text-[10px] font-black text-cyan-200">{isDiverged ? "TAP TO RESYNC" : "LIVE"}</span>}
        </div>
        <p className={`mt-3 text-sm leading-5 ${isLive ? "text-slate-700" : "text-slate-400"}`}>{cue.intent}</p>
        <div className={`mt-4 flex items-center justify-between gap-3 text-xs font-bold ${isLive ? "text-slate-700" : "text-slate-500"}`}>
          <span>Intensity {cue.intensity}%</span>
          <span>Tap to fire</span>
        </div>
      </button>
    </div>
  );
}

export default function App() {
  const savedCues = safeParseArray(safeStorageGet("cinecue-cues-v5", "[]"));
  const initialCues = savedCues.length ? savedCues.map(canonicalCue) : defaultCues.map(canonicalCue);

  const [host, setHost] = useState(() => safeStorageGet("cinecue-host", "http://wled-abhi.local"));
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [message, setMessage] = useState("Tap a cue to fire it. Hold or press the pencil to edit.");
  const [cues, setCues] = useState(initialCues);
  const [selectedCueId, setSelectedCueId] = useState(initialCues[0]?.id || "dawn-siliguri");
  const [liveCueId, setLiveCueId] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [editingCueId, setEditingCueId] = useState(null);
  const [deviceState, setDeviceState] = useState(null);
  const [lastSentPayload, setLastSentPayload] = useState(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deletedCue, setDeletedCue] = useState(null);
  const pollRef = useRef(null);
  const intensityTimerRef = useRef(null);

  const normalizedHost = useMemo(() => normalizeHost(host), [host]);
  const normalizedCues = useMemo(() => cues.map(normalizeCue), [cues]);
  const selectedCue = useMemo(() => normalizedCues.find((cue) => cue.id === selectedCueId) || normalizedCues[0] || normalizeCue(defaultCues[0]), [normalizedCues, selectedCueId]);
  const liveCue = useMemo(() => normalizedCues.find((cue) => cue.id === liveCueId), [normalizedCues, liveCueId]);
  const editingCue = useMemo(() => normalizedCues.find((cue) => cue.id === editingCueId), [normalizedCues, editingCueId]);
  const currentPayload = useMemo(() => buildPayload(selectedCue), [selectedCue]);
  const matchState = useMemo(() => payloadMatchesState(lastSentPayload, deviceState), [lastSentPayload, deviceState]);

  useEffect(() => safeStorageSet("cinecue-host", host), [host]);
  useEffect(() => safeStorageSet("cinecue-cues-v5", JSON.stringify(normalizedCues)), [normalizedCues]);

  function updateCue(cueId, updater) {
    setCues((current) => current.map((cue) => {
      if (cue.id !== cueId) return cue;
      const cleanCue = normalizeCue(cue);
      const nextCue = typeof updater === "function" ? updater(cleanCue) : { ...cleanCue, ...updater };
      return normalizeCue(nextCue);
    }));
  }

  const pollDeviceState = useCallback(async () => {
    if (!normalizedHost) return;
    try {
      const response = await fetch(`${normalizedHost}/json/state`);
      if (!response.ok) throw new Error("State request failed");
      const raw = await response.json();
      setDeviceState({ ok: true, raw, on: Boolean(raw.on), bri: raw.bri ?? null, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
      setConnectionStatus("connected");
    } catch {
      setDeviceState({ ok: false, raw: null, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
      setConnectionStatus("error");
    }
  }, [normalizedHost]);

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    pollDeviceState();
    pollRef.current = setInterval(pollDeviceState, 5000);
    return () => clearInterval(pollRef.current);
  }, [connectionStatus, pollDeviceState]);

  async function testConnection() {
    if (!normalizedHost) {
      setConnectionStatus("error");
      setMessage("Add the WLED address first.");
      return;
    }
    setConnectionStatus("checking");
    setMessage("Checking lights...");
    try {
      const response = await fetch(`${normalizedHost}/json/info`);
      if (!response.ok) throw new Error("Connection failed");
      const data = await response.json();
      setConnectionStatus("connected");
      setMessage(`Connected to ${data.name || "WLED"}. Tap any cue to fire it.`);
      pollDeviceState();
    } catch {
      setConnectionStatus("error");
      setMessage("Could not reach the lights. Check Wi-Fi, WLED address and power to the strip.");
    }
  }

  async function fireCue(cue, silent = false) {
    if (!normalizedHost) {
      setConnectionStatus("error");
      setMessage("Add the WLED address in setup first.");
      return;
    }
    const payload = buildPayload(cue);
    setSelectedCueId(cue.id);
    if (!silent) setMessage(`Sending ${cue.name}...`);
    try {
      const response = await fetch(`${normalizedHost}/json/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Send failed");
      setConnectionStatus("connected");
      setLiveCueId(cue.id);
      setLastSentPayload(payload);
      if (!silent) setMessage(`${cue.name} is live.`);
      vibrate(15);
      pollDeviceState();
    } catch {
      setConnectionStatus("error");
      if (!silent) setMessage("Could not send the cue. Check Wi-Fi, WLED address and power to the strip.");
    }
  }

  function updateCueIntensity(value) {
    const nextIntensity = clamp(Math.round(Number(value) || 0), 0, 100);
    updateCue(selectedCue.id, { intensity: nextIntensity });
    if (liveCueId === selectedCue.id && connectionStatus === "connected") {
      clearTimeout(intensityTimerRef.current);
      intensityTimerRef.current = setTimeout(() => fireCue({ ...selectedCue, intensity: nextIntensity }, true), 250);
    }
  }

  function openSaveModal() {
    setSaveName(`${selectedCue.shortName || selectedCue.name} take`);
    setSaveModalOpen(true);
  }

  function saveCurrentCue() {
    const cleanName = saveName.trim() || `Saved cue ${normalizedCues.filter((cue) => cue.time === "Saved").length + 1}`;
    const cue = normalizeCue({ ...selectedCue, id: makeId("saved-cue"), name: cleanName, shortName: cleanName, time: "Saved", intent: `Saved from ${selectedCue.name}` });
    setCues((current) => [...current, cue]);
    setSelectedCueId(cue.id);
    setSaveModalOpen(false);
    setMessage(`${cleanName} added to the cuepad.`);
  }

  function duplicateCue(cue) {
    const copy = normalizeCue({ ...cue, id: makeId("copy"), name: `${cue.name} copy`, shortName: `${cue.shortName || cue.name} copy`, time: "Copy" });
    setCues((current) => [...current, copy]);
    setSelectedCueId(copy.id);
    setEditingCueId(copy.id);
    setMessage(`${copy.name} added.`);
  }

  function deleteCue(cue) {
    if (normalizedCues.length <= 1) {
      setMessage("Keep at least one cue in the cuepad.");
      return;
    }
    if (deleteConfirmId !== cue.id) {
      setDeleteConfirmId(cue.id);
      setMessage(`Tap Delete again to remove ${cue.name}.`);
      return;
    }
    const index = normalizedCues.findIndex((item) => item.id === cue.id);
    setDeletedCue({ cue, index });
    setCues((current) => current.filter((item) => item.id !== cue.id));
    const fallback = normalizedCues.find((item) => item.id !== cue.id)?.id || defaultCues[0].id;
    if (selectedCueId === cue.id) setSelectedCueId(fallback);
    if (liveCueId === cue.id) setLiveCueId(null);
    setEditingCueId(null);
    setDeleteConfirmId(null);
    setMessage(`${cue.name} deleted.`);
  }

  function undoDelete() {
    if (!deletedCue) return;
    setCues((current) => {
      const next = [...current];
      next.splice(Math.max(0, deletedCue.index), 0, deletedCue.cue);
      return next;
    });
    setSelectedCueId(deletedCue.cue.id);
    setDeletedCue(null);
    setMessage(`${deletedCue.cue.name} restored.`);
  }

  function resetCues() {
    const reset = defaultCues.map(canonicalCue);
    setCues(reset);
    setSelectedCueId(reset[0].id);
    setLiveCueId(null);
    setEditingCueId(null);
    setDeletedCue(null);
    setMessage("Cuepad reset to the six CineCue DHR cues.");
  }

  function moveCue(cueId, direction) {
    setCues((current) => {
      const index = current.findIndex((cue) => cue.id === cueId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  function updateEditingZone(index, patch) {
    if (!editingCue) return;
    updateCue(editingCue.id, (cue) => {
      const next = normalizeCue(cue);
      const current = next.zones[index] || [255, 255, 255, 0];
      const color = patch.color ? normalizeColor(patch.color) : current.slice(0, 3);
      const intensity = patch.intensity !== undefined ? clamp(Math.round(Number(patch.intensity) || 0), 0, 100) : current[3];
      next.zones[index] = [...color, intensity];
      next.gradientStops = stopsFromZones(next.zones);
      return next;
    });
  }

  function updateGradientStop(stopId, patch) {
    if (!editingCue) return;
    updateCue(editingCue.id, (cue) => {
      const nextStops = normalizeStops(cue.gradientStops.map((stop) => stop.id === stopId ? { ...stop, ...patch } : stop), cue.zones);
      return { ...cue, gradientStops: nextStops, zones: zonesFromStops(cue, nextStops) };
    });
  }

  function addGradientStop() {
    if (!editingCue) return;
    const stops = normalizeStops(editingCue.gradientStops, editingCue.zones);
    const middle = Math.round((stops[0].position + stops[stops.length - 1].position) / 2);
    const nextStops = normalizeStops([...stops, { id: makeId("stop"), position: middle, color: "#ffffff" }], editingCue.zones);
    updateCue(editingCue.id, (cue) => ({ ...cue, gradientStops: nextStops, zones: zonesFromStops(cue, nextStops) }));
  }

  function deleteGradientStop(stopId) {
    if (!editingCue || editingCue.gradientStops.length <= 2) {
      setMessage("A transition needs at least two color pointers.");
      return;
    }
    const nextStops = editingCue.gradientStops.filter((stop) => stop.id !== stopId);
    updateCue(editingCue.id, (cue) => ({ ...cue, gradientStops: nextStops, zones: zonesFromStops(cue, nextStops) }));
  }

  const connectionLabel = connectionStatus === "connected" ? "Connected" : connectionStatus === "checking" ? "Checking" : "Not connected";
  const connectionClass = connectionStatus === "connected" ? "bg-emerald-400 text-slate-950" : connectionStatus === "checking" ? "bg-amber-300 text-slate-950" : "bg-red-400/20 text-red-200 ring-1 ring-red-300/20";
  const matchClass = matchState === "matched" ? "text-emerald-300" : matchState === "diverged" ? "text-amber-300" : "text-slate-400";
  const matchLabel = matchState === "matched" ? "Matched" : matchState === "diverged" ? "Diverged" : "Unknown";
  const liveDiverged = matchState === "diverged";

  return (
    <div className="min-h-screen bg-[#090c12] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-28 top-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl" />
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-4 sm:px-6 sm:py-6">
        <header className="rounded-3xl border border-white/10 bg-white/[0.05] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">CineCue</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">DHR cuepad</h1>
              <p className="mt-2 text-sm leading-5 text-slate-400">Tap any cue to fire. Hold or press the pencil to edit.</p>
            </div>
            <button onClick={() => setShowSetup(true)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-xl ring-1 ring-white/10 active:scale-95" aria-label="Open setup">⚙</button>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
            <div className={`rounded-2xl px-3 py-3 text-sm font-bold ${connectionClass}`}>{connectionLabel}</div>
            <button onClick={testConnection} className="min-h-12 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white ring-1 ring-white/10 active:scale-95">Reconnect</button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-950/60 px-3 py-3 text-sm text-slate-300 ring-1 ring-white/10">Live: <span className="font-semibold text-white">{liveCue ? liveCue.shortName : "None"}</span></div>
            <div className="rounded-2xl bg-slate-950/60 px-3 py-3 text-sm text-slate-300 ring-1 ring-white/10">State: <span className={`font-semibold ${matchClass}`}>{matchLabel}</span></div>
          </div>

          <div className="mt-3 rounded-2xl bg-slate-950/50 px-4 py-3 text-sm leading-5 text-slate-300 ring-1 ring-white/10">{message}</div>
        </header>

        {deletedCue && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-3xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 shadow-xl">
            <span>{deletedCue.cue.name} deleted.</span>
            <button onClick={undoDelete} className="rounded-2xl bg-slate-950 px-4 py-2 text-white">Undo</button>
          </div>
        )}

        <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.05] p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="mb-4">
            <h2 className="text-base font-bold text-white">Shoot cues</h2>
            <p className="mt-1 text-xs text-slate-400">One tap fires the cue. No separate send step.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {normalizedCues.map((cue) => (
              <CueCard key={cue.id} cue={cue} isLive={liveCueId === cue.id} isDiverged={liveDiverged && liveCueId === cue.id} onFire={() => fireCue(cue)} onEdit={() => setEditingCueId(cue.id)} />
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.05] p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white">{selectedCue.name} intensity</h2>
              <p className="mt-1 text-xs text-slate-400">Stored inside this cue.</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-2 text-lg font-black text-slate-950">{selectedCue.intensity}%</div>
          </div>
          <input type="range" min="0" max="100" value={selectedCue.intensity} onChange={(event) => updateCueIntensity(event.target.value)} className="mt-5 h-3 w-full cursor-pointer accent-cyan-300" />
          <button onClick={openSaveModal} className="mt-4 min-h-14 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white ring-1 ring-white/10 active:scale-95">Save current cue as new named cue</button>
        </section>

        <section className="mt-4 rounded-3xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-400 ring-1 ring-white/10">
          <div className="flex items-center justify-between gap-3">
            <span>Device check</span>
            <span className="font-semibold text-slate-200">{deviceState?.ok ? `Online, ${deviceState.time}` : deviceState ? `Unreachable, ${deviceState.time}` : "Not checked"}</span>
          </div>
          {deviceState?.ok && <div className="mt-2 flex items-center justify-between gap-3"><span>WLED state</span><span className="font-semibold text-slate-200">{deviceState.on ? "On" : "Off"}{deviceState.bri !== null ? `, brightness ${deviceState.bri}` : ""}</span></div>}
        </section>
      </main>

      {saveModalOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/70 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#111620] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-xl font-bold text-white">Save cue</h2><p className="mt-1 text-sm text-slate-400">Give this look a recallable name.</p></div>
              <button onClick={() => setSaveModalOpen(false)} className="h-11 w-11 rounded-2xl bg-white/10 text-xl ring-1 ring-white/10">×</button>
            </div>
            <input value={saveName} onChange={(event) => setSaveName(event.target.value)} className="mt-5 w-full rounded-2xl bg-black/30 px-4 py-4 text-base text-white outline-none ring-1 ring-white/10 focus:ring-cyan-300/60" autoFocus />
            <button onClick={saveCurrentCue} className="mt-4 min-h-14 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 active:scale-95">Save to cuepad</button>
          </div>
        </div>
      )}

      {editingCue && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/70 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-3xl border border-white/10 bg-[#111620] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-xl font-bold text-white">Edit cue</h2><p className="mt-1 text-sm text-slate-400">Name, gradient, zone output, speed and order.</p></div>
              <button onClick={() => setEditingCueId(null)} className="h-11 w-11 rounded-2xl bg-white/10 text-xl ring-1 ring-white/10">×</button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-slate-950/60 p-4 ring-1 ring-white/10">
                <label className="text-sm font-bold text-white">Cue name</label>
                <input value={editingCue.name} onChange={(event) => updateCue(editingCue.id, { name: event.target.value, shortName: event.target.value })} className="mt-2 w-full rounded-2xl bg-black/30 px-4 py-4 text-base text-white outline-none ring-1 ring-white/10 focus:ring-cyan-300/60" />
                <label className="mt-4 block text-sm font-bold text-white">Cue note</label>
                <textarea value={editingCue.intent} onChange={(event) => updateCue(editingCue.id, { intent: event.target.value })} className="mt-2 min-h-24 w-full rounded-2xl bg-black/30 px-4 py-4 text-base text-white outline-none ring-1 ring-white/10 focus:ring-cyan-300/60" />
              </div>

              <div className="rounded-3xl bg-slate-950/70 p-5 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div><h3 className="text-sm font-bold text-white">Gradient map</h3><p className="mt-1 text-xs text-slate-400">Pointers drive the zone colors sent to WLED.</p></div>
                  <button onClick={addGradientStop} className="min-h-10 rounded-2xl bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950">+ Pointer</button>
                </div>
                <div className="relative mt-4 h-24 rounded-3xl ring-1 ring-white/10" style={stopGradient(editingCue)}>
                  {editingCue.gradientStops.map((stop) => (
                    <div key={stop.id} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${stop.position}%` }}>
                      <div className="h-10 w-10 rounded-full border-4 border-white shadow-xl" style={{ backgroundColor: stop.color }} />
                      <div className="mx-auto mt-1 h-0 w-0 border-l-4 border-r-4 border-t-8 border-l-transparent border-r-transparent border-t-white" />
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-3">
                  {editingCue.gradientStops.map((stop, index) => (
                    <div key={stop.id} className="rounded-2xl bg-black/30 p-3 ring-1 ring-white/10">
                      <div className="flex items-center justify-between gap-3">
                        <div><h4 className="text-sm font-bold text-white">Pointer {index + 1}</h4><p className="mt-1 text-xs text-slate-400">Position {stop.position}%</p></div>
                        <div className="flex items-center gap-2">
                          <input type="color" value={stop.color} onChange={(event) => updateGradientStop(stop.id, { color: event.target.value })} className="h-12 w-14 cursor-pointer rounded-xl border-0 bg-transparent" />
                          <button onClick={() => deleteGradientStop(stop.id)} className="h-12 w-12 rounded-2xl bg-red-400/20 text-lg font-black text-red-200 ring-1 ring-red-300/20">×</button>
                        </div>
                      </div>
                      <input type="range" min="0" max="100" value={stop.position} onChange={(event) => updateGradientStop(stop.id, { position: Number(event.target.value) })} className="mt-4 w-full accent-cyan-300" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-950/60 p-4 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-white">Cue intensity</h3><p className="mt-1 text-xs text-slate-400">Stored with this cue.</p></div><span className="rounded-2xl bg-white px-4 py-2 text-lg font-black text-slate-950">{editingCue.intensity}%</span></div>
                <input type="range" min="0" max="100" value={editingCue.intensity} onChange={(event) => updateCue(editingCue.id, { intensity: Number(event.target.value) })} className="mt-4 w-full accent-cyan-300" />
              </div>

              <div className="rounded-2xl bg-slate-950/60 p-4 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-white">Transition speed</h3><p className="mt-1 text-xs text-slate-400">Higher means faster transition.</p></div><span className="rounded-2xl bg-white px-4 py-2 text-lg font-black text-slate-950">{editingCue.transitionSpeed}%</span></div>
                <input type="range" min="0" max="100" value={editingCue.transitionSpeed} onChange={(event) => updateCue(editingCue.id, { transitionSpeed: Number(event.target.value) })} className="mt-4 w-full accent-cyan-300" />
              </div>

              <div className="rounded-2xl bg-slate-950/60 p-4 ring-1 ring-white/10">
                <h3 className="text-sm font-bold text-white">Zone output</h3>
                <p className="mt-1 text-xs text-slate-400">Card preview is derived from these exact zone colors.</p>
                <div className="mt-3 space-y-3">
                  {baseZones.map((zone, index) => {
                    const cueZone = editingCue.zones[index] || [255, 255, 255, 0];
                    return (
                      <div key={zone.id} className="rounded-2xl bg-black/30 p-3 ring-1 ring-white/10">
                        <div className="flex items-start justify-between gap-3">
                          <div><h4 className="text-sm font-bold text-white">{zone.name}</h4><p className="mt-1 text-xs text-slate-400">{zone.role}</p></div>
                          <input type="color" value={rgbToHex(cueZone)} onChange={(event) => updateEditingZone(index, { color: hexToRgb(event.target.value) })} className="h-12 w-14 cursor-pointer rounded-xl border-0 bg-transparent" />
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                          <input type="range" min="0" max="100" value={cueZone[3]} onChange={(event) => updateEditingZone(index, { intensity: Number(event.target.value) })} className="w-full accent-cyan-300" />
                          <span className="w-12 text-right text-sm font-bold text-white">{cueZone[3]}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => moveCue(editingCue.id, -1)} className="min-h-12 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white ring-1 ring-white/10 active:scale-95">Move up</button>
                <button onClick={() => moveCue(editingCue.id, 1)} className="min-h-12 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white ring-1 ring-white/10 active:scale-95">Move down</button>
                <button onClick={() => duplicateCue(editingCue)} className="min-h-12 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white ring-1 ring-white/10 active:scale-95">Duplicate</button>
                <button onClick={() => deleteCue(editingCue)} className="min-h-12 rounded-2xl bg-red-400 px-4 py-3 text-sm font-black text-slate-950 active:scale-95">{deleteConfirmId === editingCue.id ? "Confirm delete" : "Delete"}</button>
              </div>
            </div>

            <button onClick={() => setEditingCueId(null)} className="mt-5 min-h-14 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 active:scale-95">Done</button>
          </div>
        </div>
      )}

      {showSetup && (
        <div className="fixed inset-0 z-20 flex items-end bg-black/70 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-3xl border border-white/10 bg-[#111620] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-xl font-bold text-white">Setup</h2><p className="mt-1 text-sm text-slate-400">Set WLED connection and inspect payloads.</p></div>
              <button onClick={() => setShowSetup(false)} className="h-11 w-11 rounded-2xl bg-white/10 text-xl ring-1 ring-white/10">×</button>
            </div>
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-slate-950/60 p-4 ring-1 ring-white/10">
                <label className="text-sm font-bold text-white">WLED address</label>
                <input value={host} onChange={(event) => setHost(event.target.value)} className="mt-3 w-full rounded-2xl bg-black/30 px-4 py-4 text-base text-white outline-none ring-1 ring-white/10 focus:ring-cyan-300/60" />
                <button onClick={testConnection} className="mt-3 min-h-12 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 active:scale-95">Test lights</button>
              </div>
              <div className="rounded-2xl bg-slate-950/60 p-4 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-white">LED zone map</h3><button onClick={resetCues} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white ring-1 ring-white/10">Reset cues</button></div>
                <div className="mt-3 space-y-2">
                  {baseZones.map((zone) => <div key={zone.id} className="rounded-2xl bg-white/5 p-3 text-sm ring-1 ring-white/10"><div className="font-semibold text-white">{zone.name}</div><div className="mt-1 text-xs text-slate-400">{zone.role} · LEDs {zone.start} to {zone.stop - 1}</div></div>)}
                </div>
              </div>
              <details className="rounded-2xl bg-slate-950/60 p-4 ring-1 ring-white/10">
                <summary className="cursor-pointer text-sm font-bold text-white">Advanced payload preview</summary>
                <pre className="mt-3 max-h-72 overflow-auto rounded-2xl bg-black/40 p-4 text-xs leading-5 text-cyan-100 ring-1 ring-white/10">
                  {JSON.stringify(currentPayload, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}