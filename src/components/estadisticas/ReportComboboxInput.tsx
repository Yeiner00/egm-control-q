import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, FilePlus2 } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ReportComboboxInputProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}

const ReportComboboxInput = ({
  value,
  onChange,
  options = [],
  placeholder = "Seleccionar o escribir...",
  searchPlaceholder = "Buscar o escribir...",
  className,
}: ReportComboboxInputProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const cleanSearch = search.trim();

  const filteredOptions = useMemo(() => {
    const normalizedSearch = cleanSearch.toLocaleLowerCase();
    if (!normalizedSearch) return options;
    return options.filter((option) => option.toLocaleLowerCase().includes(normalizedSearch));
  }, [cleanSearch, options]);

  const canUseTypedValue = cleanSearch &&
    !options.some((option) => option.toLocaleLowerCase() === cleanSearch.toLocaleLowerCase());

  const applyValue = (nextValue: string) => {
    onChange(nextValue.trim());
    setSearch("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-[calc(var(--radius)-0.15rem)] border border-input/90 bg-background/85 px-3.5 text-left text-sm font-normal text-foreground shadow-sm ring-offset-background transition-[border-color,box-shadow,background-color] hover:border-accent/40 focus-visible:border-accent/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/10 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 lg:px-3",
            className,
          )}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>
              {cleanSearch ? "Use el texto escrito como nuevo valor." : "No hay opciones registradas."}
            </CommandEmpty>
            <CommandGroup>
              {canUseTypedValue && (
                <CommandItem value={cleanSearch} onSelect={() => applyValue(cleanSearch)}>
                  <FilePlus2 className="mr-2 h-4 w-4" />
                  Usar "{cleanSearch}"
                </CommandItem>
              )}
              {filteredOptions.map((option) => (
                <CommandItem key={option} value={option} onSelect={() => applyValue(option)}>
                  <Check className={cn("mr-2 h-4 w-4", value === option ? "opacity-100" : "opacity-0")} />
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default ReportComboboxInput;
