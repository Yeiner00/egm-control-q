# Repository Guidelines

## Project Structure & Module Organization
This project is a Vite + React + TypeScript application. Main UI code lives in `src/`, with route pages in `src/pages`, reusable components in `src/components`, and shared helpers in `src/lib` and `src/hooks`. Generated or vendor-style UI primitives are under `src/components/ui`. Test setup lives in `src/test`. Static assets are in `public/`. Supabase configuration, SQL migrations, and Edge Functions are in `supabase/`.

## Build, Test, and Development Commands
- `npm install`: install project dependencies.
- `npm run dev`: start the local Vite dev server.
- `npm run build`: create a production build in `dist/`.
- `npm run build:dev`: build using development mode settings.
- `npm run preview`: serve the built app locally for a final check.
- `npm run lint`: run ESLint across the repository.
- `npm run test`: run Vitest once in CI mode.
- `npm run test:watch`: run Vitest in watch mode while developing.

Playwright is configured in `playwright.config.ts`, but there is no package script for it yet; run it directly with `npx playwright test` if needed.

## Coding Style & Naming Conventions
Use TypeScript and functional React components. Follow the existing style: 2-space indentation, semicolons, double quotes, and concise arrow functions where they improve readability. Use `PascalCase` for components (`ZarpeForm.tsx`), `camelCase` for utilities (`normalizeName.ts`), and keep route files in `src/pages`. Prefer the `@/` import alias for code under `src/`.

## Testing Guidelines
Vitest with Testing Library and `jest-dom` is the active unit test stack. Place tests near features or in `src/test` using `*.test.ts` or `*.test.tsx`. Add focused tests for helpers, form behavior, and data transforms before shipping changes. No coverage threshold is defined, so use changed-code coverage as the minimum standard.

## Commit & Pull Request Guidelines
This checkout does not include Git metadata, so commit history could not be inspected directly. Use short, imperative commit messages such as `Add zarpe export validation`. Keep commits scoped to one change. Pull requests should include a clear summary, impacted screens or flows, linked issues, and screenshots for UI changes. Note any Supabase migration or function updates explicitly.

## Configuration Notes
Do not commit secrets. Keep Supabase credentials in environment configuration, and review changes under `supabase/migrations` and `supabase/functions` carefully because they affect deployed data and backend behavior.
