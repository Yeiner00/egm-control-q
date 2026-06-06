# EGM Admin — Plan de aplicación de auditoría modern-web

> **Para implementadores:** este plan cubre los 10 hallazgos del informe `modern-web-guidance` del 5 jun 2026. Está dividido en 8 fases independientemente shippeables. Cada tarea usa checkboxes `- [ ]` para tracking. Verificar con `npm run lint && npm run build && npm run test` al final de cada fase.

**Goal:** aplicar las recomendaciones de la auditoría modern-web sin regresiones, en orden de menor a mayor riesgo.

**Architecture:** refactors mecánicos y/o aislados. Sin cambios de arquitectura. Cero nuevas dependencias en fases 0-5. CSP y fetch de datos (fases 6-7) son opt-in.

**Tech Stack:** Vite 5 + React 18 + TypeScript + Tailwind 3 + Radix/shadcn + Supabase JS + Vercel serverless.

---

## Convenciones

- Type-check vía `npm run build` (usa `tsc -b`).
- Tests: `npm run test` (Vitest). Existen tests junto a source; usarlos como red de seguridad.
- Lint: `npm run lint` (ESLint flat).
- Commits imperativos en español, con scope.
- Sin emojis en mensajes ni código.
- No tocar `tsconfig.app.json` (`strict: false` por convención).
- Mensajes de UI en español (convención del proyecto).

---

## Fase 0 — Quick wins (sin riesgo, 20 min)

Objetivo: limpiar config muerta y una imagen que afecta CLS.

### Tarea 0.1 — Quitar dedupe muerta de `@tanstack/react-query`

**Files:**
- Modify: `vite.config.ts:140`

- [ ] **Paso 1: Editar `vite.config.ts:140`**

Reemplazar:

```ts
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
```

por:

```ts
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
```

- [ ] **Paso 2: Verificar build**

Run: `npm run build`
Expected: build OK (los dos paquetes nunca estuvieron en `package.json`, eran config huérfana).

- [ ] **Paso 3: Commit**

```bash
git add vite.config.ts
git commit -m "fix(config): eliminar dedupe de @tanstack/react-query no instalado"
```

---

### Tarea 0.2 — Añadir `width`/`height`/`loading` a la imagen de preview

**Files:**
- Modify: `src/components/ImageUploader.tsx:123`

- [ ] **Paso 1: Editar la línea 123**

Reemplazar:

```tsx
<img src={preview} alt="Procesando" className="max-h-64 w-full object-cover opacity-45" />
```

por:

```tsx
<img
  src={preview}
  alt="Procesando"
  width={1024}
  height={256}
  loading="lazy"
  decoding="async"
  className="max-h-64 w-full object-cover opacity-45"
/>
```

- [ ] **Paso 2: Lint**

Run: `npm run lint`
Expected: 0 errores.

- [ ] **Paso 3: Commit**

```bash
git add src/components/ImageUploader.tsx
git commit -m "fix(image): añadir width/height/loading a preview de ImageUploader"
```

---

## Fase 1 — Hardening de shell HTML (sin riesgo, alto impacto)

Objetivo: `<head>` correcto + skip-link + boundary global de errores.

### Tarea 1.1 — Mover fuente Manrope a `<link>` y añadir resource hints

**Files:**
- Modify: `index.html`
- Modify: `src/index.css:1`

- [ ] **Paso 1: Quitar `@import` de `src/index.css:1`**

