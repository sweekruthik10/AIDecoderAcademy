/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f4ff",
          100: "#dce8ff",
          200: "#b9d0ff",
          400: "#6b9eff",
          500: "#3b7bff",
          600: "#2563eb",
          700: "#1d4ed8",
          900: "#1e3a8a",
        },
        candy: {
          pink:   "#ff6eb4",
          yellow: "#ffd93d",
          mint:   "#6bcb77",
          purple: "#9b72cf",
          coral:  "#ff6b6b",
        },
      },
      fontFamily: {
        display: ["var(--font-syne)", "system-ui", "sans-serif"],
        body: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      animation: {
        "float": "float 3s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-8px)" },
        },
      },
      boxShadow: {
        "playful":    "0 8px 32px -4px rgba(59,123,255,0.18)",
        "card":       "0 2px 16px -2px rgba(0,0,0,0.10)",
        "card-hover": "0 8px 32px -4px rgba(0,0,0,0.14)",
      },
    },
  },
  plugins: [],
};
