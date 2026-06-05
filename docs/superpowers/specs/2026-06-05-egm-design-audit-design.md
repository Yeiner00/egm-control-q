# EGM Admin — Design System Audit & Refactor Spec

**Date:** 2026-06-05
**Status:** Implemented
**Scope:** Design system + shared components
**Brief:** Sobria, seria, moderna. Consistente en toda la app, paridad light/dark.
**Skill applied:** `design-taste-frontend` v2 (Taste Skill)

## Design Read & Dials

Following Section 0 (Brief Inference) and Section 1 (Three Dials) of the Taste Skill:

> **Reading this as: redesign-preserve of a trust-first serious B2B admin panel for maritime operations (zarpes, vehicle/boat reports, statistics, Excel importer), with a sober navy + teal language, Manrope typography, and dual light/dark mode, leaning toward shadcn/ui tokens + restrained motion.**

| Dial | Value | Reasoning |
|---|---|---|
| `DESIGN_VARIANCE` | **3** | Internal admin, not a marketing page. Predictable, symmetrical grid; user scans fast. |
| `MOTION_INTENSITY` | **2** | Trust-first tool. No scrolltelling, no marquee, no GSAP. Hover/focus micro-interactions only. Honors `prefers-reduced-motion` by default. |
| `VISUAL_DENSITY` | **6** | Data-heavy dashboard. Standard web-app spacing (`py-4` to `py-8`). Cards used where they communicate real hierarchy; spacing/separators used otherwise. |

**Redesign mode (Section 11.A):** **Preserve.** Modernise the design system and shared components without changing information architecture, copy voice (Spanish, sober), brand identity (navy + teal, Manrope), or accessibility wins (focus states, contrast, keyboard nav). The brief is "sober, serious, modern and consistent" — that is a token-and-component job, not a greenfield.

**Why shadcn/ui (Section 2.A):** the project is "a modern SaaS where you own the components." shadcn/ui is the right call. The skill's honesty rule applies: customise radii, colors, shadows, typography. Never ship the default state. This spec is the customisation.

**Why not the rest of Section 2.A:** the project is not a Microsoft/Fluent, IBM/Carbon, Atlassian, or Shopify/Polaris surface. Do not introduce those.

## Scope of the Taste Skill applied to this spec

The Taste Skill is **explicitly out of scope for dashboards and admin panels** (Section 13). It is built for landing pages, portfolios, and marketing sites. We cherry-pick the principles that ARE universal and apply them here:

**Apply (universal):**

- The three Locks: Color Consistency Lock (Section 4.2), Shape Consistency Lock (Section 4.4), Page Theme Lock (Section 4.11).
- AI Tells (Section 9): em-dash ban, no Inter as default, no AI-purple, no three-equal-card features, no fake-perfect numbers, no generic Jane Doe / Acme names, no startup-slop filler verbs, no pure black/white.
- Dark Mode Protocol (Section 8): token strategy, hierarchy parity, brand fidelity, test in both modes.
- Audit-first protocol (Section 11.B) and Preservation rules (Section 11.C).
- Modernisation Levers in priority order (Section 11.D): typography → spacing → color → motion.
- Pre-Flight Check (Section 14), minus the marketing-only items.

**Do not apply (marketing-only):**

- Hero discipline (Section 4.7): no marketing hero here.
- Eyebrow restraint cap (Section 4.7): admin panels use eyebrows per section by convention; the cap is for marketing.
- Split-Header Ban, Zigzag Alternation Cap, Bento Cell Count Rule (Section 4.7): no marketing sections.
- Marquee max-one-per-page (Section 5): no marketing marquee.
- Liquid Glass / Magnetic / Kinetic / GSAP ScrollTrigger patterns (Sections 5, 5.A, 5.B): no scrolltelling in an admin.
- Premium-consumer palette ban (Section 4.2): the project is not premium-consumer.
- Hero stack discipline, Hero top padding cap, Hero font-scale discipline (Section 4.7): no marketing hero.
- Section-Layout-Repetition check (Section 4.7): admin tabs use the same layout family (panel + form) by design; not a marketing-page concern.

