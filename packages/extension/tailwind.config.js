/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        cloak: {
          bg: "#0A0F1C",
          "input-bg": "#0F172A",
          card: "#1E293B",
          "surface-light": "#334155",
          border: "rgba(59, 130, 246, 0.2)",
          "border-light": "rgba(148, 163, 184, 0.1)",
          primary: "#3B82F6",
          "primary-hover": "#2563EB",
          "primary-dim": "rgba(59, 130, 246, 0.15)",
          secondary: "#8B5CF6",
          "secondary-dim": "rgba(139, 92, 246, 0.15)",
          accent: "#10B981",
          success: "#10B981",
          danger: "#EF4444",
          warning: "#F59E0B",
          muted: "#64748B",
          text: "#F8FAFC",
          "text-dim": "#94A3B8",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