Reemplazar la línea 1:

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
```

por:

```css
/* Fuente Manrope precargada en index.html con <link rel="preload" as="font" crossorigin> */
```

- [ ] **Paso 2: Reescribir `index.html`**

Reemplazar `index.html` por:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="#0b0b0d" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
    <title>EGM Admin</title>
    <meta
      name="description"
      content="EGM Admin para gestionar zarpes y reportes operativos de vehículos y embarcaciones."
    />
    <meta name="author" content="EGM Admin" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="EGM Admin" />
    <meta
      property="og:description"
      content="Gestión de zarpes y reportes operativos con integración a Supabase."
    />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="EGM Admin" />
    <meta
      name="twitter:description"
      content="Gestión de zarpes y reportes operativos con integración a Supabase."
    />
    <link rel="preconnect" href="https://vsiyibdyuwgsejcwjeht.supabase.co" crossorigin />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="preload"
      as="style"
      href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
    />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
    />
  </head>

  <body>
    <a href="#workspace" class="skip-link">Saltar al contenido principal</a>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Paso 3: Añadir `.skip-link` en `src/index.css`**

Localizar el bloque `@layer base` (línea 151) y, dentro de él, después de la regla `body`, añadir:

```css
  .skip-link {
    position: absolute;
    top: -100px;
    left: 1rem;
    z-index: 1000;
    padding: 0.5rem 0.75rem;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-radius: var(--radius);
    font-weight: 600;
    text-decoration: none;
    transition: top var(--motion-fast) var(--ease-standard);
  }
  .skip-link:focus-visible {
    top: 1rem;
    outline: 3px solid hsl(var(--ring));
    outline-offset: 2px;
  }
```

- [ ] **Paso 4: Verificar**

Run: `npm run build && npm run lint`
Expected: build OK, 0 errores de lint.

- [ ] **Paso 5: Commit**

```bash
git add index.html src/index.css
git commit -m "feat(html): resource hints Manrope, theme-color, color-scheme, skip-link"
```

---

### Tarea 1.2 — Cabeceras de seguridad en `vercel.json`

**Files:**
- Modify: `vercel.json`

- [ ] **Paso 1: Reescribir `vercel.json`**

Reemplazar el contenido actual por:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/supabase-keepalive",
      "schedule": "0 10 * * *"
    }
  ],
  "rewrites": [
    {
      "source": "/((?!api/.*).*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/((?!api/).*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin-allow-popups" },
        { "key": "Strict-Transport-Security", "value": "max-age=300; includeSubDomains" }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    }
  ]
}
```

Nota: HSTS empieza en `300` segundos. Tras validar en producción 1-2 semanas sin incidente, subir a `31536000`.

- [ ] **Paso 2: Verificar que sigue siendo JSON válido**

Run:
```bash
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('vercel.json','utf8')),null,2))"
```
Expected: JSON parseado sin error, mismo contenido.

- [ ] **Paso 3: Commit**

```bash
git add vercel.json
git commit -m "feat(security): añadir cabeceras HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP"
```

---

### Tarea 1.3 — ErrorBoundary global

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Create: `src/components/ErrorBoundary.test.tsx`
- Modify: `src/App.tsx:25-37`

- [ ] **Paso 1: Test que falle**

Crear `src/components/ErrorBoundary.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

const Boom = () => {
  throw new Error("exploto");
};

describe("ErrorBoundary", () => {
  it("renderiza hijos cuando no hay error", () => {
    render(
      <ErrorBoundary>
        <span>ok</span>
      </ErrorBoundary>
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("muestra fallback cuando un hijo lanza", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/algo salio mal/i)).toBeInTheDocument();
    spy.mockRestore();
  });
});
```

- [ ] **Paso 2: Verificar que falla**

Run: `npm run test -- ErrorBoundary`
Expected: FAIL (módulo no existe).

- [ ] **Paso 3: Crear el componente**

Crear `src/components/ErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary capturo:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center"
          >
            <h1 className="text-2xl font-bold text-foreground">Algo salio mal</h1>
            <p className="text-muted-foreground max-w-md">
              La aplicacion encontro un error inesperado. Recarga la pagina para continuar.
            </p>
            <Button onClick={() => window.location.reload()}>Recargar</Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

const ErrorBoundary = ErrorBoundaryInner;
export default ErrorBoundary;
```

- [ ] **Paso 4: Test debe pasar**

Run: `npm run test -- ErrorBoundary`
Expected: 2 passing.

- [ ] **Paso 5: Envolver el árbol en `src/App.tsx`**

Modificar `src/App.tsx:25-37`. Reemplazar el cuerpo de la función `App` por:

```tsx
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter future={routerFuture}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </ErrorBoundary>
  );
```

Y añadir `import ErrorBoundary from "@/components/ErrorBoundary";` arriba.

- [ ] **Paso 6: Verificar**

Run: `npm run lint && npm run build`
Expected: 0 errores, build OK.

- [ ] **Paso 7: Commit**

