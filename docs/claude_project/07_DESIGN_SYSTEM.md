# 07_DESIGN_SYSTEM.md — Visual Design System

**Classification: Internal — CTO Level**
**Theme: Dark-first terminal aesthetic. Bloomberg meets modern SaaS.**

---

## 1. DESIGN PHILOSOPHY

Every visual decision reinforces one idea: Blue Beacon Research is a **professional intelligence terminal**, not a consumer app. Users should feel like they're sitting in front of a Bloomberg terminal or a military operations center — serious, data-dense, trusted. The dark theme is non-negotiable. Traders spend hours looking at this. Dark reduces eye strain and signals professionalism.

The green accent (#10B981) was chosen deliberately: it is the color of "go," of active systems, of price-up movements — without being the clichéd finance red/green pair. It creates a distinctive brand identity.

---

## 2. COLOR TOKENS — CSS VARIABLES

All colors defined in `apps/web/app/globals.css` as CSS variables. Never use hex directly in components — always reference `var(--variable-name)` or the Tailwind mapping.

### Dark Mode (Default)

```css
:root {
  /* Backgrounds */
  --bg-app:       #050914;   /* Outermost page background */
  --bg-primary:   #0D1117;   /* Cards, modals, main content */
  --bg-secondary: #161B22;   /* Sidebar, inputs, subtle surfaces */
  --bg-elevated:  #1C2333;   /* Hover states, selected rows, tooltips */

  /* Borders */
  --border:        #2D3748;  /* All borders and dividers */
  --border-subtle: #1E2736;  /* Very subtle separators */

  /* Text */
  --text-primary:   #F8FAFC; /* Headings, important labels */
  --text-secondary: #94A3B8; /* Body text, descriptions */
  --text-muted:     #4B5563; /* Timestamps, metadata, captions */

  /* Accent (green — primary CTA, active states, success) */
  --accent:        #10B981;  /* Primary buttons, active nav, links */
  --accent-hover:  #059669;  /* Hover state for accent */
  --accent-subtle: #0D2B21;  /* Accent backgrounds, info banners */

  /* Blue accent (used for data, signals, info) */
  --blue:          #3B82F6;
  --blue-subtle:   #1D2D50;

  /* Danger (severity 9-10, errors, breaking alerts) */
  --danger:        #EF4444;
  --danger-subtle: #2D1B1B;

  /* Warning (severity 7-8, medium risk) */
  --warning:       #F59E0B;
  --warning-subtle:#2D2210;

  /* Success (correct signals, connected status, price up) */
  --success:       #10B981;
  --success-subtle:#0D2B21;

  /* Price colors */
  --price-up:   #34D399;    /* Commodity price increase */
  --price-down: #F87171;    /* Commodity price decrease */

  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
}
```

### Light Mode (data-theme="light")

```css
[data-theme="light"] {
  --bg-app:        #F0F4FF;
  --bg-primary:    #FFFFFF;
  --bg-secondary:  #F6F8FA;
  --bg-elevated:   #EAECEF;
  --border:        #D1D5DB;
  --border-subtle: #E5E7EB;
  --text-primary:  #0D1117;
  --text-secondary:#6B7280;
  --text-muted:    #9CA3AF;
  --accent:        #059669;
  --accent-hover:  #047857;
  --accent-subtle: #ECFDF5;
  --blue:          #2563EB;
  --blue-subtle:   #EFF6FF;
  --danger:        #DC2626;
  --danger-subtle: #FEF2F2;
  --warning:       #D97706;
  --warning-subtle:#FFFBEB;
  --success:       #059669;
  --success-subtle:#ECFDF5;
  --price-up:      #059669;
  --price-down:    #DC2626;
}
```

---

## 3. TAILWIND CSS MAPPING

In `tailwind.config.ts`, all CSS variables mapped to Tailwind classes:

```typescript
colors: {
  surface: {
    DEFAULT: 'var(--bg-primary)',
    secondary: 'var(--bg-secondary)',
    elevated: 'var(--bg-elevated)',
    app: 'var(--bg-app)',
  },
  border: {
    DEFAULT: 'var(--border)',
    subtle: 'var(--border-subtle)',
  },
  content: {
    primary: 'var(--text-primary)',
    secondary: 'var(--text-secondary)',
    muted: 'var(--text-muted)',
  },
  accent: {
    DEFAULT: 'var(--accent)',
    hover: 'var(--accent-hover)',
    subtle: 'var(--accent-subtle)',
  },
  danger: { DEFAULT: 'var(--danger)', subtle: 'var(--danger-subtle)' },
  warning: { DEFAULT: 'var(--warning)', subtle: 'var(--warning-subtle)' },
  success: { DEFAULT: 'var(--success)', subtle: 'var(--success-subtle)' },
  price: { up: 'var(--price-up)', down: 'var(--price-down)' },
}
```

---

## 4. SEVERITY COLOR MAP

Used consistently across signal cards, map markers, dashboard badges:

| Score | Label | Color | Subtle BG |
|-------|-------|-------|-----------|
| 10 | CRITICAL | #EF4444 | #2D1B1B |
| 9 | EXTREME | #F97316 | #2D1B10 |
| 8 | HIGH | #F59E0B | #2D2210 |
| 7 | ELEVATED | #EAB308 | #2D2610 |
| 4–6 | MEDIUM | #94A3B8 | #1C2333 |
| 1–3 | LOW | #4B5563 | #161B22 |

```typescript
// packages/shared/src/constants/severity-colors.ts
export const SEVERITY_CONFIG = {
  10: { label: 'CRITICAL', color: '#EF4444', bg: '#2D1B1B' },
  9:  { label: 'EXTREME',  color: '#F97316', bg: '#2D1B10' },
  8:  { label: 'HIGH',     color: '#F59E0B', bg: '#2D2210' },
  7:  { label: 'ELEVATED', color: '#EAB308', bg: '#2D2610' },
} as const
```

---

## 5. TYPOGRAPHY

### Font Families

```css
/* Display / UI font */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
font-feature-settings: 'cv11', 'ss01';
-webkit-font-smoothing: antialiased;

/* Monospace — prices, IDs, code, API keys, coordinates */
font-family: 'JetBrains Mono', 'Fira Code', monospace;
```

Both loaded from Google Fonts:
```
https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap
```

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| text-xs | 11px | 400 | 1.4 | Timestamps, metadata, chip labels |
| text-sm | 13px | 400 | 1.5 | Secondary body, table cells |
| text-base | 15px | 400 | 1.6 | Primary body text, card content |
| text-lg | 18px | 500 | 1.4 | Card titles, section headings |
| text-xl | 22px | 500 | 1.3 | Page headings (h2) |
| text-2xl | 28px | 600 | 1.2 | Dashboard page titles |
| text-3xl | 36px | 700 | 1.1 | Landing hero only |
| text-4xl | 48px | 700 | 1.0 | Tension Index score, key metrics |

### Typography Rules
- All caps (`text-transform: uppercase`) + letter-spacing-wide: section labels, nav items, badge labels
- font-mono: any number representing price, ID, code, coordinate, version
- Never use font-weight 800 or 900 — too heavy for terminal feel
- Body text max-width: 680px for readability in event detail page

---

## 6. SPACING SYSTEM

All spacing in multiples of 4px. Tailwind scale used directly.

| Value | px | Common usage |
|-------|----|-------------|
| 1 | 4px | Icon gap, tight padding |
| 2 | 8px | Element internal padding |
| 3 | 12px | Card padding compact |
| 4 | 16px | Standard card padding |
| 5 | 20px | Section gaps |
| 6 | 24px | Page content padding |
| 8 | 32px | Section separators |
| 12 | 48px | Large section gaps |
| 16 | 64px | Hero sections |

---

## 7. COMPONENT PATTERNS

### Cards
```
Standard card: bg-primary border border rounded-lg p-4
Elevated card: bg-elevated border border rounded-xl p-4
Danger card:   bg-danger-subtle border-danger/30 border rounded-lg p-4
Warning card:  bg-warning-subtle border-warning/30 border rounded-lg p-4
Info card:     bg-blue-subtle border-blue/30 border rounded-lg p-4
```

### Buttons

**Primary CTA (green):**
```
bg-accent text-black font-medium rounded-md h-10 px-4
hover:bg-accent-hover transition-colors duration-150
```

**Secondary (outline):**
```
border border bg-transparent text-content-primary rounded-md h-10 px-4
hover:bg-elevated transition-colors
```

**Destructive:**
```
bg-danger text-white rounded-md h-10 px-4
hover:bg-red-700
```

**Ghost (icon buttons):**
```
bg-transparent text-content-secondary rounded-md p-2
hover:bg-elevated hover:text-content-primary
```

**Disabled state:** opacity-50 cursor-not-allowed (all variants)

### Inputs
```
bg-secondary border border rounded-md h-10 px-3
text-content-primary placeholder:text-content-muted
focus:border-accent focus:ring-1 focus:ring-accent/30
transition-colors duration-150
```

### Badges / Pills
```
Rounded: rounded-full px-2.5 py-0.5 text-xs font-medium
Plan badge: bg-blue-subtle text-blue
Severity: see severity color map above
Status active: bg-success-subtle text-success
Status inactive: bg-secondary text-muted
```

### Skeleton Loading
```
animate-pulse bg-elevated rounded
```
Pattern: mimic the shape of the content that will load. Signal card skeleton = same dimensions as signal card.

---

## 8. LAYOUT GRID

**Dashboard layout:**
- Left sidebar: 200px fixed, full viewport height
- Content area: calc(100vw - 200px), padding: 24px
- Right sidebar (where present): 320px fixed, content area: calc(100vw - 200px - 320px)

**Responsive breakpoints:**
- < 768px (mobile): sidebar collapses completely, bottom nav appears
- 768–1024px (tablet): sidebar still visible, right panel hides
- > 1024px (desktop): full 3-column layout

**Signal feed grid:**
- 1 column: < 768px
- 2 columns: 768px–1280px
- 2 columns (with right sidebar): > 1280px

---

## 9. ANIMATION & MOTION

### Breaking alert pulse:
```css
@keyframes pulse-danger {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.animate-breaking { animation: pulse-danger 1s cubic-bezier(0.4,0,0.6,1) infinite; }
```

### Map marker pulse (active conflict zones):
```css
@keyframes map-pulse {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(2.5); opacity: 0; }
}
.map-marker::after {
  content: '';
  animation: map-pulse 2s ease-out infinite;
}
```

### Severity live dot (top of page):
```css
animation: pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;
```

### Card hover transition:
```css
transition: border-color 150ms ease, background-color 150ms ease;
```

### Toast notification: slide in from right, 300ms ease-out. Auto-dismiss 4 seconds.

### Panel slide-in (notification panel):
```css
transform: translateX(100%) → translateX(0); transition: 300ms ease-out;
```

---

## 10. ICONS

**Library:** Lucide React (consistent, minimal, professional)

Key icon → usage mapping:
```
Activity       → Intelligence Feed nav item
Globe          → Global Map nav item  
Bell           → Alerts nav item (with badge)
BarChart2      → Watchlist nav item
FlaskConical   → Backtesting nav item
Settings       → Settings nav item
AlertTriangle  → Error states, warning banners
Shield         → Sanctions matches, security
MapPin         → Location on signal cards
Clock          → Timestamps
Database       → Source count
ExternalLink   → Open article in new tab
Bookmark       → Save signal
Search         → Search bar
Volume2/VolumeX → Sound toggle
CalendarDays   → Economic Calendar (future)
Landmark       → Central bank rates
Siren          → Breaking alerts (animated pulse)
Globe2         → Empty state for feed
```

Icon sizes:
- Navigation items: 18px
- Card icons: 16px
- Empty state: 48px
- Error state: 40px
- Badge/chip icons: 12px

---

## 11. BRAND ELEMENTS

### Logo
Text logo: **"● BLUE BEACON RESEARCH"**
- ● dot: accent green (#10B981)
- "BLUE": white bold
- "BEACON": white bold
- "RESEARCH": slightly lighter weight

Alternative: **"BLUE BEACON"** with "RESEARCH" on second line (compact)

In nav sidebar: small text version, 16px, font-semibold
In landing page: large, 22px, font-semibold

### Terminal Aesthetic Elements (cosmetic)
These are design choices that reinforce the "intelligence terminal" feel:
- "Node: BB-ALPHA-09" in sidebar footer
- "SECURE NODE: BB-ALPHA-09 • V4.22.0" on login page
- "Terminal Sentinel v2.4.0-STABLE" in dashboard topbar
- "GENESIS-X_V4" on backtesting page
- "ACCESS_POINT: BB-ALPHA-09 | ENCRYPTION: AES-256 | SESSION_ID: xxxx" in settings footer
- Coordinates display (cosmetic, fake) on onboarding background
- Latency/uptime indicators on onboarding
- "DOWNLINK SYNC: NOMINAL" on alerts page

These elements have NO functional value but significantly enhance the perceived quality and seriousness of the platform. Do not remove them.

---

## 12. ACCESSIBILITY

Minimum requirements:
- Color contrast: 4.5:1 for text on dark backgrounds (WCAG AA)
- All interactive elements: visible focus ring (focus:ring-2 focus:ring-accent)
- Icon-only buttons: aria-label on all
- Form fields: label always associated with input
- Modal: focus trap inside modal when open, return focus on close
- Loading states: aria-busy="true" on loading containers
- Error messages: role="alert" for live announcements
- Screen reader: all images have alt text, decorative images alt=""

Note: The terminal aesthetic uses many cosmetic text elements that are not meaningful. These should have aria-hidden="true" to avoid polluting screen reader output.
