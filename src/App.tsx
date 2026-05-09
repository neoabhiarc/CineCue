import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DEFAULT_WLED_HOST = "wled-abhi.local";
const WLED_AP_HOST = "4.3.2.1";
const HOTSPOT_HOST = "wled-abhi.local";
const LAST_LAN_HOST = "192.168.0.202";
const LED_UNITS = 52;
const WLED_COLOR_ORDER_NOTE = "BRG in WLED LED Preferences";

const stripLayout = [
  { name: "Strip 1", start: 0, end: 13, direction: "normal", count: 14 },
  { name: "Strip 2", start: 14, end: 26, direction: "reversed", count: 13 },
  { name: "Strip 3", start: 27, end: 38, direction: "normal", count: 12 },
  { name: "Strip 4", start: 39, end: 51, direction: "reversed", count: 13 }
];

const defaultCalibration = stripLayout.map((strip) => ({
  name: strip.name,
  brightness: 100,
  red: 100,
  green: 100,
  blue: 100
}));

const defaultPresets = [
  {
    id: "warm-station",
    name: "Warm Station",
    brightness: 170,
    color: "#ff9b3d",
    temperature: 2200,
    speed: 120,
    intensity: 90,
    effect: 0
  },
  {
    id: "blue-night",
    name: "Blue Night",
    brightness: 120,
    color: "#1f6dff",
    temperature: 7000,
    speed: 90,
    intensity: 70,
    effect: 0
  },
  {
    id: "tunnel-pass",
    name: "Tunnel Pass",
    brightness: 210,
    color: "#ff5a1f",
    temperature: 2600,
    speed: 190,
    intensity: 160,
    effect: 2
  }
];

function Icon({ children }) {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-xs text-zinc-200">
      {children}
    </span>
  );
}

function safeLocalStorageGet(key, fallback) {
  try {
    if (typeof localStorage === "undefined") return fallback;
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ignore local storage errors in sandbox/private mode.
  }
}