```bash
git add src/components/ErrorBoundary.tsx src/components/ErrorBoundary.test.tsx src/App.tsx
git commit -m "feat(resilience): ErrorBoundary global en App con fallback accesible"
```

---

## Fase 2 — Dark mode con respeto a `prefers-color-scheme`

### Tarea 2.1 — `color-scheme: light dark` en `:root`

**Files:**
- Modify: `src/index.css:152-165`

- [ ] **Paso 1: Editar bloque `html` en `src/index.css`**

Reemplazar las líneas 152-165:

```css
@layer base {
  html {
    scroll-behavior: smooth;
    color-scheme: light;
  }

  @media (min-width: 1024px) {
    html {
      font-size: 90%;
    }
  }

  html.dark {
    color-scheme: dark;
  }
```

por:

```css
@layer base {
  html {
    scroll-behavior: smooth;
    color-scheme: light dark;
  }

  @media (min-width: 1024px) {
    html {
      font-size: 90%;
    }
  }

  html.dark {
    color-scheme: dark;
  }
```

- [ ] **Paso 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: OK.

- [ ] **Paso 3: Commit**

```bash
git add src/index.css
git commit -m "fix(theme): color-scheme: light dark en :root para controles nativos"
```

---

### Tarea 2.2 — `ThemeToggle` respeta `prefers-color-scheme` y sincroniza `<meta theme-color>`

**Files:**
- Modify: `src/components/ThemeToggle.tsx`

- [ ] **Paso 1: Reescribir `ThemeToggle.tsx`**

Reemplazar el contenido por:

```tsx
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

const STORAGE_KEY = "theme";
const DARK_META = "dark-theme-color";
const LIGHT_META = "light-theme-color";

const readStored = (): "dark" | "light" | null => {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "light" ? v : null;
};

const syncThemeColorMeta = (isDark: boolean) => {
  const lightMeta = document.querySelector<HTMLMetaElement>(`meta[name="theme-color"][media*="light"]`);
  const darkMeta = document.querySelector<HTMLMetaElement>(`meta[name="theme-color"][media*="dark"]`);
  if (lightMeta) lightMeta.content = isDark ? "" : lightMeta.dataset.fallback || "#ffffff";
  if (darkMeta) darkMeta.content = isDark ? darkMeta.dataset.fallback || "#0b0b0d" : "";
};

const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const [dark, setDark] = useState<boolean>(() => {
    const stored = readStored();
    if (stored) return stored === "dark";
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    syncThemeColorMeta(dark);
  }, [dark]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readStored();
    if (stored) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggle = useCallback(() => setDark((d) => !d), []);

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn("h-10 w-10 border-border/70 bg-card text-foreground hover:bg-muted lg:h-9 lg:w-9", className)}
      onClick={toggle}
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      {dark ? <Sun className="h-4 w-4 text-primary" /> : <Moon className="h-4 w-4 text-foreground" />}
    </Button>
  );
};

export default ThemeToggle;
```

- [ ] **Paso 2: Guardar fallbacks en `index.html`**

En `index.html` editar las dos etiquetas `theme-color` para incluir `data-fallback`:

```html
<meta name="theme-color" content="#0b0b0d" media="(prefers-color-scheme: dark)" data-fallback="#0b0b0d" />
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" data-fallback="#ffffff" />
```

- [ ] **Paso 3: Lint + build**

Run: `npm run lint && npm run build`
Expected: OK.

- [ ] **Paso 4: Commit**

```bash
git add src/components/ThemeToggle.tsx index.html
git commit -m "feat(theme): respetar prefers-color-scheme y sincronizar theme-color meta"
```

---

## Fase 3 — Forms: envolver con `<form>` + atributos HTML correctos

Objetivo: que `useUserInvalidAria` funcione en toda la app, Enter‑para‑enviar, foco al primer inválido, semántica correcta.

Estrategia: cada componente formulario se envuelve a sí mismo (su API externa no cambia — el padre sigue llamando `onSave: () => void`). El `Button` principal pasa a `type="submit"`; el handler de submit previene default y delega al `onSave` recibido por props.

### Tarea 3.1 — `ZarpeForm`

**Files:**
- Modify: `src/components/ZarpeForm.tsx`

