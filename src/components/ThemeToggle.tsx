import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

const STORAGE_KEY = "theme";

const readStored = (): "dark" | "light" | null => {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "light" ? v : null;
};

const syncThemeColorMeta = (isDark: boolean) => {
  const lightMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][media*="light"]'
  );
  const darkMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][media*="dark"]'
  );
  if (lightMeta) {
    lightMeta.content = isDark ? "" : lightMeta.dataset.fallback || "#ffffff";
  }
  if (darkMeta) {
    darkMeta.content = isDark ? darkMeta.dataset.fallback || "#0b0b0d" : "";
  }
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
