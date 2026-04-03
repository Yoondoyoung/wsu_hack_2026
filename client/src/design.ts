import type { CSSProperties } from "react";
import { ShieldAlert, GraduationCap, Volume2 } from "lucide-react";

// ── Color Palette ──
export const colors = {
  bg: "#0d1117",
  bgPanel: "rgba(22, 27, 34, 0.78)",
  bgPanelDense: "rgba(17, 22, 30, 0.86)",
  bgPanelMedium: "rgba(22, 27, 34, 0.84)",
  bgTooltip: "rgba(17, 22, 30, 0.95)",
  bgGradientFrom: "#111827",

  cyan: "#67e8f9",
  cyanLight: "#8beeff",
  emerald: "#10b981",
  blue: "#3b82f6",
  indigo: "#6366f1",
  yellow: "#f59e0b",
  red: "#ef4444",
  redSoft: "#f87171",

  white: "#ffffff",
  whiteMuted: "rgba(255,255,255,0.4)",
  whiteSubtle: "rgba(255,255,255,0.3)",
  whiteFaint: "rgba(255,255,255,0.1)",
  whiteDim: "rgba(255,255,255,0.08)",
  whiteTint: "rgba(255,255,255,0.06)",
  whiteSoft: "rgba(255,255,255,0.05)",

  border: "rgba(255,255,255,0.1)",
  borderInput: "rgba(255,255,255,0.12)",
} as const;

// ── Glassmorphism Styles ──
export const glass = {
  panel: {
    background: colors.bgPanel,
    backdropFilter: "blur(24px)",
    border: `1px solid ${colors.border}`,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  } as CSSProperties,

  panelDense: {
    background: colors.bgPanelDense,
    backdropFilter: "blur(32px)",
    border: `1px solid ${colors.border}`,
    boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
  } as CSSProperties,

  pill: {
    background: colors.bgPanelMedium,
    backdropFilter: "blur(20px)",
    border: `1px solid ${colors.border}`,
  } as CSSProperties,

  pillSmall: {
    background: colors.bgPanelMedium,
    backdropFilter: "blur(12px)",
    border: `1px solid ${colors.borderInput}`,
  } as CSSProperties,
} as const;

// ── Heatmap Layer Configs ──
export interface MapPoint {
  x: number;
  y: number;
}

export const HEATMAP_CONFIGS: Record<string, { color: string; points: MapPoint[] }> = {
  crime: {
    color: "255, 60, 60",
    points: [
      { x: 0.2, y: 0.3 },
      { x: 0.6, y: 0.7 },
      { x: 0.8, y: 0.2 },
    ],
  },
  schools: {
    color: "0, 220, 130",
    points: [
      { x: 0.3, y: 0.5 },
      { x: 0.7, y: 0.4 },
      { x: 0.5, y: 0.8 },
    ],
  },
  noise: {
    color: "255, 180, 0",
    points: [
      { x: 0.15, y: 0.4 },
      { x: 0.75, y: 0.55 },
      { x: 0.5, y: 0.2 },
    ],
  },
};

// ── Data Layer Definitions (for Left Panel toggles) ──
export const DATA_LAYERS = [
  { id: "crime", label: "Crime Hotspots", icon: ShieldAlert, color: colors.red },
  { id: "schools", label: "School Districts", icon: GraduationCap, color: colors.emerald },
  { id: "noise", label: "Noise Levels", icon: Volume2, color: colors.yellow },
] as const;

// ── Property Tag Styles ──
export const TAG_STYLES: Record<string, { bg: string; color: string }> = {
  "Quiet Zone": { bg: "rgba(0,220,130,0.12)", color: colors.emerald },
  "Top School": { bg: "rgba(100,140,255,0.12)", color: colors.blue },
  "Low risk": { bg: "rgba(0,220,130,0.14)", color: colors.emerald },
  "Moderate risk": { bg: "rgba(255,180,0,0.14)", color: colors.yellow },
  "High risk": { bg: "rgba(255,60,60,0.14)", color: colors.red },
};

// ── Gauge Colors ──
export const getGaugeColor = (val: number) => {
  if (val >= 75) return { main: colors.emerald, glow: "rgba(0,220,130,0.4)" };
  if (val >= 50) return { main: colors.yellow, glow: "rgba(255,180,0,0.4)" };
  return { main: colors.redSoft, glow: "rgba(255,64,96,0.4)" };
};

export const getGaugeLabel = (val: number) => {
  if (val >= 75) return "High Probability";
  if (val >= 50) return "Moderate Probability";
  return "Low Probability";
};

// ── Map Drawing Constants ──
export const mapColors = {
  gridStreet: "rgba(30, 45, 70, 0.6)",
  majorRoad: "rgba(40, 65, 100, 0.8)",
  building: "rgba(18, 28, 45, 0.9)",
} as const;

export const BUILDING_BLOCKS = [
  [0.1, 0.1, 0.08, 0.06],
  [0.3, 0.15, 0.12, 0.08],
  [0.55, 0.05, 0.06, 0.1],
  [0.75, 0.2, 0.1, 0.07],
  [0.15, 0.4, 0.09, 0.12],
  [0.4, 0.35, 0.15, 0.1],
  [0.65, 0.45, 0.08, 0.09],
  [0.85, 0.4, 0.07, 0.13],
  [0.05, 0.65, 0.11, 0.08],
  [0.25, 0.7, 0.13, 0.09],
  [0.5, 0.6, 0.07, 0.11],
  [0.7, 0.75, 0.1, 0.06],
  [0.9, 0.65, 0.06, 0.1],
  [0.35, 0.85, 0.09, 0.07],
  [0.6, 0.9, 0.12, 0.05],
] as const;

// ── CTA Button Style ──
export const ctaButtonStyle: CSSProperties = {
  background: `linear-gradient(135deg, ${colors.blue}, ${colors.cyan})`,
  color: colors.white,
  boxShadow: "0 4px 20px rgba(59,130,246,0.28)",
};

// ── Property Type ──
export interface PropertyMarkerData {
  id: number;
  x: number;
  y: number;
  price: string;
  beds: number;
  baths: number;
  sqft: number;
  address: string;
  image: string;
  tags: string[];
  gallery: string[];
}