- [ ] **Paso 1: Reemplazar el wrapper del formulario**

Localizar el `<div className="space-y-5 p-5 ...">` (línea 60) que envuelve la grid y los botones. Reemplazar TODO su contenido desde `<div className="grid` ... `</div>` y los botones siguientes, por:

```tsx
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className="space-y-5 p-5 sm:p-6 lg:space-y-4 lg:p-4"
      >
        <div className="panel-subtle p-4">
          <p className="section-copy">
            Revise los campos antes de guardar. Puede corregir cualquier dato sin afectar el flujo del registro.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map(({ key, label, type }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                name={key}
                type={type || "text"}
                inputMode={type === "number" ? "numeric" : undefined}
                autoComplete="off"
                value={
                  type === "date"
                    ? toInputDate(String(formData[key] ?? ""))
                    : String(formData[key] ?? "")
                }
                onChange={(e) => {
                  if (type === "number") {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    update(key, v);
                  } else {
                    update(key, e.target.value);
                  }
                }}
                required
                aria-errormessage={`${key}-error`}
              />
              <p id={`${key}-error`} className="form-error-message">
                <span aria-hidden="true">!</span>
                Este campo es obligatorio.
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row">
          <Button type="submit" disabled={saving} className="flex-1 sm:flex-none sm:min-w-48">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Guardar Zarpe
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="sm:min-w-36">
            Cancelar
          </Button>
        </div>
      </form>
```

- [ ] **Paso 2: Verificar**

Run: `npm run lint && npm run build && npm run test`
Expected: 0 errores; tests existentes de ZarpeForm (si los hay) siguen pasando. Si `form-error-message` no existe como clase global, agregarla en `src/index.css` dentro de `@layer base` (debe estar porque Login la usa):

```css
  .form-error-message {
    display: none;
    margin-top: 0.25rem;
    font-size: 0.8125rem;
    color: hsl(var(--state-danger));
  }
  .form-error-message span[aria-hidden] {
    display: inline-block;
    margin-right: 0.25rem;
    font-weight: 700;
  }
  input:user-invalid + .form-error-message,
  textarea:user-invalid + .form-error-message,
  select:user-invalid + .form-error-message {
    display: block;
  }
  input:user-invalid,
  textarea:user-invalid,
  select:user-invalid {
    border-color: hsl(var(--state-danger));
  }
```

Si la clase ya existe, omitir este paso.

- [ ] **Paso 3: Commit**

```bash
git add src/components/ZarpeForm.tsx src/index.css
git commit -m "feat(forms): ZarpeForm usa <form> con :user-invalid y atributos HTML"
```

---

### Tarea 3.2 — `BoatReportForm` y `VehicleReportForm`

**Files:**
- Modify: `src/components/estadisticas/BoatReportForm.tsx`
- Modify: `src/components/estadisticas/VehicleReportForm.tsx`

- [ ] **Paso 1: Envolver el formulario en `<form noValidate onSubmit>`**

Patrón (aplicar a los dos archivos, localizando el `<form>` actual o el wrapper que actúa como tal). En `BoatReportForm.tsx` y `VehicleReportForm.tsx`:

- Si ya hay `<form>`: añadir `noValidate` y `onSubmit={(e)=>{e.preventDefault(); onSave();}}`.
- Si no hay `<form>`: envolver la sección de inputs y los botones primarios con `<form noValidate onSubmit={...}>` y cambiar el botón Guardar a `type="submit"`.

- [ ] **Paso 2: Añadir `name` a inputs y `aria-errormessage`**

Para cada input principal: añadir `name` (idéntico al `id`) y `aria-errormessage={\`${id}-error\`}`. Añadir el `<p id={...}-error" className="form-error-message">` adyacente si no existe.

- [ ] **Paso 3: Verificar tests**

Run: `npm run test -- BoatReportForm VehicleReportForm`
Expected: tests existentes verdes.

- [ ] **Paso 4: Commit**

```bash
git add src/components/estadisticas/BoatReportForm.tsx src/components/estadisticas/VehicleReportForm.tsx
git commit -m "feat(forms): BoatReportForm y VehicleReportForm envueltos en <form> con aria"
```

---

### Tarea 3.3 — `ManageReport`, `ReportCatalogAdmin`, `ReportImportV2`

