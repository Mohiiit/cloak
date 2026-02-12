/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        cloak: {
          bg: "#0a0a0f",
          card: "#141420",
          border: "#1e1e30",
          primary: "#8b5cf6",
          "primary-hover": "#7c3aed",
          accent: "#06d6a0",
          danger: "#ef4444",
          muted: "#6b7280",
          text: "#e5e7eb",
          "text-dim": "#9ca3af",
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
