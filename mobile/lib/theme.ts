/** Shared palette and spacing, kept in step with the web app's Tailwind slate/amber scheme. */
export const colors = {
  ink: "#0f172a",
  inkSoft: "#1e293b",
  slate500: "#64748b",
  slate400: "#94a3b8",
  slate300: "#cbd5e1",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
  white: "#ffffff",
  amber: "#f59e0b",
  amberSoft: "#fef3c7",
  amberBorder: "#fcd34d",
  amberInk: "#92400e",
  amberTint: "#fffbeb",
  rose: "#f43f5e",
  roseSoft: "#ffe4e6",
  roseInk: "#9f1239",
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