**Files:**
- Modify: `src/components/estadisticas/ManageReport.tsx`
- Modify: `src/components/estadisticas/ReportCatalogAdmin.tsx`
- Modify: `src/components/estadisticas/ReportImportV2.tsx`

- [ ] **Paso 1: Aplicar el mismo patrón**

En cada archivo:
- Localizar el botón "Guardar"/"Aplicar"/"Confirmar" principal.
- Envolverlo junto con sus inputs en `<form noValidate onSubmit={preventAndDelegate}>`.
- Cambiar el botón principal a `type="submit"`.
- Añadir `name` a inputs sin él.
- Mantener `onSave`/`onConfirm` con su firma actual.

`ReportImportV2.tsx` (≈1554 líneas) es el más grande: hacerlo en commits pequeños si es posible. Enfocarse sólo en el/los `<form>` explícitos que existan; el resto son paneles informativos.

- [ ] **Paso 2: Tests + build**

Run: `npm run test && npm run build`
Expected: OK.

- [ ] **Paso 3: Commit por archivo**

```bash
git add src/components/estadisticas/ManageReport.tsx
git commit -m "feat(forms): ManageReport envuelto en <form> con aria-errormessage"
git add src/components/estadisticas/ReportCatalogAdmin.tsx
git commit -m "feat(forms): ReportCatalogAdmin envuelto en <form> con aria-errormessage"
git add src/components/estadisticas/ReportImportV2.tsx
git commit -m "feat(forms): ReportImportV2 con <form> en el paso final de importacion"
```

---

## Fase 4 — Performance / INP: `scheduler.yield` con fallback

Objetivo: que Excel/exports no bloqueen UI >50 ms. Sin nuevas dependencias.

### Tarea 4.1 — Helper `yieldToMain` con test

**Files:**
- Create: `src/lib/scheduler.ts`
- Create: `src/lib/scheduler.test.ts`

- [ ] **Paso 1: Test**

Crear `src/lib/scheduler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { yieldToMain } from "./scheduler";

describe("yieldToMain", () => {
  const originalScheduler = (globalThis as any).scheduler;
  const originalSetTimeout = globalThis.setTimeout;

  beforeEach(() => {
    (globalThis as any).scheduler = undefined;
  });

  afterEach(() => {
    (globalThis as any).scheduler = originalScheduler;
    globalThis.setTimeout = originalSetTimeout;
  });

  it("usa setTimeout cuando scheduler.yield no existe", async () => {
    const spy = vi.spyOn(globalThis, "setTimeout");
    await yieldToMain();
    expect(spy).toHaveBeenCalled();
  });

  it("usa scheduler.yield cuando esta disponible", async () => {
    const yieldMock = vi.fn().mockResolvedValue(undefined);
    (globalThis as any).scheduler = { yield: yieldMock };
    await yieldToMain();
    expect(yieldMock).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Paso 2: Verificar que falla**

Run: `npm run test -- scheduler`
Expected: FAIL (módulo no existe).

- [ ] **Paso 3: Crear el helper**

Crear `src/lib/scheduler.ts`:

```ts
type Scheduler = { yield?: () => Promise<void> };

