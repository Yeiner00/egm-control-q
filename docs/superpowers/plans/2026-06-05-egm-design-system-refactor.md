# EGM Admin Design System Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tokenize the EGM Admin design system, fix dark/light parity leaks, and align shared components to a single source of truth. No copy, IA, or brand changes. No new component library.

**Architecture:** Five sequential phases that each end in a visually verifiable state — (1) add tokens, (2) update shadcn primitives to use them, (3) migrate shared components, (4) dedupe CSS noise, (5) run the parity sweep and Pre-Flight Check. Each commit is a single, self-contained change.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind + shadcn/ui (already in use; do not add Radix Themes or shadcn Blocks). Manrope font (do not change). HSL CSS variables defined in `src/index.css` and consumed via `hsl(var(--token))`.

**Reference spec:** `docs/superpowers/specs/2026-06-05-egm-design-audit-design.md` (commits `e97f81b` and `acd453b`). Every task below traces back to a specific section of that spec.

**Constraints (do not violate):**

- The Taste Skill v2 is applied to this plan. The Pre-Flight Check in the spec is the gate. Do not skip it.
- Em-dash ban (Skill Section 9.G): zero `—` or `–` in any code or string you write. Use hyphen, period, or comma.
- No Inter as default (Skill Section 9.B): font stays Manrope.
- One design system (Skill Section 14): shadcn/ui only. No Material, Radix Themes, or Polaris imports.
- "What never changes" (Skill Section 11.F): no route slug, nav label, form field name/order, or Spanish copy change.

**Working tree conventions:**

- Branch: `main`. Commits are imperative-mood, one change per commit.
- Restart `npm run dev` after editing `api/*.ts` files (not relevant for this plan, but for context).

---

## Phase 1: Tokens

### Task 1.1: Add the new token set to `src/index.css`

**Files:**
- Modify: `src/index.css:1-60` (`:root` block) and `:60-...` (`.dark` block)

**Why:** This phase is the foundation. Every later phase depends on these tokens. No behavior change yet — purely additive.

- [ ] **Step 1: Read the current `:root` and `.dark` blocks**

Read `src/index.css` lines 1-80 to see the exact shape of the existing token block (grouping, comments, ordering). Match the style for the new tokens.

- [ ] **Step 2: Add the type, radius, shadow, and motion tokens to `:root`**

Inside the existing `:root { ... }` block (before the closing brace), add these tokens. Keep the existing tokens above untouched.

```css
/* --- Type scale --- */
--text-xs: 0.75rem;     /* 12px */
--text-sm: 0.875rem;    /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg: 1.125rem;    /* 18px */
--text-xl: 1.25rem;     /* 20px */
--text-2xl: 1.5rem;     /* 24px */

/* --- Radius scale (Shape Consistency Lock) --- */
--radius-sm: 0.375rem;  /* 6px */
--radius-md: 0.5rem;    /* 8px — current --radius */
--radius-lg: 0.75rem;   /* 12px */

/* --- Shadow scale --- */
--shadow-xs: 0 1px 2px 0 hsl(214 38% 16% / 0.06);
--shadow-sm: 0 6px 16px -10px hsl(214 38% 16% / 0.18);
--shadow-md: 0 14px 32px -18px hsl(214 38% 16% / 0.32);
--shadow-lg: 0 24px 56px -28px hsl(214 38% 16% / 0.44);

/* --- Motion --- */
--motion-fast: 150ms;
--motion-base: 200ms;
--motion-slow: 300ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

`--radius` is left as the existing alias of `--radius-md` (or set it explicitly to `var(--radius-md)` for clarity, if the existing definition uses a raw value).

- [ ] **Step 3: Add the status colors to `:root` and `.dark`**

Append to `:root`:

```css
/* --- Status colors --- */
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
```

Append to `.dark`:

```css
--state-success: 152 50% 50%;
--state-success-soft: 152 30% 18%;
--state-warning: 38 90% 60%;
--state-warning-soft: 38 30% 18%;
--state-danger: 0 70% 60%;
--state-danger-soft: 0 30% 20%;
--state-info: 203 70% 60%;
--state-info-soft: 203 30% 20%;
```

- [ ] **Step 4: Add the squad and brand mark tokens**

Append to `:root`:

```css
/* --- Squad tokens (domain meaning preserved) --- */
--squad-alfa: 0 72% 51%;
--squad-alfa-soft: 0 72% 95%;
--squad-alfa-fg: 0 72% 30%;
--squad-bravo: 217 80% 48%;
--squad-bravo-soft: 217 80% 95%;
--squad-bravo-fg: 217 80% 28%;

