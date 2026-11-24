# DESIGN.md: Wise Scandinavian Studio Design System

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

Inspired by the design language of [Wise](https://wise.com) as documented in `DESIGN-wise.md`.

## 1. Identity & Character
- **Product:** Phone Studio, local YouTube smartphone comparison production suite.
- **Soul & Aesthetic:** Scandinavian fintech editorial magazine meets high-precision production deck.
- **Voice:** Calm, confident, ultra-legible, generous whitespace, friendly yet authoritative.
- **Key Signatures:**
  - **Wise Lime-Green CTA Accent (`#9fe870`):** The universal primary action color. Every primary button, badge highlight, and key conversion pill.
  - **Pale Sage Canvas (`#e8ebe6`):** The soothing page background surface that defines the entire mood of the interface.
  - **Pure White Rounded Cards (`#ffffff`):** Pill-rounded cards with generous `rounded-[24px]` sitting on the sage canvas. Surface contrast carries the elevation.
  - **Heavyweight Display Typography:** Display headlines set at weight 900 (`font-black`) with tight tracking. Body set in Inter (`font-normal` & `font-semibold`).
  - **Polarity-Flipped Dark Bands (`#0e0f0c`):** Near-black containers with lime-green text/accents for key highlights and the footer band.

## 2. Color Palette
- **Primary Accent (Wise Green):** `#9fe870`
- **Primary Hover (Wise Active):** `#cdffad`
- **Primary Neutral Fill:** `#c5edab`
- **Primary Pale (Badge Background):** `#e2f6d5`
- **Text & Near-Black (Ink):** `#0e0f0c` (near-black with subtle olive warmth)
- **Secondary Body Text:** `#454745`
- **Muted Text / Placeholder:** `#595c58` (WCAG AA 6.78:1 on white, 5.64:1 on sage)
- **Muted Text on Dark (`#0e0f0c`):** `#b8bcb4` (WCAG AA 9.97:1)
- **Surface (White Card):** `#ffffff`
- **Canvas (Sage Background):** `#e8ebe6`
- **Positive Deep:** `#054d28`
- **Warning Yellow:** `#ffd11a`
- **Warning Deep:** `#b86700`
- **Destructive Red:** `#d03238`

## 3. Shapes & Border Radius
- **Canonical Card & Button Radius:** `rounded-[24px]` (24px). Non-negotiable friendly fintech signature.
- **Pills & Status Badges:** `rounded-full` (9999px).
- **Form Inputs:** `rounded-[12px]` (12px).

## 4. Components
- **Primary CTA:** `bg-[#9fe870] hover:bg-[#cdffad] text-[#0e0f0c] font-bold rounded-full px-6 py-3 shadow-sm`
- **Secondary CTA:** `bg-[#ffffff] border border-[#0e0f0c] hover:bg-[#f6f7f5] text-[#0e0f0c] font-bold rounded-full px-5 py-2.5`
- **Cards:** `bg-[#ffffff] rounded-[24px] p-6 sm:p-8 border border-[#d5dbd1] shadow-sm`
- **Dark Feature Cards:** `bg-[#0e0f0c] text-white rounded-[24px] p-8 sm:p-10 shadow-md`
- **Positive Badge:** `bg-[#e2f6d5] text-[#054d28] font-bold px-3 py-1 rounded-full text-xs`