These are tracked so the spec does not accidentally import marketing-page constraints that hurt the admin.

## Background

EGM Admin is an internal operations panel for zarpes, vehicle/boat reports, statistics, and the V2 Excel importer. The codebase already invests in a tokenized design system (`hsl(var(--token))` in `src/index.css`, `tailwind.config.ts` extending the theme with `navy`, `teal`, `ocean`, etc.). Both light and dark modes are wired and toggled via `src/components/ThemeToggle.tsx`.

The Taste Skill v2 (`design-taste-frontend`, `~/.agents/skills/design-taste-frontend/`) was installed as a guide. Its three core "locks" are the lens for this audit:

- **Color Consistency Lock** — one accent across the page.
- **Shape Consistency Lock** — one corner-radius system per page.
- **Page Theme Lock** — light, dark, or auto; no mid-page flips.

The current design satisfies the spirit of these locks at a high level (navy + teal accent, Manrope, no AI-purple gradients, no marketing decoration), but the audit found real leaks that erode consistency and dark/light parity. This spec consolidates them.

## Audit findings

Ordered by impact. Each item is concrete and tied to a file or pattern.

### 1. shadcn primitives bypass the token system in dark mode

- `src/components/ui/button-variants.ts:8` — the `default` variant uses `dark:border-cyan-300/35 dark:bg-cyan-400/15 dark:text-cyan-50`. This works only because the dark `--primary` happens to be `193 84% 56%` (a cyan). Touch the token and the button drifts.
- `src/components/ui/tabs.tsx:30` — `TabsTrigger` uses `text-slate-500` and `dark:text-white/55` instead of the tokenized `text-muted-foreground` / `dark:text-muted-foreground`.

### 2. Raw Tailwind color palettes leak into feature components

- `src/components/HeaderMiniCalendar.tsx:117-118` — `red-200/red-500/red-700` and `blue-200/blue-500/blue-700` for the alfa/bravo shift markers. No token.
- `src/components/InicioTab.tsx` — `border-amber-300`, `bg-amber-400`, `bg-amber-300`, `bg-emerald-700` for holidays and approval badges. No token.
- `src/components/estadisticas/ProposalReportCard.tsx` and the matching CSS in `src/index.css:545-702` — `bg-slate-100`, `text-slate-800/700/500/400/300`, `bg-slate-50/70`, `border-slate-200/90` instead of `bg-muted` / `text-foreground` / `text-muted-foreground` / `border-border`.

### 3. `proposal-report-card` is broken in light mode

`src/index.css:546` sets `bg-white` for the light variant, while `.dark .proposal-report-card` at line 553 uses `bg-card` (the token). The card renders with a different base color in light vs. dark and the light variant is unaffected by future token changes.

### 4. Card-opacity and border-opacity noise

`bg-card/95`, `bg-card/96`, `bg-card/88`, `bg-card/82` coexist across components for no stated reason. `border-border/60`, `border-border/70`, `border-border/80` likewise. There is no documented elevation system.

### 5. Radius fragmentation

`--radius: 0.5rem` is the single source, but components use `0.28`, `0.3`, `0.32`, `0.34`, `0.36`, `0.42`, `0.46`, `0.5` rem. Eight micro-variants for what should be three or four intentional sizes.

### 6. Type-scale fragmentation

Thirteen one-off `text-[0.XXrem]` values between 0.65 and 1.3 rem across `src/components/` and `src/index.css`. No scale.

### 7. Page Theme Lock is broken

`--primary` is navy (`211 74% 23%`) in light and bright cyan (`193 84% 56%`) in dark. The brand identity changes when the user toggles the theme. The `.sidebar-brand-mark-compact` in `src/index.css:805-810` reinforces this by switching to `text-teal-light` only in dark. Per the Taste Skill, the page should have a single accent; the dark-mode swap is a workaround for contrast that should be tokenized instead.

