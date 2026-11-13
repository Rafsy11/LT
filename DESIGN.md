# FiberOps Design System & Identity Direction

## 1. Identity & Mood

- **Product**: Lintasarta FTTH Single Source of Truth & Network Operations Console.
- **Target Audience**: Network Operations Center (NOC) engineers, field technician dispatchers, helpdesk supervisors, and ISP administrators.
- **Mood**: Technical, precise, operational clarity, reliable, no fluff.
- **Aesthetic Anchors**: Industrial telemetry, dense tabular layouts, high scannability.

---

## 2. Liveliness Dials

- **Dial**: `ENERGY 1 / RHYTHM 2 / MOTION 1`
  - **ENERGY 1 (Calm)**: Enterprise data density over decorative marketing flair; clean borders, calm backgrounds, clear hierarchy.
  - **RHYTHM 2 (Balanced)**: Consistent structural grid across pages with targeted layout variations for ODP matrixes, GIS maps, and telemetry tables.
  - **MOTION 1 (Calm/Functional)**: Transitions limited to meaningful state feedback (accordion expansion, modal popups, toast notifications, hover feedback). Zero distracting parallax or template bounce.

---

## 3. Color Tokens

- **Primary Brand**: `#0e5b92` (Lintasarta Deep Blue)
- **Primary Interactive**: `#1b5ca2` (Cobalt Blue)
- **Background Canvas**: `#f5f8fb` (Subtle Cool Grey-Blue)
- **Surface / Cards**: `#ffffff` with `#dce7f0` borders
- **Text Primary**: `#0f172a` (Slate 900 - Contrast 12.5:1 against canvas)
- **Text Secondary**: `#475569` (Slate 600 - Contrast 4.7:1 against canvas)
- **Telemetry Status Colors**:
  - Normal (Optimal): `#16a34a` (Green-600)
  - Warning (Degraded): `#d97706` (Amber-600)
  - Critical (Fault/Disconnected): `#dc2626` (Red-600)

---

## 4. Typography

- **Font Family**: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- **Telemetry / Monospace**: "JetBrains Mono", "SF Mono", monospace for numbers, attenuation dBm values, and SIA codes.
- **Scale**:
  - Page Title: 20px / 24px, SemiBold (600)
  - Section Heading: 15px / 20px, SemiBold (600)
  - Body Text: 13px / 18px, Regular (400)
  - Micro Data / Labels: 11px / 14px, Medium (500)

---

## 5. Geometry & Spacing

- **Corner Radius**:
  - Modals & Main Cards: 8px
  - Buttons & Inputs: 6px
  - Micro Badges & Chips: 4px
  - _Pill shapes (9999px) are avoided to maintain industrial enterprise consistency._
- **Grid Spacing**: 4px base increments (4px, 8px, 12px, 16px, 24px, 32px).