/* --- Brand mark (Page Theme Lock) --- */
--brand-mark-fg: var(--primary);
--primary-on-dark: 193 84% 56%;
```

Append to `.dark`:

```css
--squad-alfa: 0 70% 65%;
--squad-alfa-soft: 0 30% 22%;
--squad-alfa-fg: 0 70% 85%;
--squad-bravo: 217 80% 70%;
--squad-bravo-soft: 217 30% 22%;
--squad-bravo-fg: 217 80% 88%;
--brand-mark-fg: var(--teal-light);
```

> **Important:** the previous dark `--primary` value (`193 84% 56%`) is now duplicated in `--primary-on-dark`. The next phase (Task 1.2) moves the value out of `--primary` and into `--primary-on-dark` only.

- [ ] **Step 5: Verify the build still passes**

Run:

```bash
npm run build
```

Expected: build succeeds with no new warnings. (The build does not consume the new tokens yet, so this is a sanity check that no token names collide with existing ones.)

- [ ] **Step 6: Commit**

```bash
git add src/index.css
git commit -m "Add design system tokens (type, radius, shadow, motion, status, squad, brand mark)"
```

### Task 1.2: Move the dark `--primary` value into `--primary-on-dark`

**Files:**
- Modify: `src/index.css` `.dark` block where `--primary` is defined

**Why:** Spec Section 1.2 — `--primary` stays navy in both modes for brand identity; the cyan that was on dark `--primary` becomes `--primary-on-dark` and is used by interactive elements only.

- [ ] **Step 1: Find the dark `--primary` line**

Run:

```bash
grep -n "^\s*--primary:" src/index.css
```

There are two hits: one in `:root` (navy) and one in `.dark` (cyan). Target the `.dark` one.

- [ ] **Step 2: Replace the dark `--primary` line with `--primary-on-dark`**

If the current dark line is:

```css
--primary: 193 84% 56%;
```

Replace it with:

```css
--primary-on-dark: 193 84% 56%;
```

Do not touch the `:root` `--primary` line. Do not touch any other reference to `--primary` in this task — those are addressed in Phase 2.

- [ ] **Step 3: Verify the build still passes**

Run:

```bash
npm run build
```

Expected: build succeeds. Visual drift in dark mode is expected and will be fixed in Phase 2 (primitive migration) and Phase 3 (shared components). Do not attempt to fix visual drift here.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "Move dark --primary value into --primary-on-dark token"
```

---

## Phase 2: shadcn primitives

### Task 2.1: Tokenize the button `default` variant dark mode

**Files:**
- Modify: `src/components/ui/button-variants.ts:8`

**Why:** Spec Section 1.3 — the dark `default` variant hard-codes cyan because dark `--primary` happened to be cyan. After Task 1.2, dark `--primary` is now navy, so the button will render incorrectly until we point it at `--primary-on-dark`.

- [ ] **Step 1: Read the file**

Read `src/components/ui/button-variants.ts` to see the exact current state of the `default` variant.

- [ ] **Step 2: Replace the dark classes in the `default` variant**

Find the line that contains:

```ts
"dark:border-cyan-300/35 dark:bg-cyan-400/15 dark:text-cyan-50 dark:shadow-none dark:hover:border-cyan-300/45 dark:hover:bg-cyan-400/25"
```

Replace it with:

```ts
"dark:border-[hsl(var(--primary-on-dark)/0.35)] dark:bg-[hsl(var(--primary-on-dark)/0.15)] dark:text-[hsl(var(--primary-on-dark))] dark:shadow-none dark:hover:border-[hsl(var(--primary-on-dark)/0.45)] dark:hover:bg-[hsl(var(--primary-on-dark)/0.25)]"
```

