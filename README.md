# Control EGM

Aplicación frontend en `Vite + React + TypeScript` para gestión de zarpes, reportes de vehículos y embarcaciones, con integración a Supabase.

## Scripts

- `npm install`: instala dependencias.
- `npm run dev`: levanta el entorno local.
- `npm run build`: genera el build de producción.
- `npm run test`: ejecuta Vitest.
- `npm run lint`: ejecuta ESLint.

## Estructura

- `src/pages`: páginas principales.
- `src/components`: componentes de negocio y UI.
- `src/components/estadisticas`: flujo de reportes y dashboards.
- `src/components/ui`: primitivas UI reutilizables.
- `supabase`: funciones Edge, configuración y migraciones.

## Gestor de paquetes

Este repositorio usa `npm` como gestor recomendado. El lockfile vigente es `package-lock.json`; usa `npm install` y `npm run ...` para mantener el entorno consistente.
