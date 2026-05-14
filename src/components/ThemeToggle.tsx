import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark";
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn("h-10 w-10 border-border/70 bg-card text-foreground hover:bg-muted lg:h-9 lg:w-9", className)}
      onClick={() => setDark(!dark)}
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      {dark ? <Sun className="h-4 w-4 text-primary" /> : <Moon className="h-4 w-4 text-foreground" />}
    </Button>
  );
};

export default ThemeToggle;