The light side (`bg-primary text-primary-foreground ...`) stays as-is.

- [ ] **Step 3: Verify the build passes**

Run:

```bash
npm run build
```

Expected: build succeeds. The button should look identical to before in both modes (since the new tokens resolve to the same HSL values the old hard-coded cyan used).

- [ ] **Step 4: Manual visual check**

Start the dev server (`npm run dev`), open any page that uses a primary `Button` in dark mode (e.g., the Login page), and confirm the button border, background, and text colors match the prior look. Toggle to light and confirm the navy button is unchanged.

- [ ] **Step 5: Run the Tailwind lint from the Pre-Flight Check**

```bash
rg -nP 'class="[^"]*\b(bg|text|border|ring)-(slate|red|blue|amber|emerald|cyan|sky|teal|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+' src/components src/index.css
```

Expected: only the chrome exceptions (sidebar/top-header `bg-navy`/`bg-slate-50` in `src/index.css`) match. The modified button file should not match (it now uses `hsl(var(--primary-on-dark)/...)`).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/button-variants.ts
git commit -m "Tokenize button default variant dark mode (--primary-on-dark)"
```

### Task 2.2: Tokenize the tabs trigger muted text and dark active state

**Files:**
- Modify: `src/components/ui/tabs.tsx:30`

**Why:** Spec Section 1.3 — `TabsTrigger` uses raw `text-slate-500` and `dark:text-white/55`; the active state also leaks raw teal in dark.

- [ ] **Step 1: Read the file**

Read `src/components/ui/tabs.tsx` to find the `TabsTrigger` class string.

- [ ] **Step 2: Replace the muted text and active classes**

Find and replace the relevant classes inside the `TabsTrigger` className. Apply this single replacement block:

Before:

```ts
"text-slate-500 data-[state=active]:text-primary data-[state=active]:border-primary dark:text-white/55 dark:data-[state=active]:border-teal-light"
```

After:

```ts
"text-muted-foreground data-[state=active]:text-[hsl(var(--primary))] data-[state=active]:border-[hsl(var(--primary))] dark:text-muted-foreground dark:data-[state=active]:text-[hsl(var(--primary-on-dark))] dark:data-[state=active]:border-[hsl(var(--primary-on-dark))]"
```

(Adjust any other parts of the TabsTrigger className that you find matching this pattern; do not touch unrelated parts like `data-[state=active]:shadow-sm`.)

- [ ] **Step 3: Verify the build passes**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Manual visual check**

Open a page that uses `Tabs` (e.g., the Inicio tab) in both modes. Confirm the inactive tab text is muted but readable, and the active tab border + text are correct in both modes (navy in light, cyan in dark).

- [ ] **Step 5: Run the Tailwind lint**

```bash
rg -nP 'class="[^"]*\b(bg|text|border|ring)-(slate|red|blue|amber|emerald|cyan|sky|teal|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+' src/components src/index.css
```

Expected: no new matches in `src/components/ui/tabs.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/tabs.tsx
git commit -m "Tokenize tabs trigger muted text and dark active state"
```

---

## Phase 3: Shared components

### Task 3.1: Tokenize `HeaderMiniCalendar` squad markers and radius

**Files:**
- Modify: `src/components/HeaderMiniCalendar.tsx:117-118`

**Why:** Spec Section 2.1 — replace raw `red-200/.../red-700` and `blue-200/.../blue-700` with `--squad-alfa` / `--squad-bravo` tokens. Calendar cells also use `rounded-md` which becomes the new radius token.

- [ ] **Step 1: Read the relevant lines**

Read `src/components/HeaderMiniCalendar.tsx` around lines 117-118 and any other location that maps `squadType` to raw Tailwind colors. Search for the `squadType` and `red-` / `blue-` patterns:

```bash
rg -n 'red-[0-9]|blue-[0-9]|squadType' src/components/HeaderMiniCalendar.tsx
```

- [ ] **Step 2: Build a small mapping table for the squad tokens**

The current raw classes map to tokens as follows:

| Raw (light) | Tokenized (light) |
|---|---|
| `border-red-200 bg-red-50 text-red-700` | `border-[hsl(var(--squad-alfa)/0.25)] bg-[hsl(var(--squad-alfa-soft))] text-[hsl(var(--squad-alfa-fg))]` |
| `border-blue-200 bg-blue-50 text-blue-700` | `border-[hsl(var(--squad-bravo)/0.25)] bg-[hsl(var(--squad-bravo-soft))] text-[hsl(var(--squad-bravo-fg))]` |
| `bg-red-500` (dot) | `bg-[hsl(var(--squad-alfa))]` |
| `bg-blue-500` (dot) | `bg-[hsl(var(--squad-bravo))]` |

> If the current code uses different shades than the table above, the token `--squad-alfa` HSL value was chosen to match `red-500` / `red-700` / `red-200` family. Trust the mapping and apply it consistently; visual hue should be very close to before.

- [ ] **Step 3: Apply the mapping**

Replace each occurrence of the raw `red-/blue-` classes with the corresponding tokenized form from the table above. Be exhaustive — every dot, border, background, and text that depends on `squadType` must be tokenized.

- [ ] **Step 4: Replace `rounded-md` on calendar cells**

The Shape Consistency Lock says radii pick from `--radius-sm/md/lg`. Calendar cells stay at `--radius-md` (which is the current `--radius` value, so `rounded-md` is acceptable, or use `rounded-[var(--radius-md)]` if you want the explicit reference).

If the file uses any one-off `rounded-[0.XXrem]`, replace with `rounded-[var(--radius-sm)]`, `rounded-[var(--radius-md)]`, or `rounded-[var(--radius-lg)]` as appropriate.

- [ ] **Step 5: Verify the build passes**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Manual visual check**

Open the Inicio tab in both modes. The alfa/bravo shift markers should be the same hues as before (red family for alfa, blue family for bravo) with the same dark-mode behaviour.

- [ ] **Step 7: Run the Tailwind lint**

```bash
rg -nP 'class="[^"]*\b(bg|text|border|ring)-(red|blue)-[0-9]+' src/components/HeaderMiniCalendar.tsx
```

Expected: no matches.

- [ ] **Step 8: Commit**

```bash
git add src/components/HeaderMiniCalendar.tsx
git commit -m "Tokenize HeaderMiniCalendar squad markers (squad-alfa, squad-bravo)"
```

### Task 3.2: Tokenize `InicioTab` holiday/approved states and radius

**Files:**
- Modify: `src/components/InicioTab.tsx`

**Why:** Spec Section 2.1 — replace raw `amber-/emerald-` for holidays and approval with `--state-warning` and `--state-success` tokens.

- [ ] **Step 1: Find raw color usage**

```bash
rg -n 'amber-[0-9]|emerald-[0-9]' src/components/InicioTab.tsx
```

- [ ] **Step 2: Build a mapping table**

| Raw | Tokenized |
|---|---|
| `border-amber-300` | `border-[hsl(var(--state-warning)/0.55)]` |
| `bg-amber-400` | `bg-[hsl(var(--state-warning))]` |
| `bg-amber-300` | `bg-[hsl(var(--state-warning))]` |
| `bg-emerald-700` | `bg-[hsl(var(--state-success))]` |
| `text-amber-50/900` (legends) | `text-[hsl(var(--state-warning-fg))]` / `text-[hsl(var(--state-warning-soft))]` — pick the closest semantic match; if the original was a dark amber on a light chip, use `--state-warning-soft` background with default text. |
| Rejected badge `bg-muted text-muted-foreground` | keep (already tokenized) |

- [ ] **Step 3: Apply the mapping and update holiday chip radius**

Holiday chips currently use `rounded-full`; spec says `rounded-[var(--radius-md)]`. Update accordingly.

- [ ] **Step 4: Verify build, visual, lint**

```bash
npm run build
```

Manual check: open Inicio tab; holiday dots and approval/rejection badges match prior hues in both modes.

```bash
rg -nP 'class="[^"]*\b(bg|text|border|ring)-(amber|emerald)-[0-9]+' src/components/InicioTab.tsx
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/components/InicioTab.tsx
git commit -m "Tokenize InicioTab holiday and approval state colors"
```

### Task 3.3: Fix `proposal-report-card` `bg-white` bug and tokenize

**Files:**
- Modify: `src/index.css:545-702` (the `.proposal-report-card*` rules)
- Modify: `src/components/estadisticas/ProposalReportCard.tsx` (Tailwind classes that bypass tokens)

**Why:** Spec Section 2.1 and Audit finding #3. The light variant of the card uses `bg-white` while dark uses `bg-card`; the card renders with a different base in light vs. dark. Plus, raw `slate-100/.../slate-50/.../slate-200/...` classes are scattered across the component.

- [ ] **Step 1: Read the CSS rules**

Read `src/index.css` lines 545-702 to see the exact `proposal-report-card*` rules.

- [ ] **Step 2: Fix the `bg-white` light variant**

Find the rule that contains `bg-white` for `proposal-report-card` (or its inner stations). Replace `bg-white` with `bg-card`. If there are several inner stations (`.proposal-report-station`, etc.), apply the same fix to each.

- [ ] **Step 3: Tokenize raw slate classes in the component**

Read `src/components/estadisticas/ProposalReportCard.tsx`. Build a mapping:

| Raw | Tokenized |
|---|---|
| `bg-slate-100` | `bg-muted` |
| `text-slate-800`, `text-slate-700` | `text-foreground` |
| `text-slate-500`, `text-slate-400`, `text-slate-300` | `text-muted-foreground` |
| `bg-slate-50/70` | `bg-muted/70` |
| `border-slate-200/90` | `border-border/70` |

Apply the mapping exhaustively to the file. The dark overrides in the CSS (`.dark .proposal-report-station`, etc.) collapse into the unified rules because the underlying tokens flip with the theme; keep the dark overrides only if they have semantic intent beyond the token flip.

- [ ] **Step 4: Verify build, visual, lint**

```bash
npm run build
```

Manual check: open the Estadísticas tab; the proposal cards should have the same surface in both light and dark, and the slate text/background hues should match the prior look.

```bash
rg -nP 'class="[^"]*\b(bg|text|border|ring)-slate-[0-9]+' src/components/estadisticas/ProposalReportCard.tsx
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/components/estadisticas/ProposalReportCard.tsx
git commit -m "Fix proposal-report-card bg-white bug and tokenize slate classes"
```

### Task 3.4: Collapse card opacity variants in `ReportListRow`

**Files:**
- Modify: `src/index.css` `.report-list-row*` rules and `src/components/estadisticas/ReportListRow.tsx`

**Why:** Spec Section 2.1 — `bg-card/95`, `bg-card/96`, `bg-card/88`, `bg-card/82` coexist for no reason. Collapse to three documented values.

- [ ] **Step 1: Find all card-opacity variants**

```bash
rg -n 'bg-card/' src/components/estadisticas/ReportListRow.tsx src/index.css
```

- [ ] **Step 2: Map each variant to one of the three documented values**

The three documented values are: `bg-card` (no opacity), `bg-card/80`, `bg-card/60`. Map as follows (use judgement if a specific variant is intentional, but the default is to collapse):

| Found | Replace with |
|---|---|
| `bg-card/95`, `bg-card/96` | `bg-card` (effectively opaque) |
| `bg-card/88` | `bg-card/80` |
| `bg-card/82` | `bg-card/80` |

If any variant is intentionally below 80, leave it as `bg-card/60` and note why in the commit message.

- [ ] **Step 3: Verify build, visual, lint**

```bash
npm run build
```

Manual check: open the Reportes tab; list rows have visually equivalent surface in both modes.

```bash
rg -nP 'class="[^"]*\bbg-card/(8[0-9]|9[0-9])' src/components/estadisticas/ReportListRow.tsx src/index.css
```

Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add src/components/estadisticas/ReportListRow.tsx src/index.css
git commit -m "Collapse report-list-row card opacity variants to three documented values"
```