function safeLocalStorageJsonGet(key, fallback) {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const fallback = { r: 255, g: 122, b: 26 };
  if (typeof hex !== "string") return fallback;
  const cleaned = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return fallback;
  const bigint = parseInt(cleaned, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function kelvinToRgb(kelvin) {
  const temp = clamp(kelvin, 1000, 40000) / 100;
  let red;
  let green;
  let blue;

  if (temp <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temp) - 161.1195681661;
    blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    blue = 255;
  }

  return {
    r: Math.round(clamp(red, 0, 255)),
    g: Math.round(clamp(green, 0, 255)),
    b: Math.round(clamp(blue, 0, 255))
  };
}

function buildStripUnits(strip) {
  const units = Array.from({ length: strip.end - strip.start + 1 }, (_, idx) => strip.start + idx);
  return strip.direction === "reversed" ? [...units].reverse() : units;
}

function buildSyncIndexes(layout, pos) {
  return layout
    .map((strip) => buildStripUnits(strip)[pos])
    .filter((unit) => unit !== undefined);
}

function getStripIndexForUnit(unit) {
  return stripLayout.findIndex((strip) => unit >= strip.start && unit <= strip.end);
}

function toHexColor(rgb) {
  return `${rgb.r.toString(16).padStart(2, "0")}${rgb.g.toString(16).padStart(2, "0")}${rgb.b.toString(16).padStart(2, "0")}`;
}

function normalizeWledHost(input) {
  const raw = String(input || DEFAULT_WLED_HOST).trim();
  const withoutHttp = raw.replace(/^https?:\/\//i, "");
  const hostOnly = withoutHttp.split("/")[0].trim();
  return hostOnly || DEFAULT_WLED_HOST;
}

function getWledBaseUrl(input) {
  return `http://${normalizeWledHost(input)}`;
}

function normalizeCalibration(raw) {
  if (!Array.isArray(raw)) return defaultCalibration;

  return stripLayout.map((strip, index) => {
    const item = raw[index] || {};
    return {
      name: strip.name,
      brightness: clamp(Number(item.brightness ?? 100), 0, 200),
      red: clamp(Number(item.red ?? 100), 0, 200),
      green: clamp(Number(item.green ?? 100), 0, 200),
      blue: clamp(Number(item.blue ?? 100), 0, 200)
    };
  });
}

function applyCalibrationToRgb(rgb, calibrationItem) {
  const brightnessGain = (calibrationItem?.brightness ?? 100) / 100;
  const redGain = (calibrationItem?.red ?? 100) / 100;
  const greenGain = (calibrationItem?.green ?? 100) / 100;
  const blueGain = (calibrationItem?.blue ?? 100) / 100;

  return {
    r: clamp(Math.round(rgb.r * brightnessGain * redGain), 0, 255),
    g: clamp(Math.round(rgb.g * brightnessGain * greenGain), 0, 255),
    b: clamp(Math.round(rgb.b * brightnessGain * blueGain), 0, 255)
  };
}

function runSelfTests() {
  const testOne = hexToRgb("#ff0000");
  const stripTwo = buildStripUnits(stripLayout[1]);
  const stripFour = buildStripUnits(stripLayout[3]);
  const syncZero = buildSyncIndexes(stripLayout, 0);
  const syncOne = buildSyncIndexes(stripLayout, 1);
  const hexWhite = rgbToHex(255, 255, 255);
  const normalizedHost = normalizeWledHost("http://wled-abhi.local/");
  const normalizedJsonUrl = normalizeWledHost("http://wled-abhi.local/json/info");
  const baseUrl = getWledBaseUrl("wled-abhi.local");
  const calibratedHalfRed = applyCalibrationToRgb(
    { r: 200, g: 100, b: 50 },
    { brightness: 50, red: 100, green: 100, blue: 100 }
  );
  const calibratedBlueGain = applyCalibrationToRgb(
    { r: 100, g: 100, b: 100 },
    { brightness: 100, red: 100, green: 100, blue: 50 }
  );
  const stripIndex = getStripIndexForUnit(28);

  return [
    {
      name: "hexToRgb converts red correctly",
      pass: testOne.r === 255 && testOne.g === 0 && testOne.b === 0,
      expected: "{ r: 255, g: 0, b: 0 }",
      actual: JSON.stringify(testOne)
    },
    {
      name: "Strip 2 is reversed for visual sync",
      pass: stripTwo[0] === 26 && stripTwo[stripTwo.length - 1] === 14,
      expected: "first 26, last 14",
      actual: `first ${stripTwo[0]}, last ${stripTwo[stripTwo.length - 1]}`
    },
    {
      name: "Strip 4 is reversed for visual sync",
      pass: stripFour[0] === 51 && stripFour[stripFour.length - 1] === 39,
      expected: "first 51, last 39",
      actual: `first ${stripFour[0]}, last ${stripFour[stripFour.length - 1]}`
    },
    {
      name: "Sync step 0 maps same visual edge",
      pass: JSON.stringify(syncZero) === JSON.stringify([0, 26, 27, 51]),
      expected: "[0,26,27,51]",
      actual: JSON.stringify(syncZero)
    },
    {
      name: "Sync step 1 maps next visual position",
      pass: JSON.stringify(syncOne) === JSON.stringify([1, 25, 28, 50]),
      expected: "[1,25,28,50]",
      actual: JSON.stringify(syncOne)
    },
    {
      name: "rgbToHex keeps white correct",
      pass: hexWhite === "#ffffff",
      expected: "#ffffff",
      actual: hexWhite
    },
    {
      name: "normalizeWledHost removes http and slash",
      pass: normalizedHost === "wled-abhi.local",
      expected: "wled-abhi.local",
      actual: normalizedHost
    },
    {
      name: "normalizeWledHost removes JSON path",
      pass: normalizedJsonUrl === "wled-abhi.local",
      expected: "wled-abhi.local",
      actual: normalizedJsonUrl
    },
    {
      name: "getWledBaseUrl builds HTTP base URL",
      pass: baseUrl === "http://wled-abhi.local",
      expected: "http://wled-abhi.local",
      actual: baseUrl
    },
    {
      name: "Calibration brightness halves color values",
      pass: calibratedHalfRed.r === 100 && calibratedHalfRed.g === 50 && calibratedHalfRed.b === 25,
      expected: "{ r: 100, g: 50, b: 25 }",
      actual: JSON.stringify(calibratedHalfRed)
    },
    {
      name: "Calibration blue gain affects blue channel only",
      pass: calibratedBlueGain.r === 100 && calibratedBlueGain.g === 100 && calibratedBlueGain.b === 50,
      expected: "{ r: 100, g: 100, b: 50 }",
      actual: JSON.stringify(calibratedBlueGain)
    },
    {
      name: "Unit 28 belongs to Strip 3",
      pass: stripIndex === 2,
      expected: "2",
      actual: String(stripIndex)
    }
  ];
}

function SliderControl({ icon, label, value, min, max, step = 1, onChange, onCommit, suffix = "" }) {
  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-zinc-200">
          {icon}
          <span>{label}</span>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-200">
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        className="w-full accent-white"
      />
    </div>
  );
}

function StatusPill({ status }) {
  const styles = {
    idle: "border-zinc-700 bg-zinc-900 text-zinc-300",
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    error: "border-red-500/40 bg-red-500/10 text-red-300",
    loading: "border-blue-500/40 bg-blue-500/10 text-blue-300"
  };

  const label = {
    idle: "Ready",
    success: "Connected",
    error: "Check WLED",
    loading: "Sending"
  }[status.type || "idle"];

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${styles[status.type || "idle"]}`}>
      <Icon>↔</Icon>
      <span>{label}</span>
    </div>
  );
}

function LedDot({ active, color, label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="h-5 w-5 rounded-full border border-white/20 shadow-sm transition-transform hover:scale-125"
        style={{ backgroundColor: active ? color : "#18181b", boxShadow: active ? `0 0 18px ${color}` : "none" }}
        title={`Unit ${label}`}
      />
      <span className="text-[9px] text-zinc-500">{label}</span>
    </div>
  );
}

function TestPanel({ tests }) {
  const passed = tests.filter((test) => test.pass).length;

  return (
    <Card className="rounded-[2rem] border-white/10 bg-zinc-950 text-white shadow-xl">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Built-in Checks</h2>
            <p className="text-sm text-zinc-500">Small tests for color conversion, host parsing, calibration and strip mapping.</p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-300">
            {passed}/{tests.length} passing
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {tests.map((test) => (
            <div key={test.name} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-zinc-200">{test.name}</span>
                <span className={`rounded-full px-2 py-1 text-xs ${test.pass ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
                  {test.pass ? "PASS" : "FAIL"}
                </span>
              </div>
              {!test.pass && (
                <p className="mt-2 text-xs text-zinc-500">
                  Expected {test.expected}, got {test.actual}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CalibrationStripCard({ strip, calibration, index, onChange, onTestWhite, onTestRed, onTestGreen, onTestBlue }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">{strip.name}</p>
          <p className="text-xs text-zinc-500">Units {strip.start}–{strip.end} · {strip.count} units</p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-400">Cal {index + 1}</span>
      </div>

      <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-200">
        WLED color order is set to {WLED_COLOR_ORDER_NOTE}. The app now sends normal RGB values and uses calibration only for fine tuning.
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SliderControl
          icon={<Icon>☀</Icon>}
          label="Strip Brightness Gain"
          value={calibration.brightness}
          min={0}
          max={200}
          onChange={(value) => onChange(index, "brightness", value)}
          suffix="%"
        />
        <SliderControl
          icon={<Icon>R</Icon>}
          label="Red Gain"
          value={calibration.red}
          min={0}
          max={200}
          onChange={(value) => onChange(index, "red", value)}
          suffix="%"
        />
        <SliderControl
          icon={<Icon>G</Icon>}
          label="Green Gain"
          value={calibration.green}
          min={0}
          max={200}
          onChange={(value) => onChange(index, "green", value)}
          suffix="%"
        />
        <SliderControl
          icon={<Icon>B</Icon>}
          label="Blue Gain"
          value={calibration.blue}
          min={0}
          max={200}
          onChange={(value) => onChange(index, "blue", value)}
          suffix="%"
        />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        <Button onClick={() => onTestWhite(index)} className="rounded-xl bg-white text-black hover:bg-zinc-200">White</Button>
        <Button onClick={() => onTestRed(index)} className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">Red</Button>
        <Button onClick={() => onTestGreen(index)} className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">Green</Button>
        <Button onClick={() => onTestBlue(index)} className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">Blue</Button>
      </div>
    </div>
  );
}

export default function WledLightControlApp() {
  const [wledHost, setWledHost] = useState(() => safeLocalStorageGet("wled-host", DEFAULT_WLED_HOST));
  const [power, setPower] = useState(true);
  const [brightness, setBrightness] = useState(160);
  const [color, setColor] = useState("#ff7a1a");
  const [temperature, setTemperature] = useState(3200);
  const [speed, setSpeed] = useState(120);
  const [intensity, setIntensity] = useState(100);
  const [effect, setEffect] = useState(0);
  const [status, setStatus] = useState({ type: "idle", message: "Ready" });
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState(() => safeLocalStorageJsonGet("wled-presets", defaultPresets));
  const [calibration, setCalibration] = useState(() => normalizeCalibration(safeLocalStorageJsonGet("wled-calibration", defaultCalibration)));
  const [activeMode, setActiveMode] = useState("manual");
  const [scanPosition, setScanPosition] = useState(0);

  const selectedRgb = useMemo(() => hexToRgb(color), [color]);
  const tempRgb = useMemo(() => kelvinToRgb(temperature), [temperature]);
  const tests = useMemo(() => runSelfTests(), []);
  const baseUrl = useMemo(() => getWledBaseUrl(wledHost), [wledHost]);

  useEffect(() => {
    safeLocalStorageSet("wled-host", wledHost);
  }, [wledHost]);

  useEffect(() => {
    safeLocalStorageSet("wled-presets", JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    safeLocalStorageSet("wled-calibration", JSON.stringify(calibration));
  }, [calibration]);

  async function sendToWled(payload, successMessage = "Sent to WLED") {
    setStatus({ type: "loading", message: "Sending" });
    try {
      const response = await fetch(`${baseUrl}/json/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setStatus({ type: "success", message: successMessage });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Failed to reach WLED" });
    }
  }

  async function testConnection() {
    setStatus({ type: "loading", message: "Testing WLED connection" });
    try {
      const response = await fetch(`${baseUrl}/json/info`, { method: "GET" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const info = await response.json();
      const ledCount = info?.leds?.count ?? "unknown";
      const name = info?.name || "WLED device";
      setStatus({ type: "success", message: `Connected to ${name}. LEDs: ${ledCount}` });
    } catch (error) {
      setStatus({
        type: "error",
        message: `${error.message || "Failed to reach WLED"}. For hotspot mode, use wled-abhi.local. For WLED-AP mode, use 4.3.2.1. Run this app locally over http://localhost.`
      });
    }
  }

  function buildCalibratedSegments(rgb, next = {}) {
    const nextEffect = next.effect ?? effect;
    const nextSpeed = next.speed ?? speed;
    const nextIntensity = next.intensity ?? intensity;

    return stripLayout.map((strip, index) => {
      const calibratedRgb = applyCalibrationToRgb(rgb, calibration[index]);
      return {
        id: index,
        start: strip.start,
        stop: strip.end + 1,
        col: [[calibratedRgb.r, calibratedRgb.g, calibratedRgb.b]],
        fx: nextEffect,
        sx: nextSpeed,
        ix: nextIntensity
      };
    });
  }

  function buildManualPayload(overrides = {}) {
    const next = {
      power,
      brightness,
      color,
      temperature,
      speed,
      intensity,
      effect,
      ...overrides
    };

    const rgb = hexToRgb(next.color);

    return {
      on: next.power,
      bri: next.brightness,
      seg: buildCalibratedSegments(rgb, next)
    };
  }

  function applyManual(overrides = {}) {
    sendToWled(buildManualPayload(overrides), "Manual state applied with calibration");
  }

  function applyTemperature() {
    const hex = rgbToHex(tempRgb.r, tempRgb.g, tempRgb.b);
    setColor(hex);
    sendToWled(buildManualPayload({ color: hex }), "Temperature applied with calibration");
  }

  function togglePower() {
    const nextPower = !power;
    setPower(nextPower);
    sendToWled({ on: nextPower }, nextPower ? "Lights on" : "Lights off");
  }

  function savePreset() {
    const name = presetName.trim() || `Preset ${presets.length + 1}`;
    const newPreset = {
      id: `${Date.now()}`,
      name,
      brightness,
      color,
      temperature,
      speed,
      intensity,
      effect
    };
    setPresets((prev) => [newPreset, ...prev]);
    setPresetName("");
  }

  function applyPreset(preset) {
    setBrightness(preset.brightness);
    setColor(preset.color);
    setTemperature(preset.temperature);
    setSpeed(preset.speed);
    setIntensity(preset.intensity);
    setEffect(preset.effect);
    setPower(true);
    sendToWled(
      buildManualPayload({
        power: true,
        brightness: preset.brightness,
        color: preset.color,
        temperature: preset.temperature,
        speed: preset.speed,
        intensity: preset.intensity,
        effect: preset.effect
      }),
      `${preset.name} applied with calibration`
    );
  }

  function deletePreset(id) {
    setPresets((prev) => prev.filter((preset) => preset.id !== id));
  }

  function updateCalibration(index, key, value) {
    setCalibration((prev) => {
      const next = normalizeCalibration(prev).map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return { ...item, [key]: clamp(value, 0, 200) };
      });
      return next;
    });
  }

  function resetCalibration() {
    setCalibration(defaultCalibration);
    setStatus({ type: "idle", message: "Calibration reset to 100%" });
  }

  function buildSingleStripPayload(stripIndex, rgb) {
    const segments = stripLayout.map((strip, index) => {
      const selected = index === stripIndex;
      const calibratedRgb = applyCalibrationToRgb(selected ? rgb : { r: 0, g: 0, b: 0 }, calibration[index]);
      return {
        id: index,
        start: strip.start,
        stop: strip.end + 1,
        col: [[calibratedRgb.r, calibratedRgb.g, calibratedRgb.b]],
        fx: 0,
        sx: speed,
        ix: intensity
      };
    });

    return {
      on: true,
      bri: brightness,
      seg: segments
    };
  }

  function testCalibrationStrip(index, rgb, label) {
    sendToWled(buildSingleStripPayload(index, rgb), `${stripLayout[index].name} ${label} test`);
  }

  function applyCalibrationToCurrentLook() {
    sendToWled(buildManualPayload(), "Calibration applied to current look");
  }

  function buildIndexPayload(indexes, rgb) {
    const items = [];
    indexes.forEach((unit) => {
      const stripIndex = getStripIndexForUnit(unit);
      const calibratedRgb = applyCalibrationToRgb(rgb, calibration[stripIndex]);
      items.push(unit, toHexColor(calibratedRgb));
    });

    return {
      on: true,
      bri: brightness,
      seg: {
        id: 0,
        start: 0,
        stop: LED_UNITS,
        i: items
      }
    };
  }

  function testSyncStep(pos = scanPosition) {
    const indexes = buildSyncIndexes(stripLayout, pos);
    sendToWled(buildIndexPayload(indexes, selectedRgb), `Lighting units ${indexes.join(", ")} with calibration`);
    const longestStrip = Math.max(...stripLayout.map((strip) => buildStripUnits(strip).length));
    setScanPosition((pos + 1) % longestStrip);
  }

  const activeIndexes = useMemo(() => {
    return new Set(buildSyncIndexes(stripLayout, scanPosition));
  }, [scanPosition]);

  return (
    <div className="min-h-screen bg-[#09090b] p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-6 shadow-2xl"
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-zinc-500">LightSync Control</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">WLED Lighting Console</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Manual control, temperature, intensity, speed, calibration, presets and strip mapping for your 52-unit addressable LED setup.
              </p>
              <p className="mt-2 text-xs text-emerald-300">Color order fixed in WLED: {WLED_COLOR_ORDER_NOTE}</p>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:w-96">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <StatusPill status={status} />
                <div className="flex gap-2">
                  <Button onClick={testConnection} className="rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10">
                    Test WLED
                  </Button>
                  <Button onClick={togglePower} className="rounded-full bg-white text-black hover:bg-zinc-200">
                    <Icon>⏻</Icon>
                    <span className="ml-2">{power ? "On" : "Off"}</span>
                  </Button>
                </div>
              </div>

              <input
                value={wledHost}
                onChange={(event) => setWledHost(event.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                placeholder="WLED host or IP"
              />

              <div className="grid grid-cols-3 gap-2">
                <Button onClick={() => setWledHost(HOTSPOT_HOST)} className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">
                  Hotspot
                </Button>
                <Button onClick={() => setWledHost(WLED_AP_HOST)} className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">
                  WLED-AP
                </Button>
                <Button onClick={() => setWledHost(LAST_LAN_HOST)} className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">
                  LAN IP
                </Button>
              </div>

              <p className="text-xs text-zinc-500">Current endpoint: {baseUrl}/json/state</p>
            </div>
          </div>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="rounded-[2rem] border-white/10 bg-zinc-950 text-white shadow-xl">
            <CardContent className="space-y-5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Manual Control</h2>
                  <p className="text-sm text-zinc-500">Use JSON API control for stable UI-driven lighting.</p>
                </div>
                <Icon>☰</Icon>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm text-zinc-200">Base Color</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-300">{color}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="color"
                      value={color}
                      onChange={(event) => setColor(event.target.value)}
                      onBlur={() => applyManual()}
                      className="h-14 w-20 cursor-pointer rounded-xl border border-white/10 bg-transparent"
                    />
                    <div className="flex-1">
                      <div className="h-14 rounded-2xl border border-white/10" style={{ backgroundColor: color, boxShadow: `0 0 36px ${color}55` }} />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-zinc-200">
                      <Icon>°</Icon>
                      <span>Temperature</span>
                    </div>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-300">{temperature}K</span>
                  </div>
                  <input
                    type="range"
                    min={1800}
                    max={9000}
                    step={100}
                    value={temperature}
                    onChange={(event) => setTemperature(Number(event.target.value))}
                    className="w-full accent-white"
                  />
                  <Button onClick={applyTemperature} className="mt-3 w-full rounded-xl bg-white text-black hover:bg-zinc-200">
                    Apply Temperature Color
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <SliderControl icon={<Icon>☀</Icon>} label="Intensity / Brightness" value={brightness} min={1} max={255} onChange={setBrightness} onCommit={() => applyManual()} />
                <SliderControl icon={<Icon>↻</Icon>} label="Effect Speed" value={speed} min={0} max={255} onChange={setSpeed} onCommit={() => applyManual()} />
                <SliderControl icon={<Icon>≈</Icon>} label="Effect Intensity" value={intensity} min={0} max={255} onChange={setIntensity} onCommit={() => applyManual()} />
                <SliderControl icon={<Icon>#</Icon>} label="Effect ID" value={effect} min={0} max={120} onChange={setEffect} onCommit={() => applyManual()} />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Button onClick={() => applyManual()} className="rounded-xl bg-white text-black hover:bg-zinc-200">
                  <Icon>▶</Icon>
                  <span className="ml-2">Apply Manual</span>
                </Button>
                <Button onClick={() => sendToWled({ on: false }, "Lights off")} className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">
                  Turn Off
                </Button>
                <Button onClick={() => sendToWled({ on: true, bri: brightness }, "Brightness applied")} className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">
                  Push Brightness
                </Button>
              </div>

              {status.message && (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-400">
                  {status.message}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-white/10 bg-zinc-950 text-white shadow-xl">
            <CardContent className="space-y-5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Presets</h2>
                  <p className="text-sm text-zinc-500">Save and recall lighting looks. Calibration is applied at playback.</p>
                </div>
                <Icon>★</Icon>
              </div>

              <div className="flex gap-2">
                <input
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  placeholder="Preset name, e.g. Darjeeling Sunset"
                />
                <Button onClick={savePreset} className="rounded-xl bg-white text-black hover:bg-zinc-200">
                  Save
                </Button>
              </div>

              <div className="grid gap-3">
                {presets.map((preset) => (
                  <motion.div
                    key={preset.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl border border-white/10" style={{ backgroundColor: preset.color, boxShadow: `0 0 20px ${preset.color}66` }} />
                      <div>
                        <p className="text-sm font-medium text-white">{preset.name}</p>
                        <p className="text-xs text-zinc-500">Bri {preset.brightness} · Speed {preset.speed} · Int {preset.intensity}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => applyPreset(preset)} className="rounded-xl bg-white px-3 text-black hover:bg-zinc-200">
                        Apply
                      </Button>
                      <Button onClick={() => deletePreset(preset.id)} className="rounded-xl border border-white/10 bg-transparent px-3 text-zinc-300 hover:bg-white/10">
                        ×
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[2rem] border-white/10 bg-zinc-950 text-white shadow-xl">
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Calibration</h2>
                <p className="text-sm text-zinc-500">Use this for small brightness and color fine-tuning after fixing BRG in WLED.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={applyCalibrationToCurrentLook} className="rounded-xl bg-white text-black hover:bg-zinc-200">
                  Apply Calibration
                </Button>
                <Button onClick={resetCalibration} className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">
                  Reset Calibration
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-400">
              Suggested workflow: since WLED color order is now BRG, red, green and blue should already match. Use RGB gain only if one strip is slightly warmer, cooler or tinted compared with the others.
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {stripLayout.map((strip, index) => (
                <CalibrationStripCard
                  key={strip.name}
                  strip={strip}
                  calibration={calibration[index]}
                  index={index}
                  onChange={updateCalibration}
                  onTestWhite={(stripIndex) => testCalibrationStrip(stripIndex, { r: 255, g: 255, b: 255 }, "white")}
                  onTestRed={(stripIndex) => testCalibrationStrip(stripIndex, { r: 255, g: 0, b: 0 }, "red")}
                  onTestGreen={(stripIndex) => testCalibrationStrip(stripIndex, { r: 0, g: 255, b: 0 }, "green")}
                  onTestBlue={(stripIndex) => testCalibrationStrip(stripIndex, { r: 0, g: 0, b: 255 }, "blue")}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-white/10 bg-zinc-950 text-white shadow-xl">
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Strip Mapping Test</h2>
                <p className="text-sm text-zinc-500">52 logical units arranged as 4 strips. Reversed strips are compensated in UI mapping.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {["manual", "preset", "calibrate", "live"].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setActiveMode(mode)}
                    className={`rounded-full px-4 py-2 text-sm capitalize transition ${activeMode === mode ? "bg-white text-black" : "border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-200">Synchronized scan test</p>
                  <p className="text-xs text-zinc-500">Because strips 2 and 4 are reversed, step 0 maps to 0/26/27/51 for the same visual side.</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => testSyncStep()} className="rounded-xl bg-white text-black hover:bg-zinc-200">
                    Test Next Step
                  </Button>
                  <Button onClick={() => setScanPosition(0)} className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10">
                    Reset
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {stripLayout.map((strip) => {
                  const visualUnits = buildStripUnits(strip);
                  return (
                    <div key={strip.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{strip.name}</p>
                          <p className="text-xs text-zinc-500">
                            Units {strip.start}–{strip.end} · {strip.direction}
                          </p>
                        </div>
                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-400">{strip.count} units</span>
                      </div>
                      <div className="grid grid-cols-7 gap-3 md:grid-cols-14">
                        {visualUnits.map((unit) => (
                          <LedDot key={unit} active={activeIndexes.has(unit)} color={color} label={unit} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <TestPanel tests={tests} />

        <Card className="rounded-[2rem] border-white/10 bg-zinc-950 text-white shadow-xl">
          <CardContent className="space-y-3 p-6">
            <h2 className="text-lg font-semibold">How to run this with WLED</h2>
            <div className="grid gap-3 text-sm text-zinc-400 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="mb-1 font-medium text-white">1. Same Wi-Fi</p>
                <p>For mobile hotspot mode, connect both laptop and WLED to the same phone hotspot.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="mb-1 font-medium text-white">2. Correct host</p>
                <p>For your hotspot setup, use wled-abhi.local. WLED-AP uses 4.3.2.1. Router Wi-Fi may use a numeric IP.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="mb-1 font-medium text-white">3. BRG in WLED</p>
                <p>Keep the color order as BRG in WLED LED Preferences. The app sends normal RGB color values.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
