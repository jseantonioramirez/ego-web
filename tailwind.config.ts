import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Poppins/Bebas Neue/Courier Prime eran la identidad "clínica" que
        // ya no encaja con la dirección cálida e inmersiva que estamos
        // construyendo (ver Sala EGO). Work Sans + Fraunces es el mismo
        // par tipográfico ya validado ahí.
        sans: ["Work Sans", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
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