### Task 3.5: Standardize sidebar, top-header, panel, and data-table-head chrome

**Files:**
- Modify: `src/index.css` (sidebar rules, `.top-header`, `.panel-header`, `.data-table-head`, `.sidebar-brand-mark-compact`)

**Why:** Spec Section 2.1 — sidebar brand mark switches to teal only in dark (asymmetry); `data-table-head` hard-codes `bg-navy`; the top-header and panel-header should share a single surface token.

- [ ] **Step 1: Read the relevant CSS rules**

```bash
rg -n 'data-table-head|sidebar-brand-mark-compact|top-header|panel-header' src/index.css
```

- [ ] **Step 2: Apply the four changes**

Change A — `data-table-head` uses `--primary` (chrome, like the brand):

Find:

```css
.data-table-head { background: hsl(var(--navy)); ... }
```

Replace `hsl(var(--navy))` with `hsl(var(--primary))`. The hue is the same (navy), but tokenising it makes the rule theme-aware.

Change B — `sidebar-brand-mark-compact` uses `--brand-mark-fg`:

Find:

```css
.sidebar-brand-mark-compact { color: hsl(var(--primary)); }
.dark .sidebar-brand-mark-compact { color: hsl(var(--teal-light)); }
```

Replace both rules with a single one:

```css
.sidebar-brand-mark-compact { color: hsl(var(--brand-mark-fg)); }
```

