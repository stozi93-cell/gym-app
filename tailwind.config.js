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
        brand: {
          blue: {
            50: "#eef4ff",
            100: "#dbe8ff",
            300: "#7aa2e3",
            500: "#3b82f6",
            700: "#1e3a8a",
            900: "#0b1d4d",
          },
          green: {
            50: "#eefcf6",
            100: "#d6f5e6",
            300: "#6fcf97",
            500: "#22c55e",
            700: "#14532d",
            900: "#0b2e18",
          },
        },

        surface: {
          light: "#ffffff",
          dark: "#0f172a",
        },

        background: {
          light: "#f8fafc",
          dark: "#020617",
        },

        border: {
          light: "#e5e7eb",
          dark: "#1e293b",
        },

        text: {
          primaryLight: "#0f172a",
          secondaryLight: "#475569",
          primaryDark: "#e5e7eb",
          secondaryDark: "#94a3b8",
        },
      },

      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
    },
  },
};
