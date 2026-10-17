import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        card: "0 1px 2px 0 rgb(15 23 42 / 0.03), 0 4px 12px -2px rgb(15 23 42 / 0.06)",
        lift: "0 2px 4px -1px rgb(15 23 42 / 0.06), 0 10px 24px -4px rgb(15 23 42 / 0.10)",
        drawer: "-24px 0 48px -12px rgb(15 23 42 / 0.18)",
      },
      colors: {
        ops: {
          bg: "#f8fafc",
          card: "#ffffff",
          border: "#e2e8f0",
          hover: "#f1f5f9",
          text: "#0f172a",
          muted: "#64748b",
          accent: "#2563eb",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