(The `--brand-mark-fg` token already encodes the dark/light asymmetry; both rules collapse into one.)

Change C — `.top-header` and `.panel-header` share the same surface token:

Pick the surface token that best matches the current `bg-navy` (top header) and the existing `bg-card` (panel). If both currently use distinct surfaces intentionally, leave them; otherwise unify on `hsl(var(--card))` for the panel and `hsl(var(--primary))` for the top header. The goal is "documented, not accidental."

- [ ] **Step 3: Verify build, visual, lint**

```bash
npm run build
```

Manual check: open any page; the sidebar brand mark is the same color in both modes (navy); the data-table head still looks like navy chrome; the top header still looks like navy chrome; the panel header still looks like card chrome.

```bash
rg -n 'hsl(var\(--navy\))' src/index.css
```

Expected: only the chrome exceptions (top-header background, sidebar background) match. No new matches.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "Standardize sidebar, top-header, panel, and data-table-head chrome to tokens"
```

---

## Phase 4: CSS cleanup

### Task 4.1: Replace ad-hoc `rounded-[0.XXrem]` with radius tokens

**Files:**
- Modify: `src/index.css` and any component that uses one-off rounded classes

**Why:** Spec Section 2.1 and Audit finding #5 — eight micro-variants for what should be three or four sizes.

- [ ] **Step 1: Find all one-off rounded classes**

```bash
rg -nP 'rounded-\[0\.[0-9]+rem\]|rounded-\[0\.[0-9]+\]' src/components src/index.css
```

- [ ] **Step 2: Map each to the closest documented radius**

| Found | Replace with |
|---|---|
| 0.28, 0.30, 0.32, 0.34, 0.36 rem | `var(--radius-sm)` |
| 0.42, 0.46 rem | `var(--radius-md)` (or `--radius-sm` if intentional smaller) |
| 0.5 rem | `var(--radius-md)` |
| Anything larger | `var(--radius-lg)` |

If a value is intentionally outside the scale (e.g., a circular avatar at 9999px), leave it; document the exception in the commit message.

- [ ] **Step 3: Verify build, visual, lint**

```bash
npm run build
```

Manual check: scan every page; no visual change at first glance. Any change is a deliberate decision to fit the scale.

```bash
rg -nP 'rounded-\[0\.[0-9]+' src/components src/index.css
```

Expected: no matches outside the documented exceptions.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "Replace ad-hoc rounded-[0.XXrem] with --radius-sm/md/lg tokens"
```

