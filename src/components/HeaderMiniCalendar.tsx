import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const WEEKDAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];
const FULL_CYCLE_LENGTH = 16;
const ALFA_BLOCK_LENGTH = 8;
const SHIFT_ANCHOR = new Date(2026, 0, 27);

const buildCalendarDays = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const cells: Array<Date | null> = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const stripTime = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getSquadType = (date: Date) => {
  const diffDays = Math.floor((stripTime(date).getTime() - stripTime(SHIFT_ANCHOR).getTime()) / 86_400_000);
  const cycleDay = ((diffDays % FULL_CYCLE_LENGTH) + FULL_CYCLE_LENGTH) % FULL_CYCLE_LENGTH;
  return cycleDay < ALFA_BLOCK_LENGTH ? "alfa" : "bravo";
};

const HeaderMiniCalendar = () => {
  const today = useMemo(() => new Date(), []);
  const [displayDate, setDisplayDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const displayYear = displayDate.getFullYear();
  const displayMonth = displayDate.getMonth();
  const calendarDays = useMemo(() => buildCalendarDays(displayYear, displayMonth), [displayYear, displayMonth]);

  const moveMonth = (amount: number) => {
    setDisplayDate((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="hidden h-10 gap-2 border-border/70 bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted sm:inline-flex lg:h-9"
          aria-label="Abrir calendario rapido"
        >
          <CalendarDays className="h-4 w-4 text-primary" />
          <span>{MONTH_LABELS[displayMonth].slice(0, 3)} {displayYear}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[18rem] p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => moveMonth(-1)} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <div className="text-sm font-bold text-foreground">{MONTH_LABELS[displayMonth]}</div>
            <div className="text-xs text-muted-foreground">{displayYear}</div>
          </div>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => moveMonth(1)} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[0.65rem] font-semibold uppercase text-muted-foreground">
          {WEEKDAY_LABELS.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="h-7 rounded-md bg-muted/35" />;
            }

            const squadType = getSquadType(date);
            const isToday =
              date.getDate() === today.getDate()
              && date.getMonth() === today.getMonth()
              && date.getFullYear() === today.getFullYear();

            return (
              <div
                key={date.toISOString()}
                className={cn(
                  "flex h-7 items-center justify-center rounded-md border text-[0.72rem] font-semibold",
                  squadType === "alfa" && "border-red-200 bg-red-500/15 text-red-700 dark:border-red-400/30 dark:bg-red-500/20 dark:text-red-200",
                  squadType === "bravo" && "border-blue-200 bg-blue-500/15 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/20 dark:text-blue-200",
                  isToday && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                )}
              >
                {date.getDate()}
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-center gap-3 text-[0.68rem] font-semibold text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Alfa</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />Bravo</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default HeaderMiniCalendar;
