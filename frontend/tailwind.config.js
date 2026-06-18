/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Pretendard'", "system-ui", "sans-serif"],
        display: ["'Syne'", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#0a0a0f",
        surface: "#12121a",
        card: "#1a1a26",
        accent: "#7c5cff",
        glow: "#ff6bcb",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.45s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