### Task 4.2: Replace ad-hoc `shadow-[0_Xpx_Ypx_-Zpx_...]` with shadow tokens

**Files:**
- Modify: `src/index.css` and any component that uses one-off shadow classes

- [ ] **Step 1: Find all one-off shadow classes**

```bash
rg -nP 'shadow-\[0_' src/components src/index.css
```

- [ ] **Step 2: Map each to the closest documented shadow**

| Found (approximate) | Replace with |
|---|---|
| `0 1-3px Ypx` (hairline) | `var(--shadow-xs)` |
| `0 6-10px Ypx` (subtle) | `var(--shadow-sm)` |
| `0 12-20px Ypx` (lifted) | `var(--shadow-md)` |
| `0 24px+ Ypx` (overlay) | `var(--shadow-lg)` |

Apply via Tailwind arbitrary value: `shadow-[var(--shadow-sm)]`. Or use the standard `shadow-sm` / `shadow-md` Tailwind classes if `tailwind.config.ts` already maps them to the new CSS variables.

- [ ] **Step 3: Verify build, visual, lint**

```bash
npm run build
```

Manual check: scan every page; shadows should be consistent with the new scale.

```bash
rg -nP 'shadow-\[0_' src/components src/index.css
```

Expected: no matches outside documented exceptions.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "Replace ad-hoc shadow literals with --shadow-xs/sm/md/lg tokens"
```

### Task 4.3: Standardize `transition-* duration-*` to motion tokens

**Files:**
- Modify: `src/index.css` and any component that uses one-off transition classes

**Why:** Spec Section 1.1 motion rule and Audit finding #8.

- [ ] **Step 1: Find all one-off transition classes**

```bash
rg -nP 'transition-(all|col|colors|\[|none)\s+duration-[0-9]+' src/components src/index.css
```

- [ ] **Step 2: Map to the motion rule**

- Color / border / background transitions: `duration-150` (`--motion-fast`) with `ease-[var(--ease-standard)]`. Replace `transition-colors duration-150`, `transition-\[color,border-color,background-color\] duration-200`, etc.
- Transform / box-shadow transitions: `duration-200` (`--motion-base`) with `ease-[var(--ease-standard)]`. Replace `transition-shadow duration-200`, `transition-transform duration-200`, etc.
- Layout transitions (rare): `duration-300` (`--motion-slow`) with `ease-[var(--ease-standard)]`.
- `transition-all` is banned (Skill Section 5.D spirit: be explicit about what animates). Replace with the specific properties being transitioned.

Apply via Tailwind arbitrary value: `ease-[var(--ease-standard)]`.

- [ ] **Step 3: Verify build, visual, lint**

```bash
npm run build
```

Manual check: hover and focus states on buttons, tabs, and links still feel responsive; nothing is too fast or too slow.

```bash
rg -nP 'transition-(all|col|colors)\s+duration-[0-9]+' src/components src/index.css
```

Expected: only the documented `duration-150` / `duration-200` / `duration-300` matches.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "Standardize transition and duration to motion tokens"
```