### 8. Motion is not standardized

`transition-all duration-200`, `transition-colors duration-150`, `transition-[color,border-color,background-color] duration-200`, and `transition-[background-color,color,border-color,box-shadow,transform] duration-200` coexist with no shared duration or easing tokens.

### 9. Shadow elevations are not standardized

~15 ad-hoc `shadow-[0_Xpx_Ypx_-Zpx_...]` literals across `src/index.css` and component files. No `shadow-xs/sm/md/lg` set.

### 10. Squad / status colors are off-palette

The alfa/bravo shift markers and the holiday/approved states use raw red/blue/amber/emerald. They are domain-meaningful, so they should be tokens (`--squad-alfa`, `--squad-bravo`, `--state-*`), not raw colors.

## Goals

- One accent of brand identity in every mode (Page Theme Lock).
- All shared components in `src/components/` and the CSS in `src/index.css` use tokens; no raw `slate-/red-/blue-/amber-/emerald-/cyan-` outside `tailwind.config.ts` and the chrome (sidebar/top header `bg-navy` / `bg-slate-50`).
- Documented scales for type, radius, shadow, and motion.
- A light/dark parity checklist that anyone on the team can run.
- The skill Taste's three locks (color, shape, page theme) verifiable in the diff.

**Targeted evolution (Section 11.E):** the existing IA, content, and SEO of EGM Admin are sound. We apply Modernisation Levers 1-4 (typography → spacing → color → motion) from Section 11.D and stop. Levers 5 (hero recomposition) and 6 (full block replacement) are out of scope because there is no marketing surface to recompose, and the existing panels/forms are not "unsalvageable."

## Non-goals

- No new component library (no Radix Themes, no shadcn Blocks add-ons).
- No typography change (Manrope stays; Section 9.B bans Inter as default, and we are already on Manrope).
- No copy or content changes (Spanish strings stay; Section 11.C preservation rule).
- No per-tab redesign (out of scope for this iteration).
- No automated visual regression test in this iteration (mentioned as follow-up).
- No new motion patterns (Section 5.D: no `window.addEventListener("scroll", ...)` in React state, no scrolltelling, no marquee). We tokenize existing motion and stop.

## What never changes (Section 11.F)

Per the Taste Skill, the following are explicit preservation constraints. Any change to one of these needs explicit user approval, not a routine refactor.

- **Information architecture** — route slugs, primary nav labels, tab ordering, form field names and order (breaks analytics + autofill).
- **Brand identity** — navy + teal language, Manrope typography, the EGM Admin wordmark, the `Sidebar` logo treatment.
- **Copy voice** — Spanish, sober, operational. No filler verbs, no startup-speak.
- **Legal / consent / cookie copy** — already present in `Login.tsx` and any consent surface. Do not rewrite.
- **Accessibility wins already shipped** — focus-visible rings, keyboard nav in the calendar, contrast in the Login page. Do not regress.

## Design

### Section 1 — Token system & theme lock

#### 1.1 New tokens in `src/index.css`

Add to `:root` and `.dark` as appropriate. Values are HSL components to match the existing convention (`hsl(var(--token))`).

**Type scale** (replaces the 13 one-off `text-[0.XXrem]` values):

```css
--text-xs: 0.75rem;     /* 12px */
--text-sm: 0.875rem;    /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg: 1.125rem;    /* 18px */
--text-xl: 1.25rem;     /* 20px */
--text-2xl: 1.5rem;     /* 24px */
```

**Radius scale** (replaces the 8 micro-variants; satisfies the Shape Consistency Lock from Section 4.4):

```css
--radius-sm: 0.375rem;  /* 6px */
--radius-md: 0.5rem;    /* 8px — current --radius */
--radius-lg: 0.75rem;   /* 12px */
```

`--radius` is kept as an alias of `--radius-md` for backward compatibility with `border-radius: var(--radius)`.

Rule: components pick from the three documented sizes. Any new radius needs explicit justification in the PR description.