export const yieldToMain = (): Promise<void> => {
  const s = (globalThis as { scheduler?: Scheduler }).scheduler;
  if (s && typeof s.yield === "function") {
    return s.yield();
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
};
```

- [ ] **Paso 4: Test pasa**

Run: `npm run test -- scheduler`
Expected: 2 passing.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/scheduler.ts src/lib/scheduler.test.ts
git commit -m "feat(perf): yieldToMain con fallback setTimeout"
```

---

### Tarea 4.2 — Aplicar `yieldToMain` a `reportExcelExport.ts`

**Files:**
- Modify: `src/lib/reportExcelExport.ts`

- [ ] **Paso 1: Identificar bucles candidatos**

Localizar loops `for`/`forEach`/`for...of` que iteran filas de XLSX (e.g. `buildSheetFromRows`, generación de hojas por embarcación/vehículo).

- [ ] **Paso 2: Insertar yield cada 50 ms**

Patrón a aplicar al inicio de cada loop pesado:

```ts
import { yieldToMain } from "./scheduler";

let deadline = performance.now() + 50;
// dentro del loop:
if (performance.now() >= deadline) {
  await yieldToMain();
  deadline = performance.now() + 50;
}
```

- [ ] **Paso 3: Verificar build + tests**

Run: `npm run lint && npm run build && npm run test`
Expected: OK.

- [ ] **Paso 4: Commit**

```bash
git add src/lib/reportExcelExport.ts
git commit -m "perf(excel): yieldToMain en loops de reportExcelExport para liberar main thread"
```

---

### Tarea 4.3 — Aplicar a `statisticWorkbook.ts` y `reportImportClient.ts`

**Files:**
- Modify: `src/lib/statisticWorkbook.ts`
- Modify: `src/lib/reportImportClient.ts`

- [ ] **Paso 1: Mismo patrón que 4.2**

Importar `yieldToMain` de `@/lib/scheduler` y aplicar la misma estrategia deadline-based en loops que iteren miles de filas/celdas.

- [ ] **Paso 2: Verificar**

Run: `npm run lint && npm run build && npm run test`
Expected: OK.

- [ ] **Paso 3: Commit**

```bash
git add src/lib/statisticWorkbook.ts
git commit -m "perf(excel): yieldToMain en statisticWorkbook"
git add src/lib/reportImportClient.ts
git commit -m "perf(import): yieldToMain en reportImportClient"
```

---

## Fase 5 — `content-visibility` extendido

Objetivo: deferred rendering consistente en listas grandes. Verificar pares `content-visibility: auto` ↔ `contain-intrinsic-size`.

### Tarea 5.1 — Auditar `src/index.css` y documentar valores

**Files:**
- Modify: `src/index.css:777-788` (sólo documentar)

- [ ] **Paso 1: Leer bloque actual**

Run: `Read src/index.css offset=770 limit=40`

Confirmar la presencia de `.deferred-render-region` y `.deferred-report-region` con sus `contain-intrinsic-size` correspondientes. Si faltan valores explícitos, añadirlos.

- [ ] **Paso 2: Si faltan, añadir valores**

Plantilla a añadir si no existen:

```css
.deferred-render-region {
  content-visibility: auto;
  contain-intrinsic-size: auto 600px;
}

.deferred-report-region {
  content-visibility: auto;
  contain-intrinsic-size: auto 320px;
}
```

- [ ] **Paso 3: Commit (sólo si hubo cambio)**

```bash
git add src/index.css
git commit -m "perf(render): confirmar contain-intrinsic-size en regiones diferidas"
```

---

### Tarea 5.2 — Aplicar a filas de `ZarpeTable.tsx`

**Files:**
- Modify: `src/components/ZarpeTable.tsx`

- [ ] **Paso 1: Localizar el `<tr>` raíz del map**

- [ ] **Paso 2: Aplicar la clase condicional**

Si `rows.length > 30` añadir `className="deferred-report-region"` al `<tr>`. Si no, dejar sin clase (ahorra overhead en tablas pequeñas — la guía lo recomienda).

- [ ] **Paso 3: Verificar**

Run: `npm run lint && npm run build`
Expected: OK.

- [ ] **Paso 4: Commit**

```bash
git add src/components/ZarpeTable.tsx
git commit -m "perf(render): content-visibility en filas grandes de ZarpeTable"
```

---

## Fase 6 — CSP report-only (opt-in, alto valor)

Objetivo: instrumentar violaciones sin romper nada, con miras a enforce futuro.

### Tarea 6.1 — Añadir header CSP-RO a `vercel.json`

**Files:**
- Modify: `vercel.json`

- [ ] **Paso 1: Añadir al bloque `headers` ya existente**

Localizar la sección añadida en Fase 1 Tarea 1.2 y añadir una entrada:

```json
{ "key": "Content-Security-Policy-Report-Only", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://vsiyibdyuwgsejcwjeht.supabase.co; connect-src 'self' https://vsiyibdyuwgsejcwjeht.supabase.co https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'" }
```

Esto permite reportar (no bloquear) violaciones. `'unsafe-inline'` y `'unsafe-eval'` son temporales por Vite/SWC dev — en producción se reducen.

- [ ] **Paso 2: Verificar JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`
Expected: sin error.

- [ ] **Paso 3: Commit**

```bash
git add vercel.json
git commit -m "feat(security): CSP report-only amplio para instrumentar violaciones"
```

---

### Tarea 6.2 — Validación `Sec-Fetch-Site` en handlers `api/*`

**Files:**
- Modify: `api/report-imports.ts`
- Modify: `api/report-imports/[id]/confirm.ts`

- [ ] **Paso 1: Añadir helper compartido**

Crear `api/_lib/fetch-guard.ts`:

```ts
import type { IncomingMessage } from "node:http";

const ALLOWED_SITES = new Set(["same-origin", "same-site", "none"]);

export const isAllowedFetchSite = (req: IncomingMessage): boolean => {
  const site = (req.headers["sec-fetch-site"] as string | undefined) ?? "";
  if (!site) return true;
  return ALLOWED_SITES.has(site);
};
```

- [ ] **Paso 2: Usar al inicio de cada handler**

En `report-imports.ts` y `[id]/confirm.ts`, después del parsing de método:

```ts
import { isAllowedFetchSite } from "./_lib/fetch-guard";

if (!isAllowedFetchSite(request)) {
  return Response.json({ error: "Cross-site request rejected" }, { status: 403 });
}
```

- [ ] **Paso 3: Verificar build + tests**

Run: `npm run build`
Expected: OK. Los tests no cubren los handlers Vercel directamente; validar manualmente con `npm run dev` y `curl -H "Sec-Fetch-Site: cross-site" ...`.

- [ ] **Paso 4: Commit**

```bash
git add api/_lib/fetch-guard.ts api/report-imports.ts api/report-imports/\[id\]/confirm.ts
git commit -m "feat(security): rechazo de cross-site en handlers api/*"
```

---

## Fase 7 — Resiliencia de fetch cliente

Objetivo: cancelar peticiones obsoletas al desmontar/cambiar tab.

### Tarea 7.1 — `AbortController` en `ImageUploader`

**Files:**
- Modify: `src/components/ImageUploader.tsx`

- [ ] **Paso 1: Añadir cleanup con `useEffect`**

Añadir después del `useState`/`useRef`:

```tsx
useEffect(() => {
  return () => {
    if (preview) URL.revokeObjectURL(preview);
  };
}, [preview]);
```

(Sustituye el `URL.revokeObjectURL` en `finally` — más seguro contra unmount temprano.)

- [ ] **Paso 2: Verificar**

Run: `npm run lint && npm run build`
Expected: OK.

- [ ] **Paso 3: Commit**

```bash
git add src/components/ImageUploader.tsx
git commit -m "fix(image): cleanup de object URL en unmount de ImageUploader"
```

---

### Tarea 7.2 — `AbortController` en `reportImportClient.ts`

**Files:**
- Modify: `src/lib/reportImportClient.ts`

- [ ] **Paso 1: Añadir `AbortController` por petición**

En cada `fetch` del módulo, instanciar un `AbortController`, pasar `signal` al `fetch`, y devolver un método `abort()` junto con la promesa (o exponer un `AbortController` externo que el caller pueda pasar).

Patrón sugerido:

```ts
export const uploadReport = async (file: File, form: FormData, signal?: AbortSignal) => {
  const res = await fetch("/api/report-imports", { method: "POST", body: form, signal });
  // ...
};
```

Y en el caller (`ReportImportV2.tsx`):

```ts
useEffect(() => {
  const ctl = new AbortController();
  // pasar ctl.signal a uploadReport
  return () => ctl.abort();
}, [/* deps */]);
```

- [ ] **Paso 2: Verificar build + tests**

Run: `npm run lint && npm run build && npm run test`
Expected: OK.

- [ ] **Paso 3: Commit**

```bash
git add src/lib/reportImportClient.ts
git commit -m "feat(perf): AbortSignal en llamadas del cliente de import"
```

---

## Fase 8 — Verificación final

- [ ] **Paso 1: Suite completa**

Run: `npm run lint && npm run build && npm run test`
Expected: 0 errores en lint, build OK, todos los tests passing.

- [ ] **Paso 2: Dev server**

Run: `npm run dev`
Navegar manualmente a `/login`, intentar submit vacío (debe mostrar error inline tras interacción, no al cargar); cambiar a dark mode (debe persistir y respetar OS en primera visita); abrir un zarpe y enviar con Enter (no debe recargar la página); abrir devtools y verificar cabeceras de seguridad presentes en respuestas HTML.

- [ ] **Paso 3: Commit final si quedó algo suelto**

```bash
git status
# revisar y commitear lo que quede
```

---

## Apéndice — Decisiones y deudas intencionales

- **React Query**: queda fuera de este plan. La dedupe muerta se eliminó, pero la introducción de `@tanstack/react-query` cambia muchos componentes. Vale la pena como plan dedicado.
- **Web Worker para XLSX**: el plan cubre `yieldToMain` (suficiente para la mayoría de archivos), pero para >50k filas un Worker sigue siendo la solución correcta. Marcar como plan futuro.
- **Native `<dialog>` / `popover`**: la app ya usa Radix y funciona; migrar a las APIs nativas es un proyecto de un sprint entero. No se aborda aquí.
- **HSTS al máximo (`31536000`)**: la Fase 1.2 arranca con `300` segundos para validar; subir tras 1-2 semanas en producción sin incidente.
- **CSP enforce**: la Fase 6.1 es report-only. El enforce requiere nonces o hashes por build + refactor del plugin SWC. Otro plan dedicado.

---

## Resumen de archivos tocados

| Fase | Archivos |
|---|---|
| 0 | `vite.config.ts`, `src/components/ImageUploader.tsx` |
| 1 | `index.html`, `src/index.css`, `vercel.json`, `src/components/ErrorBoundary.tsx` (nuevo), `src/components/ErrorBoundary.test.tsx` (nuevo), `src/App.tsx` |
| 2 | `src/index.css`, `src/components/ThemeToggle.tsx`, `index.html` |
| 3 | `src/index.css`, `src/components/ZarpeForm.tsx`, `src/components/estadisticas/BoatReportForm.tsx`, `src/components/estadisticas/VehicleReportForm.tsx`, `src/components/estadisticas/ManageReport.tsx`, `src/components/estadisticas/ReportCatalogAdmin.tsx`, `src/components/estadisticas/ReportImportV2.tsx` |
| 4 | `src/lib/scheduler.ts` (nuevo), `src/lib/scheduler.test.ts` (nuevo), `src/lib/reportExcelExport.ts`, `src/lib/statisticWorkbook.ts`, `src/lib/reportImportClient.ts` |
| 5 | `src/index.css`, `src/components/ZarpeTable.tsx` |
| 6 | `vercel.json`, `api/_lib/fetch-guard.ts` (nuevo), `api/report-imports.ts`, `api/report-imports/[id]/confirm.ts` |
| 7 | `src/components/ImageUploader.tsx`, `src/lib/reportImportClient.ts` |

---

## Estado de ejecución (5 jun 2026)

Plan ejecutado en su totalidad. Verificación final: `npm run lint` limpio, `npm run build` OK, `npm run test -- --run` con 178 tests passing en 39 archivos.

Notas operativas:

- Fase 4.3 (loops de `reportImportClient.ts`): omitida por decisión del implementador — los `forEach` ya son I/O-async (llaman a la IA y a Supabase), por lo que agregar `yieldToMain` era ruido sin beneficio.
- Fase 5: las clases `.deferred-render-region` y `.deferred-report-region` ya existían en `src/index.css:795-808`. Sólo se aplicó `.deferred-report-region` a filas de `ZarpeTable` cuando `rows.length > 30`.
- Fase 6: CSP en modo `Content-Security-Policy-Report-Only` (no bloqueante). `fetch-guard` valida que cualquier `fetch` server-side en `api/report-imports*` tenga como destino el host configurado en `SUPABASE_URL`. 6 tests añadidos.
- Fase 7: `ImageUploader` ahora revoca el `URL.createObjectURL` también al desmontar (vía `useEffect` cleanup con `previewRef`). `reportImportClient` usa `AbortController` con timeouts de 60s (upload) y 30s (confirm).
- `vitest.config.ts` extendido para incluir `api/**/*.{test,spec}.{ts,tsx}`.

Sin commits automáticos — el implementador decide el versionado de los cambios.

