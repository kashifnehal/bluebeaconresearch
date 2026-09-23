# Tactical Intelligence Terminal: Design System Documentation

## 1. Overview & Creative North Star

**Creative North Star: "The Kinetic Monolith"**
This design system moves beyond the standard SaaS dashboard to create a high-stakes, authoritative environment. It is modeled after tactical command centers where data density is a feature, not a bug. By rejecting the "soft" aesthetics of consumer apps—avoiding heavy shadows and rounded friendliness—we establish a visual language of precision, urgency, and absolute technical utility.

To break the "template" look, designers must embrace **Intentional Asymmetry**. Large-scale data visualizations should be flanked by ultra-compact control rails. Use the interplay of `JetBrains Mono` and `Inter` to create an "editorial-technical" hybrid: the headers tell the story, while the mono-spaced data provides the raw truth.

---

## 2. Colors & Surface Architecture

The palette is rooted in an "Absolute Dark" philosophy, utilizing Emerald Green (#4EDEA3) as a high-frequency signal against a void-like background.

### The "No-Line" Rule
Prohibit the use of 1px solid, high-contrast borders for sectioning. Boundaries must be defined through **Background Color Shifts**. For example, a `surface-container-low` section sitting on a `surface` background provides enough distinction for the eye without creating visual "clutter" lines.

### Surface Hierarchy & Nesting
Treat the UI as a series of nested physical layers. Use the following tokens to define importance:
- **Base Layer:** `surface-container-lowest` (#0E0E0E) – Use for the primary application canvas.
- **Mid Layer:** `surface` (#131313) – Use for primary sidebars or navigation rails.
- **Top Layer:** `surface-container` (#201F1F) – Use for active workspace cards and data modules.
- **Nesting Logic:** An inner data-grid within a card should use `surface-container-high` (#2A2A2A) to "lift" the data toward the user.

### Glass & Gradient Rule
On map-heavy screens or complex data visualizations, use **Glassmorphism** for floating overlays. Apply a 20px backdrop-blur to a 60% opaque `surface` color. This ensures the map data remains visible as a "ghost" under the UI, maintaining spatial awareness.
- **Signature Gradient:** For primary Action Buttons or Critical Data Points, use a linear gradient from `primary` (#6FFBBE) to `primary-container` (#4EDEA3) at a 135° angle to add "neon" depth. [Corrected 2026-09-23 — originally read #4EDE93, a typo; live `tailwind.config.ts` confirms #4EDEA3, matching every other reference to this token in this file.]

---

## 3. Typography

The typographic system creates a hierarchy of "Insight vs. Information."

| Level | Font Family | Case | Purpose |
| :--- | :--- | :--- | :--- |
| **Display** | Inter | Sentence | High-level system status or hero metrics. |
| **Headline** | Inter | Sentence | Section titles; bold, authoritative, and tight tracking. |
| **Label** | Space Grotesk | ALL CAPS | Metadata tags, categories, and small utility text. |
| **Data/Numeric** | JetBrains Mono | N/A | Prices, coordinates, timestamps, and ticker feeds. |

**The Identity Blend:** Use `Inter` for narrative elements to ensure readability, but switch to `JetBrains Mono` for any value that changes over time. This creates a "terminal" feel that signals to the user: "This information is live and tactical."

---

## 4. Elevation & Depth

In this system, depth is a product of **Tonal Layering**, not light sources.

- **The Layering Principle:** Avoid "Drop Shadows." To elevate a component, shift its background token one step higher (e.g., placing a `surface-container-highest` panel on a `surface-container-low` background).
- **Ambient Glow:** If a floating effect is required for a critical alert, use a tinted glow: a shadow with 0px offset, 15px blur, and 8% opacity using the `primary` color (#4EDEA3).
- **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline-variant` token at 20% opacity. Forbid 100% opaque borders; they shatter the "terminal" aesthetic.
- **Corner Radii:** Strictly adhere to the **8px (lg)** scale for containers and **4px (default)** for inputs. This "softened-sharp" look maintains a professional, military-grade feel without looking "beta."

---

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary-container`), black text, 4px radius. 
- **Secondary:** Transparent fill, 1px "Ghost Border" (outline-variant 30%), primary-colored text.
- **Tertiary:** No background, `Space Grotesk` uppercase text, subtle underline on hover.

### Tactical Chips
Used for filtering geo-tags. Use a sharp 2px radius. Selected state: `primary-container` background with `on-primary-container` text. Unselected: `surface-container-high` background.

### Input Fields
- **Default:** `surface-container-lowest` background with a bottom-only 1px border in `outline-variant`.
- **Focus:** Border transitions to `primary`. No "glow" effect—only a sharp color transition.
- **Data Entry:** Use `JetBrains Mono` for the input text to emphasize precision.

### Lists & Tables (Data Density)
Forbid divider lines between rows. Instead, use a subtle background hover state (`surface-bright`) and 0.4rem (2) vertical spacing to separate content. This maximizes data density while maintaining legibility.

### New Component: The "Status Ribbon"
A 2px tall horizontal bar placed at the top of a card, using the `primary` or `error` color to signal the health of the data within that module at a glance.

---

## 5a. Mobile Tap-Target Exception (added 2026-09-23)

This system's density principle ("DO keep layouts tight... users value information density over breathing room," §6) reads in tension with WCAG 2.2 SC 2.5.5's 44×44px target-size guidance for phone widths. Resolution: **density governs the visible box; the tap target does not have to match it.** Give every interactive element on a phone width a hit area of at least 44×44px that can extend past its rendered visual bounds (extra padding, a pseudo-element, or a negative-margin hit-slop), rather than inflating the row's visible height. A 13px-tall label can still sit inside a 44px-tall tappable row. This keeps the tactical density intact while meeting the target-size floor — treat it as settled, not something to re-decide per screen.

## 6. Do's and Don'ts

### Do
- **DO** use `JetBrains Mono` for all numeric coordinates and timestamps.
- **DO** use vertical whitespace (Scale 2 or 3) instead of horizontal lines to separate list items.
- **DO** overlap glassmorphic panels over maps to create a sense of software "depth."
- **DO** keep layouts tight; this is a pro tool, and users value information density over "breathing room."

### Don't
- **DON'T** use 100% opaque white text. Use `on-surface` (#E5E2E1) to reduce eye strain in dark environments.
- **DON'T** use standard Material Design drop shadows. If it doesn't look like a glowing screen, it doesn't belong.
- **DON'T** use rounded "pill" buttons. Stick to the 4px–8px range to maintain the "Tactical" brand pillar.
- **DON'T** use color for decoration. Every use of Emerald Green (#4EDEA3) must signify "Active," "Positive," or "Interactive."