---

## Phase 5: Parity sweep and Pre-Flight Check

### Task 5.1: Run all Tailwind lints from the Pre-Flight Check

- [ ] **Step 1: Run the chrome-exception lint**

```bash
rg -nP 'class="[^"]*\b(bg|text|border|ring)-(slate|red|blue|amber|emerald|cyan|sky|teal|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+' src/components src/index.css
```

Expected: only `bg-navy` and `bg-slate-50` matches in `src/index.css` for the sidebar/top-header chrome. No matches in `src/components/`.

If there are unexpected matches, fix them by either (a) using the appropriate token, or (b) adding the case to the documented exceptions in the spec.

- [ ] **Step 2: Run the radius lint**

```bash
rg -nP 'rounded-\[0\.[0-9]' src/components src/index.css
```

Expected: no matches.

- [ ] **Step 3: Run the shadow lint**

```bash
rg -nP 'shadow-\[0_' src/components src/index.css
```

Expected: no matches.

- [ ] **Step 4: Run the transition lint**

```bash
rg -nP 'transition-\[(color|background-color|border-color|box-shadow|transform)' src/components src/index.css
```

Expected: no new matches; pre-existing utilities replaced by tokenized shorthands.

- [ ] **Step 5: If any lint found issues, fix and commit them**

If the lints are clean, no commit is needed; proceed to Task 5.2. If anything was fixed, commit per file:

```bash
git add -u
git commit -m "Fix Tailwind lint findings in parity sweep"
```

### Task 5.2: Run the em-dash sweep (Section 9.G)

- [ ] **Step 1: Run the sweep**

```bash
rg -nP '[\x{2014}\x{2013}]' src/
```

Expected: zero matches. The em-dash ban is non-negotiable.

- [ ] **Step 2: If any match exists, fix it**

Replace `—` with `. `, `, `, or ` - ` (hyphen with spaces) as appropriate. Replace `–` (en dash used as a separator) with `-` (hyphen).

If fixes were needed, commit:

```bash
git add -u
git commit -m "Remove em-dashes and en-dashes per Taste Skill Section 9.G"
```

### Task 5.3: Run the AI Tells sweep (Section 9)

- [ ] **Step 1: Run the sweep**

```bash
rg -nE '\b(Inter|Acme|Jane Doe|elevate|seamlessly|unleash|cutting-edge|state-of-the-art|Quietly in use at)\b' src/
```

Expected: no matches. (We are on Manrope, not Inter, and Spanish copy does not use English startup-speak.)

- [ ] **Step 2: If any match exists, fix it**

- Inter: this is a defensive check; the project does not use Inter.
- Acme / Jane Doe: replace with domain terms.
- Filler verbs in Spanish: prefer concrete verbs (crear, registrar, marcar, eliminar, etc.) over anglicisms.

If fixes were needed, commit:

```bash
git add -u
git commit -m "Remove AI Tells (filler verbs, generic names) per Taste Skill Section 9"
```

### Task 5.4: Run `npm run lint` and `npm run build`

- [ ] **Step 1: Run the linter**

```bash
npm run lint
```

Expected: no new warnings. Pre-existing warnings (if any) are out of scope.

- [ ] **Step 2: Run the build**

```bash
npm run build
```

Expected: build succeeds, no type errors.

- [ ] **Step 3: If either command reports new issues, fix them**

- Lint: read the error, fix the file, re-run.
- Type: same.

If fixes were needed, commit:

```bash
git add -u
git commit -m "Fix lint and build findings from parity sweep"
```

### Task 5.5: Manual parity checklist

Spec Section 2.3 — run on every tab (Inicio, Zarpes, Reportes, Estadísticas, Estadística) in both modes.

- [ ] **Step 1: Open each tab in light mode and verify**

- One accent of brand identity visible at a time (navy in both modes for chrome; `--primary-on-dark` only for interactive elements in dark).
- WCAG AA contrast (4.5:1 for text, 3:1 for UI) for every token pair. Manual check by reading through the tab and confirming every text token clears the threshold on its background.
- Title/body/caption hierarchy reads with the same weight.
- Surface depth (background → card → panel) is the same.

- [ ] **Step 2: Toggle to dark mode and verify the same list**

- [ ] **Step 3: Note any drift**

If anything drifts, capture it in a follow-up issue; do not fix per-tab polish in this iteration (it's a non-goal).

- [ ] **Step 4: If you found any token-level issue, fix and commit**

If a token value is off (e.g., the `--state-success-soft` in dark mode is too dark to read white text on it), adjust the token in `src/index.css` and commit:

```bash
git add src/index.css
git commit -m "Adjust token value to fix manual parity finding"
```

### Task 5.6: Final summary

- [ ] **Step 1: Read the Pre-Flight Check matrix in the spec**

`docs/superpowers/specs/2026-06-05-egm-design-audit-design.md` — the "Pre-Flight Check (Section 14, admin-appropriate subset)" section.

- [ ] **Step 2: Tick every box honestly**

For each box in the matrix, confirm the answer is yes. If any box is no, do not declare done; fix the issue first.

- [ ] **Step 3: Final commit (no code change)**

If the lints and parity checklist pass, no commit is needed. Update the spec status from "Approved (awaiting implementation plan)" to "Implemented" in a follow-up commit:

```bash
git add docs/superpowers/specs/2026-06-05-egm-design-audit-design.md
git commit -m "Mark design spec as implemented"
```

If you are not yet at "Implemented," leave the spec status as-is and continue iterating.
