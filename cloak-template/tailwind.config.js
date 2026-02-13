/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cloak: {
          bg: "#0F172A",
          "bg-light": "#1E293B",
          card: "#1E293B",
          "card-hover": "#334155",
          border: "#334155",
          "border-light": "#475569",
          primary: "#3B82F6",
          "primary-hover": "#2563EB",
          "primary-dim": "#1D4ED8",
          accent: "#7C3AED",
          text: "#F8FAFC",
          "text-dim": "#94A3B8",
          muted: "#64748B",
          success: "#22C55E",
          warning: "#F59E0B",
          error: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