**Shadow scale** (replaces ~15 ad-hoc `shadow-[...]` literals):

```css
--shadow-xs: 0 1px 2px 0 hsl(214 38% 16% / 0.06);
--shadow-sm: 0 6px 16px -10px hsl(214 38% 16% / 0.18);
--shadow-md: 0 14px 32px -18px hsl(214 38% 16% / 0.32);
--shadow-lg: 0 24px 56px -28px hsl(214 38% 16% / 0.44);
```

Dark-mode overrides apply the same HSL hue with lower alpha (matches the existing `.dark` shadows).

**Motion** (tokenized to satisfy Section 5.D forbidden patterns and Section 6.B reduced-motion defaults):

```css
--motion-fast: 150ms;
--motion-base: 200ms;
--motion-slow: 300ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

Use rule (also enforced in Section 2.1):

- Color/border/background transitions: `--motion-fast` + `--ease-standard`.
- Transform/box-shadow transitions: `--motion-base` + `--ease-standard`.
- Layout transitions (rare): `--motion-slow` + `--ease-standard`.

Wrap any `MOTION_INTENSITY > 3` motion in a `prefers-reduced-motion` guard. Since this project sits at `MOTION_INTENSITY = 2`, the guard is optional, but the tokens make the upgrade path explicit.

**Status colors** (replaces raw `red-/amber-/emerald-`):

```css
:root {
  --state-success: 152 60% 40%;
  --state-success-fg: 0 0% 100%;
  --state-success-soft: 152 60% 92%;
  --state-warning: 38 92% 50%;
  --state-warning-fg: 0 0% 100%;
  --state-warning-soft: 38 92% 94%;
  --state-danger: 0 72% 51%;
  --state-danger-fg: 0 0% 100%;
  --state-danger-soft: 0 72% 95%;
  --state-info: 203 68% 42%;
  --state-info-fg: 0 0% 100%;
  --state-info-soft: 203 68% 94%;
}

.dark {
  --state-success: 152 50% 50%;
  --state-success-soft: 152 30% 18%;
  --state-warning: 38 90% 60%;
  --state-warning-soft: 38 30% 18%;
  --state-danger: 0 70% 60%;
  --state-danger-soft: 0 30% 20%;
  --state-info: 203 70% 60%;
  --state-info-soft: 203 30% 20%;
}
```

**Squad tokens** (replaces raw `red-200/.../red-700` and `blue-200/.../blue-700` in the calendar):

```css
:root {
  --squad-alfa: 0 72% 51%;
  --squad-alfa-soft: 0 72% 95%;
  --squad-alfa-fg: 0 72% 30%;
  --squad-bravo: 217 80% 48%;
  --squad-bravo-soft: 217 80% 95%;
  --squad-bravo-fg: 217 80% 28%;
}

