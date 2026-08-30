import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Poppins", "Arial", "Helvetica Neue", "sans-serif"],
        display: ['"Bebas Neue"', "Arial Narrow", "sans-serif"],
        mono: ['"Courier Prime"', "Courier New", "monospace"],
      },
      colors: {
        "g-red": "#EA4335",
        "g-blue": "#4285F4",
        "g-yellow": "#FBBC05",
      },
    },
  },
  plugins: [],
};

export default config;
