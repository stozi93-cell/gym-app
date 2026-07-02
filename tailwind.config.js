// tailwind.config.js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        neutral: {
          50: "#F8FAFC",
          100: "#E5EAF3",
          200: "#CBD5E1",
          300: "#AEB9CA",
          400: "#8B98AD",
          500: "#65748A",
          600: "#475569",
          700: "#26324A",
          800: "#1E2A44",
          900: "#121C3B",
          950: "#03060D",
        },
        brand: {
          blue: {
            50: "#EDF4FF",
            100: "#D9E8FF",
            300: "#79A7FF",
            500: "#1A5CFF",
            600: "#154BE0",
            700: "#123CAD",
            900: "#081430",
          },
          green: {
            50: "#EDFFE8",
            100: "#D8FFD1",
            300: "#7CE65B",
            500: "#29B300",
            700: "#187400",
            900: "#0C3D08",
          },
        },

        surface: {
          light: "#ffffff",
          dark: "#121C3B",
        },

        background: {
          light: "#f8fafc",
          dark: "#03060D",
        },

        border: {
          light: "#e5e7eb",
          dark: "#1E2A44",
        },

        text: {
          primaryLight: "#0f172a",
          secondaryLight: "#475569",
          primaryDark: "#F8FAFC",
          secondaryDark: "#AEB9CA",
        },
      },

      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },

      boxShadow: {
        premium: "0 18px 50px rgba(0, 0, 0, 0.35)",
        glow: "0 0 0 1px rgba(26, 92, 255, 0.2), 0 16px 40px rgba(26, 92, 255, 0.12)",
      },
    },
  },
};