.dark {
  --squad-alfa: 0 70% 65%;
  --squad-alfa-soft: 0 30% 22%;
  --squad-alfa-fg: 0 70% 85%;
  --squad-bravo: 217 80% 70%;
  --squad-bravo-soft: 217 30% 22%;
  --squad-bravo-fg: 217 80% 88%;
}
```

**Brand mark token** (centralizes the navy→teal asymmetry in the sidebar):

```css
:root { --brand-mark-fg: var(--primary); }
.dark { --brand-mark-fg: var(--teal-light); }
```

#### 1.2 Page Theme Lock decision (Section 4.11 + Section 4.2)

`--primary` stays as the brand accent in both modes. Currently dark `--primary` is cyan (`193 84% 56%`); we move that value to a new token `--primary-on-dark`. The rule becomes:

- In light mode, interactive elements (CTAs, active tabs, primary buttons) use `--primary` (navy).
- In dark mode, the same elements use `--primary-on-dark` (the cyan). Brand chrome (logo, app title, sidebar brand mark) uses `--primary` in both modes via the `--brand-mark-fg` token.

This satisfies the **Page Theme Lock** (Section 4.11) — one accent of brand identity across the page, no mid-page theme flip — and the **Color Consistency Lock** (Section 4.2) — one accent color used identically across sections (navy on chrome in both modes; the dark interactive token is a contrast-corrected variant of the same brand, not a second accent). Future theme changes update `--primary-on-dark` independently without touching the chrome.

#### 1.3 shadcn primitive migration

- `src/components/ui/button-variants.ts:8` — `default` variant:
  - Replace `dark:border-cyan-300/35 dark:bg-cyan-400/15 dark:text-cyan-50 dark:shadow-none dark:hover:border-cyan-300/45 dark:hover:bg-cyan-400/25` with `dark:border-[hsl(var(--primary-on-dark)/0.35)] dark:bg-[hsl(var(--primary-on-dark)/0.15)] dark:text-[hsl(var(--primary-on-dark))] dark:shadow-none dark:hover:border-[hsl(var(--primary-on-dark)/0.45)] dark:hover:bg-[hsl(var(--primary-on-dark)/0.25)]`.
  - The light side stays as-is (`bg-primary`, `text-primary-foreground`).
- `src/components/ui/tabs.tsx:30` — `TabsTrigger`:
  - Replace `text-slate-500` with `text-muted-foreground`.
  - Replace `dark:text-white/55` with `dark:text-muted-foreground`.
  - The active state (`data-[state=active]:text-primary`) is already tokenized; in dark, swap to `dark:data-[state=active]:text-[hsl(var(--primary-on-dark))]` to keep the high-contrast active color in dark.
  - The active border (`data-[state=active]:border-primary` / `dark:data-[state=active]:border-teal-light`) becomes `data-[state=active]:border-[hsl(var(--primary))] dark:data-[state=active]:border-[hsl(var(--primary-on-dark))]`.

### Section 2 — Component migration & parity

#### 2.1 Components to touch

- `src/components/HeaderMiniCalendar.tsx` — replace the `squadType === "alfa" / "bravo"` raw color classes with tokenized versions. Pattern:
  - `border-[hsl(var(--squad-alfa)/0.25)] bg-[hsl(var(--squad-alfa)/0.12)] text-[hsl(var(--squad-alfa-fg))]` for alfa; mirror for bravo.
  - Calendar cell `rounded-md` becomes `rounded-[calc(var(--radius-sm))]`.
- `src/components/InicioTab.tsx`:
  - Holiday optional → `border-[hsl(var(--state-warning)/0.55)] bg-[hsl(var(--state-warning)/0.18)]`.
  - Holiday obligatorio → `bg-[hsl(var(--state-warning))]`.
  - Approved badge → `bg-[hsl(var(--state-success))] text-[hsl(var(--state-success-fg))]`.
  - Rejected badge → `bg-muted text-muted-foreground`.
  - `rounded-full` for holiday chips becomes `rounded-[var(--radius-md)]`.
- `src/components/estadisticas/ProposalReportCard.tsx` + matching CSS in `src/index.css:545-702`:
  - Fix the `bg-white` light bug: change to `bg-card` (matches the dark variant).
  - Replace `bg-slate-100` with `bg-muted`, `text-slate-800/700` with `text-foreground`, `text-slate-500/400/300` with `text-muted-foreground`, `bg-slate-50/70` with `bg-muted/70`, `border-slate-200/90` with `border-border/70`.
  - The dark overrides (`.dark .proposal-report-station`, etc.) collapse into the unified rules because the underlying tokens flip with the theme.
- `src/components/estadisticas/ReportListRow.tsx` + CSS `.report-list-row*`:
  - `report-list-row-saved` uses `border-primary/30 bg-primary/5` → keep (tokenized).
  - `report-list-row-error` uses `border-destructive/55 bg-destructive/5` → keep (tokenized).
  - `report-list-tag` uses `bg-muted text-muted-foreground` → keep.
  - Card opacity variants: collapse `bg-card/95`, `bg-card/96`, `bg-card/88`, `bg-card/82` into three documented values (`bg-card`, `bg-card/80`, `bg-card/60`).
- `src/components/ThemeToggle.tsx` — already tokenized. No change.
- `src/index.css` cleanup (after the per-component migration):
  - Replace ad-hoc `rounded-[0.XXrem]` with `--radius-sm/md/lg` references.
  - Replace ad-hoc `shadow-[0_Xpx_Ypx_-Zpx_...]` with `--shadow-xs/sm/md/lg`.
  - Replace ad-hoc `transition-* duration-X` with the standardized rule: color/border/background transitions use `--motion-fast` (150ms) + `--ease-standard`; transform/box-shadow transitions use `--motion-base` (200ms) + `--ease-standard`; layout transitions (rare) use `--motion-slow` (300ms).
  - Collapse the card-opacity noise into three documented values.
  - Standardize the `data-table-head` to use `--primary` (table head is chrome, like the brand) instead of hard-coded `bg-navy`.
  - Standardize `.top-header` and `.panel-header` to the same surface token.

#### 2.2 Migration phases

Each phase ends with a visually verifiable state. Do not start the next phase until the previous one renders correctly in both modes.

1. **Tokens** — add the new tokens to `src/index.css` (no behavior change). Verify `npm run dev` and `npm run build` still pass.
2. **Primitives** — adjust `src/components/ui/button-variants.ts` and `src/components/ui/tabs.tsx` to use the new tokens. Visual diff should be near-zero; the goal is locking the dependency.
3. **Shared components** — migrate `HeaderMiniCalendar`, `InicioTab`, `ProposalReportCard`, `ReportListRow`, sidebar/top-header/panel CSS, and the rest of the shared-component set in `src/index.css`. This is the visually visible change.
4. **CSS cleanup** — collapse the radius, shadow, motion, and opacity noise. Mechanical pass.
5. **Parity sweep** — run the parity checklist below on every tab in both modes. Fix any drift.

#### 2.3 Parity checklist

Run on every tab (Inicio, Zarpes, Reportes, Estadísticas, Estadística) in both modes:

- One accent of brand identity visible at a time (navy in both modes for chrome; `--primary-on-dark` only for interactive elements in dark).
- WCAG AA contrast (4.5:1 for text, 3:1 for UI) verified for every token pair used by the tab. The check is manual with a single helper page (e.g., the `Login` page) rendered in both modes: the engineer reads through the tab and confirms every text token clears the threshold on its background. Automated contrast tooling is a follow-up.
- Title/body/caption hierarchy reads with the same weight in light and dark.
- Surface depth (background → card → panel) is the same in both modes.
- No raw `slate-`, `red-`, `blue-`, `amber-`, `emerald-`, `cyan-` outside `tailwind.config.ts`, `src/index.css` chrome (`bg-navy`, `bg-slate-50` for top-header/sidebar-rail), and any tokens we intentionally keep (none expected).

#### 2.4 Verification

- `npm run lint` — no new warnings.
- `npm run build` — no type errors, build succeeds.
- Manual visual sweep per the parity checklist.
- No new automated visual regression test in this iteration. A Playwright screenshot test for light/dark parity is listed as a follow-up.
- **Copy self-audit (Section 14):** re-read every visible string the change touches. Flag and rewrite filler verbs (elevate, seamlessly, unleash, etc.) and any AI-hallucinated phrasing. Spanish copy stays.
- **Em-dash sweep (Section 9.G):** `rg -nP '[\x{2014}\x{2013}]' src/` returns zero matches in the diff. (Already verified pre-spec.)
- **AI Tells sweep (Section 9):** `rg -nE '\\b(Inter|Acme|Jane Doe|elevate|seamlessly|unleash|cutting-edge|state-of-the-art|Quietly in use at)\\b' src/` returns no new matches. Acme/Inter defaults are not used; we are on Manrope, so this is a defensive check.
- **One design system per project (Section 14):** shadcn/ui only. No Material, Radix Themes, or Atlassian imports added.

## Pre-Flight Check (Section 14, admin-appropriate subset)

This is the gate before declaring a phase done. Marketing-only checks from the Skill's matrix (hero discipline, eyebrow cap, split-header ban, marquee, GSAP sticky-stack, etc.) are intentionally excluded — see "Scope of the Taste Skill applied to this spec" above.

**Universal checks (must pass every phase):**

- [ ] **Em-dash ban (Section 9.G):** zero `—` or `–` in the diff. Use hyphen, period, or comma.
- [ ] **No Inter as default (Section 9.B):** font stack still Manrope. No new font import.
- [ ] **Color Consistency Lock (Section 4.2):** no new accent color introduced. One navy on chrome, one `--primary-on-dark` for dark interactive elements.
- [ ] **Shape Consistency Lock (Section 4.4):** new radii pick from `--radius-sm/md/lg`. No new raw `rounded-[0.XXrem]`.
- [ ] **Page Theme Lock (Section 4.11):** no component conditionally inverts its own theme (e.g., a "dark card" inside the light page or vice versa).
- [ ] **No AI-purple / no glassmorphism slop (Section 9.A):** palette stays navy + teal; no `backdrop-blur` panels added in this iteration.
- [ ] **No pure black/white (Section 9.A):** chrome uses `bg-navy` + `bg-slate-50`; never `bg-black` or `bg-white` outside the Login page hero (already a one-off).
- [ ] **No Jane Doe / Acme / generic names (Section 9.D):** example data uses domain names (capitan, embarcacion, zarpe, mota) — already the case.
- [ ] **No startup-slop filler verbs (Section 9.D):** Spanish copy uses concrete verbs (crear, registrar, marcar, eliminar), not anglicisms.
- [ ] **One design system per project (Section 14):** shadcn/ui only. No Material or Polaris imports.
- [ ] **Empty/loading/error states (Section 14):** any new async surface has the three states. The current `Inbox`-style tab and `ReportUploader` already do; preserve.
- [ ] **Form contrast (Section 14):** new inputs/placeholders/focus rings clear WCAG AA 4.5:1 on the section background (manual check against the parity checklist).
- [ ] **Motion isolated in client-leaf + cleanup (Section 14):** the project does not use `useEffect`-driven scroll listeners, so this is N/A; new motion uses CSS transitions keyed to the motion tokens.

**Tailwind lints (run mechanically):**

- `rg -nP 'class="[^"]*\\b(bg|text|border|ring)-(slate|red|blue|amber|emerald|cyan|sky|teal|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+' src/components src/index.css` — only the chrome exceptions (`bg-navy`, `bg-slate-50` in `src/index.css` for the sidebar/top-header) should match. Any new hit in a feature component fails the check.
- `rg -nP 'rounded-\\[0-9' src/components src/index.css` — only `--radius-sm/md/lg` references or pre-existing values should match.
- `rg -nP 'shadow-\\[0_' src/components src/index.css` — only `--shadow-xs/sm/md/lg` references or pre-existing values should match.
- `rg -nP 'transition-\\[(color|background-color|border-color|box-shadow|transform)' src/components src/index.css` — should only appear in pre-existing utilities; new motion should use the tokenized shorthand.

## Risks & mitigations

- **Visual regressions in the primitives migration** (Phase 2). Mitigation: keep the change to two files; the visual should match the current behavior exactly because the new tokens resolve to the same HSL values.
- **CSS class churn is large** (Phases 3–4). Mitigation: do it in two passes per component (tokenize first, then dedupe). Run `npm run dev` between components to catch breaks early.
- **Squad colors are domain-specific** (alfa/bravo). Mitigation: keep the same hues (red/blue family) so the operational meaning does not change; only tokenize the values.

## Open follow-ups (out of scope for this iteration)

- Playwright screenshot test for light/dark parity, added to `playwright.config.ts`.
- Per-tab design polish (Inicio, Zarpes, Reportes, Estadísticas, Estadística) once the system is locked.
- Documentation page (Storybook-style) for the design tokens and shared components.
