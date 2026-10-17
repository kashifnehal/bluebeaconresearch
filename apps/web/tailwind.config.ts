import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Original custom properties for legacy compatibility
        surface_legacy: {
          DEFAULT: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          elevated: "var(--bg-elevated)",
          app: "var(--bg-app)",
        },
        border_legacy: { DEFAULT: "var(--border)", subtle: "var(--border-subtle)" },
        text_legacy: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        accent: {
          DEFAULT: "var(--interactive)",
          hover: "var(--interactive)",
          subtle: "var(--interactive-bg)",
        },
        // Amber: reserved for "new since your last visit" and the highest severity mark.
        amber: "var(--accent)",
        danger: { DEFAULT: "var(--danger)", subtle: "var(--danger-subtle)" },
        warning: { DEFAULT: "var(--warning)", subtle: "var(--warning-subtle)" },
        success: { DEFAULT: "var(--success)", subtle: "var(--success-subtle)" },
        price: { up: "var(--price-up)", down: "var(--price-down)" },
        
        // STITCH GENERATED EXACT TOKENS
        "inverse-primary": "#006c4a",
        "tertiary": "#ffdad7",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6",
        "on-tertiary-fixed-variant": "#7f2927",
        "on-tertiary-container": "#8e3432",
        "surface-container": "var(--bg-container)",
        "surface-variant": "var(--bg-highest)",
        "on-secondary-fixed": "#042100",
        "background": "var(--bg-primary)",
        "on-error": "#690005",
        "secondary-fixed": "#8efc67",
        "surface-container-low": "var(--bg-secondary)",
        "on-tertiary": "#611213",
        "surface-tint": "var(--interactive)",
        "secondary-container": "#3ba615",
        "inverse-surface": "#e5e2e1",
        "on-secondary-container": "#093100",
        "on-secondary-fixed-variant": "#145200",
        "surface-container-highest": "var(--bg-highest)",
        "primary": "var(--interactive)",
        "inverse-on-surface": "#313030",
        "on-background": "var(--text-primary)",
        "surface-dim": "var(--bg-primary)",
        "surface-container-lowest": "var(--bg-app)",
        "surface-container-high": "var(--bg-elevated)",
        "on-surface": "var(--text-primary)",
        "tertiary-fixed": "#ffdad7",
        "tertiary-container": "#ffb3ad",
        "on-primary-fixed": "#002114",
        "primary-container": "var(--interactive-bg)",
        "outline": "var(--text-muted)",
        "on-primary-container": "var(--on-interactive-bg)",
        "surface": "var(--bg-primary)",
        "secondary-fixed-dim": "#72df4d",
        "on-primary": "var(--bg-app)",
        "outline-variant": "var(--border)",
        "surface-bright": "var(--bg-highest)",
        "on-surface-variant": "var(--text-secondary)",
        "secondary": "var(--price-up)",
        "error": "var(--danger)",
        "primary-fixed": "var(--interactive)",
        "on-primary-fixed-variant": "#005236",
        "on-secondary": "#0b3900",
        "tertiary-fixed-dim": "#ffb3ae",
        "on-tertiary-fixed": "#410004",
        "primary-fixed-dim": "var(--interactive)"
      },
      fontFamily: {
        "headline": ["IBM Plex Sans", "system-ui", "sans-serif"],
        "body": ["IBM Plex Sans", "system-ui", "sans-serif"],
        "label": ["IBM Plex Sans", "system-ui", "sans-serif"],
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        story: ["Newsreader", "Georgia", "serif"],
        mono: ["IBM Plex Sans", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "0.25rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        full: "9999px",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
