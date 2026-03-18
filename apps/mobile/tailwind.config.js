/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surfaceApp: "#050914",
        surface: "#0D1117",
        surfaceSecondary: "#161B22",
        border: "#2D3748",
        textPrimary: "#F8FAFC",
        textSecondary: "#94A3B8",
        textMuted: "#4B5563",
        accent: "#3B82F6",
        danger: "#EF4444",
        warning: "#F59E0B",
        success: "#10B981",
        priceUp: "#34D399",
        priceDown: "#F87171",
      },
    },
  },
  plugins: [],
};

