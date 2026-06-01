/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          dark: "#0a0f1e",
          DEFAULT: "#0d1528",
          light: "#111e3a",
          card: "#162040",
        },
        gold: {
          DEFAULT: "#d4af37",
          light: "#f0c93b",
          muted: "rgba(212,175,55,0.15)",
        },
      },
      fontFamily: {
        poppins: ["Poppins", "sans-serif"],
        inter: ["Inter", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
