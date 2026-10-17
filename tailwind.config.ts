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
      colors: {
        ops: {
          bg: "#0b0f19",
          card: "#111827",
          border: "#1f2937",
          hover: "#1e293b",
          text: "#f9fafb",
          muted: "#9ca3af",
          accent: "#3b82f6",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
