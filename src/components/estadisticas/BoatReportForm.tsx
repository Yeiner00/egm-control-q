import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, FilePlus2, X, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isEmptyReportValue } from "@/lib/missingData";
import { findFuelProvider, FUEL_PROVIDER_OPTIONS } from "@/lib/fuelProviders";
import { findSiteOption, type ReportSiteOption } from "@/lib/reportSites";
import { findOfficerByName, normalizeKnownPersonName, normalizeKnownPersonNames, OFFICER_OPTIONS } from "@/lib/officers";
import { normalizeNameKey } from "@/lib/normalizeName";
import ReportComboboxInput from "@/components/estadisticas/ReportComboboxInput";
import ReportFormActionBar from "@/components/estadisticas/ReportFormActionBar";

export interface BoatPersonData {
  nombre: string;
  cedula: string;
}

export interface BoatSiteData {
  nombre_sitio: string;
  zona: string;
  posicion: string;
}

export interface InspectedBoatData {
  nombre: string;
  matricula: string;
  no_inspeccion: string;
  zona: string;
}

export interface BoatFormData {
  no_reporte: string;
  bitacora: string;
  folios: string;
  fecha: string;
  estacion: string;
  embarcacion: string;
  no_cierre_os: string;
  hora_salida: string;
  hora_regreso: string;
  horas_motor_babor: number | null;
  horas_motor_centro: number | null;
  horas_motor_estribor: number | null;
  destino: string;
  motivos: string[];
  capitan: string;
  capitan_cedula: string;
  encargado_mision: string;
  encargado_mision_cedula: string;
  oficial_director: string;
  oficial_director_cedula: string;
  operacional: string;
  operacional_cedula: string;
  tripulantes: BoatPersonData[];
  personas_particulares: string[];
  sitios_visitados: BoatSiteData[];
  embarcaciones_inspeccionadas: InspectedBoatData[];
  saldo_anterior: number | null;
  combustible_trasegado_bodega: number | null;
  total_antes_viaje: number | null;
  combustible_trasegado_durante: number | null;
  combustible_gastado: number | null;
  saldo_despues: number | null;
  tipo_combustible: string;
  estacion_combustible: string;
  lugar_combustible: string;
  cedula_juridica_combustible: string;
  no_factura: string;
  millas_nauticas: number | null;
  novedades: string;
}

interface Props {
  data: BoatFormData;
  onChange: (data: BoatFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  hideActions?: boolean;
  stationOptions?: string[];
  unitOptions?: string[];
  peopleOptions?: string[];
  motiveOptions?: string[];
  siteOptions?: ReportSiteOption[];
  showPendingState?: boolean;
  saveLabel?: string;
  autoCalculateMotorHours?: boolean;
  autoFillBoatBitacora?: boolean;
  useFuelLoadToggle?: boolean;
  fuelLoadEnabled?: boolean;
  onFuelLoadEnabledChange?: (enabled: boolean) => void;
  onDelete?: () => void;
  deleting?: boolean;
  deleteLabel?: string;
}

const MAX_MOTIVOS = 10;
const siteRowGridClass = "sm:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)_minmax(0,0.9fr)_2rem]";
const inspectedBoatRowGridClass = "lg:grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)_minmax(0,0.82fr)_minmax(0,0.48fr)_2rem]";
const compactRowInputClass = "min-w-0 h-8 lg:h-8 px-3 py-0 text-sm";
const compactDeleteButtonClass = "h-8 w-8 shrink-0 px-0";
const BOAT_BITACORA_BY_UNIT: Record<string, string> = {
  "GC38-22": "01",
};

const normalizeSelectionValue = (value: string) => value.trim().toLocaleLowerCase();

const normalizePersonSelectionValue = (value: string) => normalizeNameKey(normalizeKnownPersonName(value));

const normalizeBoatKey = (value: string) => value.trim().toLocaleUpperCase();

const getBoatBitacora = (boat: string) => {
  const boatKey = normalizeBoatKey(boat);
  if (!boatKey) return "";
  return BOAT_BITACORA_BY_UNIT[boatKey] ?? "00";
};

const parseTimeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const calculateMotorHours = (horaSalida: string, horaRegreso: string) => {
  const salida = parseTimeToMinutes(horaSalida);
  let regreso = parseTimeToMinutes(horaRegreso);
  if (salida === null || regreso === null) return null;
  if (regreso < salida) regreso += 24 * 60;
  return Number(((regreso - salida + 10) / 60).toFixed(2));
};

const formatMotorHoursValue = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const parseMotorHoursValue = (value: string) => {
  const cleanValue = value.trim();
  if (!cleanValue) return null;
  const [hoursText, minutesText = "0"] = cleanValue.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return Number(((hours * 60 + minutes) / 60).toFixed(2));
};

interface MultiValueSelectorProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: string[];
  maxSelected?: number;
  singularLabel: string;
  pluralLabel: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  maxText?: string;
  blockedValues?: string[];
  blockedLabel?: string;
  pending: boolean;
  renderSelected?: (value: string, remove: () => void) => ReactNode;
}

const MultiValueSelector = ({
  label,
  value,
  onChange,
  options,
  maxSelected,
  singularLabel,
  pluralLabel,
  placeholder,
  searchPlaceholder,
  emptyText,
  maxText,
  blockedValues = [],
  blockedLabel,
  pending,
  renderSelected,
}: MultiValueSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const cleanSearch = search.trim();
  const selectedValues = value.filter((item) => item.trim());
  const selectedSet = useMemo(
    () => new Set(selectedValues.map(normalizeSelectionValue)),
    [selectedValues],
  );
  const blockedSet = useMemo(
    () => new Set(blockedValues.filter(Boolean).map(normalizeSelectionValue)),
    [blockedValues],
  );
  const hasReachedLimit = typeof maxSelected === "number" && selectedValues.length >= maxSelected;

  const filteredOptions = useMemo(() => {
    const normalizedSearch = normalizeSelectionValue(cleanSearch);
    const uniqueOptions = Array.from(
      new Map(options.map((option) => [normalizeSelectionValue(option), option.trim()])).values(),
    ).filter(Boolean);

    if (!normalizedSearch) return uniqueOptions;
    return uniqueOptions.filter((option) => normalizeSelectionValue(option).includes(normalizedSearch));
  }, [cleanSearch, options]);

  const updateSelection = (nextValue: string[]) => {
    const uniqueValues = nextValue.reduce<string[]>((items, item) => {
      const cleanValue = item.trim();
      const normalizedValue = normalizeSelectionValue(cleanValue);
      if (!cleanValue) return items;
      if (items.some((existing) => normalizeSelectionValue(existing) === normalizedValue)) return items;
      return [...items, cleanValue];
    }, []);

    onChange(typeof maxSelected === "number" ? uniqueValues.slice(0, maxSelected) : uniqueValues);
  };

  const toggleValue = (nextValue: string) => {
    const normalizedValue = normalizeSelectionValue(nextValue);
    if (!normalizedValue || blockedSet.has(normalizedValue)) return;
    if (selectedSet.has(normalizedValue)) {
      updateSelection(selectedValues.filter((item) => normalizeSelectionValue(item) !== normalizedValue));
      return;
    }
    if (hasReachedLimit) return;
    updateSelection([...selectedValues, nextValue]);
  };

  const removeValue = (nextValue: string) => {
    updateSelection(selectedValues.filter((item) => normalizeSelectionValue(item) !== normalizeSelectionValue(nextValue)));
  };

  const typedValueNormalized = normalizeSelectionValue(cleanSearch);
  const canUseTypedValue =
    !!cleanSearch &&
    !blockedSet.has(typedValueNormalized) &&
    !selectedSet.has(typedValueNormalized) &&
    !options.some((option) => normalizeSelectionValue(option) === typedValueNormalized);

  return (
    <div className={cn("space-y-2", pending && "report-list-pending")}>
      <Label className="text-xs font-medium">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-10 w-full justify-between rounded-[calc(var(--radius)-0.15rem)] border-input/90 bg-background/85 px-3.5 text-left text-sm font-normal shadow-sm hover:border-accent/40 hover:bg-background/85 focus-visible:border-accent/50 focus-visible:ring-4 focus-visible:ring-accent/10 focus-visible:ring-offset-0 lg:h-10 lg:px-3">
            <span className={cn("truncate", selectedValues.length === 0 && "text-muted-foreground")}>
              {selectedValues.length > 0
                ? `${selectedValues.length} ${selectedValues.length === 1 ? singularLabel : pluralLabel} seleccionado${selectedValues.length === 1 ? "" : "s"}`
                : placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>No se encontro.</CommandEmpty>
              <CommandGroup>
                {canUseTypedValue && (
                  <CommandItem
                    value={cleanSearch}
                    disabled={hasReachedLimit}
                    onSelect={() => {
                      toggleValue(cleanSearch);
                      setSearch("");
                    }}
                  >
                    <FilePlus2 className="mr-2 h-4 w-4" />
                    Usar "{cleanSearch}"
                  </CommandItem>
                )}
                {filteredOptions.map((option) => {
                  const normalizedOption = normalizeSelectionValue(option);
                  const isSelected = selectedSet.has(normalizedOption);
                  const isBlocked = blockedSet.has(normalizedOption);
                  const isDisabled = isBlocked || (!isSelected && hasReachedLimit);

                  return (
                    <CommandItem key={option} value={option} disabled={isDisabled} onSelect={() => toggleValue(option)}>
                      <Checkbox checked={isSelected} disabled={isDisabled} className="mr-2" />
                      <span className="truncate">{option}</span>
                      {isBlocked && blockedLabel && <span className="ml-auto text-[0.68rem] font-semibold text-muted-foreground">{blockedLabel}</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
            {hasReachedLimit && maxText && (
              <p className="border-t border-border/60 px-3 py-2 text-[0.7rem] font-medium text-muted-foreground">
                {maxText}
              </p>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      {selectedValues.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className={renderSelected ? "space-y-1.5" : "flex flex-wrap gap-1.5"}>
          {selectedValues.map((item) => renderSelected ? (
            <div key={item}>{renderSelected(item, () => removeValue(item))}</div>
          ) : (
            <Badge key={item} variant="secondary" className="gap-1.5 rounded-md border border-border/60 bg-muted/70 pr-1 text-muted-foreground">
              <span>{item}</span>
              <button
                type="button"
                className="rounded-sm p-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Quitar ${item}`}
                onClick={() => removeValue(item)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

const BoatReportForm = ({
  data,
  onChange,
  onSave,
  onCancel,
  saving,
  hideActions,
  stationOptions = [],
  unitOptions = [],
  peopleOptions = [],
  motiveOptions = [],
  siteOptions = [],
  showPendingState = true,
  saveLabel = "Guardar Reporte",
  autoCalculateMotorHours = false,
  autoFillBoatBitacora = false,
  useFuelLoadToggle = false,
  fuelLoadEnabled: controlledFuelLoadEnabled,
  onFuelLoadEnabledChange,
  onDelete,
  deleting = false,
  deleteLabel,
}: Props) => {
  const hasFuelLoadData =
    !isEmptyReportValue(data.saldo_anterior) ||
    !isEmptyReportValue(data.combustible_trasegado_bodega) ||
    !isEmptyReportValue(data.combustible_trasegado_durante) ||
    !isEmptyReportValue(data.tipo_combustible) ||
    !isEmptyReportValue(data.estacion_combustible) ||
    !isEmptyReportValue(data.lugar_combustible) ||
    !isEmptyReportValue(data.cedula_juridica_combustible) ||
    !isEmptyReportValue(data.no_factura);
  const [numericFieldWarnings, setNumericFieldWarnings] = useState<Partial<Record<keyof BoatFormData, boolean>>>({});
  const [fuelLoadEnabledState, setFuelLoadEnabledState] = useState(() => !useFuelLoadToggle || hasFuelLoadData);
  const fuelLoadEnabled = controlledFuelLoadEnabled ?? fuelLoadEnabledState;
  const [fuelBalanceManuallyEdited, setFuelBalanceManuallyEdited] = useState(false);
  const officerOptions = OFFICER_OPTIONS;

  const update = (key: keyof BoatFormData, value: unknown) => {
    onChange({ ...data, [key]: value });
  };

  const getAutoFuelBalance = (totalAntes: unknown, combustibleGastado: unknown) => {
    if (typeof totalAntes !== "number" || !Number.isFinite(totalAntes)) return null;
    if (typeof combustibleGastado !== "number" || !Number.isFinite(combustibleGastado)) return null;
    return Number((totalAntes - combustibleGastado).toFixed(3));
  };

  const updateWithFuelBalance = (nextData: BoatFormData) => {
    if (fuelBalanceManuallyEdited) {
      onChange(nextData);
      return;
    }

    onChange({
      ...nextData,
      saldo_despues: getAutoFuelBalance(nextData.total_antes_viaje, nextData.combustible_gastado),
    });
  };

  const withMotorHours = (nextData: BoatFormData, horaSalida: string, horaRegreso: string) => {
    if (!autoCalculateMotorHours) return nextData;
    const motorHours = calculateMotorHours(horaSalida, horaRegreso);
    return {
      ...nextData,
      horas_motor_babor: motorHours,
      horas_motor_centro: motorHours,
      horas_motor_estribor: motorHours,
    };
  };

  const updateTime = (key: "hora_salida" | "hora_regreso", value: string) => {
    const nextData = { ...data, [key]: value };
    onChange(withMotorHours(nextData, nextData.hora_salida, nextData.hora_regreso));
  };

  const updateEmbarcacion = (value: string) => {
    onChange({
      ...data,
      embarcacion: value,
      ...(autoFillBoatBitacora ? { bitacora: getBoatBitacora(value) } : {}),
    });
  };

  const updatePersonWithCedula = (
    nameKey: "capitan" | "encargado_mision" | "oficial_director" | "operacional",
    cedulaKey: "capitan_cedula" | "encargado_mision_cedula" | "oficial_director_cedula" | "operacional_cedula",
    value: string,
  ) => {
    const cleanValue = normalizeKnownPersonName(value);
    const officer = findOfficerByName(cleanValue);
    onChange({
      ...data,
      [nameKey]: cleanValue,
      ...(officer ? { [cedulaKey]: officer.identificacion || "" } : {}),
    });
  };

  const updateFuelProvider = (value: string) => {
    const provider = findFuelProvider(value);
    onChange({
      ...data,
      estacion_combustible: value,
      ...(provider
        ? {
            lugar_combustible: provider.place,
            cedula_juridica_combustible: provider.legalId,
          }
        : {}),
    });
  };

  const clearFuelLoadFields = () => {
    onChange({
      ...data,
      saldo_anterior: null,
      combustible_trasegado_bodega: null,
      combustible_trasegado_durante: null,
      tipo_combustible: "",
      estacion_combustible: "",
      lugar_combustible: "",
      cedula_juridica_combustible: "",
      no_factura: "",
    });
  };

  const toggleFuelLoad = (checked: boolean | "indeterminate") => {
    const enabled = checked === true;
    setFuelLoadEnabledState(enabled);
    onFuelLoadEnabledChange?.(enabled);

    if (!enabled) {
      clearFuelLoadFields();
      return;
    }

    onChange({
      ...data,
      tipo_combustible: data.tipo_combustible || "Gasolina",
      saldo_despues: fuelBalanceManuallyEdited
        ? data.saldo_despues
        : getAutoFuelBalance(data.total_antes_viaje, data.combustible_gastado),
    });
  };

  const pendingInputClass = (value: unknown, className = "h-10 text-sm") =>
    cn(className, showPendingState && isEmptyReportValue(value) && "report-field-pending");

  const PendingHint = ({ show }: { show: boolean }) =>
    showPendingState && show ? <p className="report-pending-hint">Dato pendiente</p> : null;

  const NumericHint = ({ show }: { show: boolean }) =>
    show ? <p className="report-pending-hint">Solo se deben usar numeros</p> : null;

  const hasPendingItems = (items: unknown[]) =>
    items.length === 0 || items.some((item) => isEmptyReportValue(item));

  const SectionTitle = ({ title }: { title: string }) => (
    <h4 className="border-b border-border/60 pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {title}
    </h4>
  );

  const fieldShell = (key: keyof BoatFormData, label: string, input: ReactNode) => {
    const pending = isEmptyReportValue(data[key]);
    return (
      <div className="min-w-0 space-y-1">
        <Label className="text-xs">{label}</Label>
        {input}
        <PendingHint show={pending} />
      </div>
    );
  };

  const numField = (key: keyof BoatFormData, label: string) =>
    fieldShell(key, label, (
      <Input
        type="number"
        step="any"
        value={(data[key] as number) ?? ""}
        onChange={(event) => update(key, event.target.value ? Number(event.target.value) : null)}
        className={pendingInputClass(data[key])}
      />
    ));

  const fuelNumberField = (key: keyof BoatFormData, label: string) =>
    fieldShell(key, label, (
      <Input
        type="number"
        step="any"
        value={(data[key] as number) ?? ""}
        onChange={(event) => {
          const value = event.target.value ? Number(event.target.value) : null;
          updateWithFuelBalance({ ...data, [key]: value });
        }}
        className={pendingInputClass(data[key])}
      />
    ));

  const fuelBalanceField = () =>
    fieldShell("saldo_despues", "Saldo Despues", (
      <Input
        type="number"
        step="any"
        value={data.saldo_despues ?? ""}
        onChange={(event) => {
          const value = event.target.value ? Number(event.target.value) : null;
          if (value == null) {
            setFuelBalanceManuallyEdited(false);
            update("saldo_despues", getAutoFuelBalance(data.total_antes_viaje, data.combustible_gastado));
            return;
          }

          setFuelBalanceManuallyEdited(true);
          update("saldo_despues", value);
        }}
        className={pendingInputClass(data.saldo_despues)}
      />
    ));

  const motorField = (key: "horas_motor_babor" | "horas_motor_centro" | "horas_motor_estribor", label: string) =>
    fieldShell(key, label, (
      <Input
        type="text"
        inputMode="numeric"
        placeholder="00:00"
        value={formatMotorHoursValue(data[key])}
        onChange={(event) => update(key, parseMotorHoursValue(event.target.value))}
        className={pendingInputClass(data[key])}
      />
    ));

  const textField = (key: keyof BoatFormData, label: string, type = "text") =>
    fieldShell(key, label, (
      <Input
        type={type}
        value={(data[key] as string) || ""}
        onChange={(event) => update(key, event.target.value)}
        className={pendingInputClass(data[key])}
      />
    ));

  const digitsField = (key: keyof BoatFormData, label: string, maxLength: number) =>
    fieldShell(key, label, (
      <>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={maxLength}
          value={(data[key] as string) || ""}
          onChange={(event) => {
            const rawValue = event.target.value;
            const numericValue = rawValue.replace(/\D/g, "").slice(0, maxLength);
            setNumericFieldWarnings((current) => ({ ...current, [key]: rawValue !== numericValue }));
            update(key, numericValue);
          }}
          className={pendingInputClass(data[key])}
        />
        <NumericHint show={!!numericFieldWarnings[key]} />
      </>
    ));

  const comboboxField = (
    key: keyof BoatFormData,
    label: string,
    options: string[],
    placeholder = "Seleccionar o escribir...",
  ) =>
    fieldShell(key, label, (
      <ReportComboboxInput
        value={(data[key] as string) || ""}
        onChange={(value) => update(key, value)}
        options={options}
        placeholder={placeholder}
        className={pendingInputClass(data[key])}
      />
    ));

  const timeField = (key: "hora_salida" | "hora_regreso", label: string) =>
    fieldShell(key, label, (
      <Input
        type="time"
        value={data[key] || ""}
        onChange={(event) => updateTime(key, event.target.value)}
        className={pendingInputClass(data[key])}
      />
    ));

  const stringListField = (key: "motivos" | "personas_particulares", label: string) => {
    const items = data[key] as string[];
    const options = key === "motivos" ? motiveOptions : [];
    return (
      <div className={cn("space-y-2", showPendingState && hasPendingItems(items) && "report-list-pending")}>
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">{label}</Label>
          <Button type="button" variant="ghost" size="sm" onClick={() => update(key, [...items, ""])}><Plus className="h-3 w-3 mr-1" />Agregar</Button>
        </div>
        {items.map((value, index) => (
          <div key={index} className="space-y-1">
            <div className="flex gap-1">
              {key === "motivos" ? (
                <ReportComboboxInput
                  value={value}
                  onChange={(nextValue) => { const next = [...items]; next[index] = nextValue; update(key, next); }}
                  options={options}
                  className={pendingInputClass(value, "h-8 lg:h-8 px-3 py-0 text-sm")}
                />
              ) : (
                <Input value={value} onChange={(event) => { const next = [...items]; next[index] = event.target.value; update(key, next); }} className={pendingInputClass(value, "h-8 lg:h-8 px-3 py-0 text-sm")} />
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => update(key, items.filter((_, idx) => idx !== index))}><Trash2 className="h-3 w-3" /></Button>
            </div>
            <PendingHint show={isEmptyReportValue(value)} />
          </div>
        ))}
        <PendingHint show={items.length === 0} />
      </div>
    );
  };

  const updateTripulantes = (names: string[]) => {
    const cleanNames = normalizeKnownPersonNames(names);
    const seen = new Set<string>();
    const next = cleanNames.reduce<BoatPersonData[]>((items, name) => {
      const key = normalizePersonSelectionValue(name);
      if (!key || seen.has(key)) return items;
      seen.add(key);
      return [
        ...items,
        {
          nombre: name,
          cedula: findOfficerByName(name)?.identificacion || "",
        },
      ];
    }, []);
    update("tripulantes", next);
  };

  const updateSitio = (index: number, key: keyof BoatSiteData, value: string) => {
    const next = [...data.sitios_visitados];
    next[index] = { ...next[index], [key]: value };
    update("sitios_visitados", next);
  };

  const updateSitioNombre = (index: number, value: string) => {
    const siteOption = findSiteOption(siteOptions, value);
    const next = [...data.sitios_visitados];
    next[index] = {
      ...next[index],
      nombre_sitio: value,
      ...(siteOption
        ? {
            zona: siteOption.zona,
            posicion: siteOption.posicion,
          }
        : {}),
    };
    update("sitios_visitados", next);
  };

  const updateInspectedBoat = (index: number, key: keyof InspectedBoatData, value: string) => {
    const next = [...data.embarcaciones_inspeccionadas];
    next[index] = { ...next[index], [key]: value };
    update("embarcaciones_inspeccionadas", next);
  };

  return (
    <Card className="space-y-4 p-4 animate-fade-in">
      <div className="flex flex-col gap-1 border-b border-border/70 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Reporte de Embarcacion - Revisar Datos</h3>
          <p className="text-xs text-muted-foreground">Distribucion basada en la plantilla Excel de embarcaciones.</p>
        </div>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Viaje / tripulacion / combustible
        </div>
      </div>

      <section className="space-y-3 rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-background/45 p-3">
        <SectionTitle title="Encabezado del reporte" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {digitsField("no_reporte", "N. Reporte", 4)}
          {textField("fecha", "Fecha", "date")}
          {fieldShell("embarcacion", "Embarcacion", (
            <ReportComboboxInput
              value={data.embarcacion || ""}
              onChange={updateEmbarcacion}
              options={unitOptions}
              className={pendingInputClass(data.embarcacion)}
            />
          ))}
          {digitsField("bitacora", "Bitacora", 2)}
          {textField("folios", "Folios")}
          {textField("no_cierre_os", "N. Cierre OS")}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {timeField("hora_salida", "Hora Salida")}
          {timeField("hora_regreso", "Hora Regreso")}
          {motorField("horas_motor_babor", "Motor Babor")}
          {motorField("horas_motor_centro", "Motor Centro")}
          {motorField("horas_motor_estribor", "Motor Estribor")}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(23rem,0.95fr)]">
        <div className="space-y-4">
          <section className="space-y-3 rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-background/45 p-3">
            <SectionTitle title="Personal de embarcacion" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {fieldShell("capitan", "Capitan", (
                <ReportComboboxInput
                  value={data.capitan || ""}
                  onChange={(value) => updatePersonWithCedula("capitan", "capitan_cedula", value)}
                  options={officerOptions}
                  className={pendingInputClass(data.capitan)}
                />
              ))}
              {textField("capitan_cedula", "Cedula Capitan")}
              {fieldShell("encargado_mision", "Encargado de Mision", (
                <ReportComboboxInput
                  value={data.encargado_mision || ""}
                  onChange={(value) => updatePersonWithCedula("encargado_mision", "encargado_mision_cedula", value)}
                  options={officerOptions}
                  className={pendingInputClass(data.encargado_mision)}
                />
              ))}
              {textField("encargado_mision_cedula", "Cedula Encargado")}
              {fieldShell("oficial_director", "Oficial Director / Ambiental", (
                <ReportComboboxInput
                  value={data.oficial_director || ""}
                  onChange={(value) => updatePersonWithCedula("oficial_director", "oficial_director_cedula", value)}
                  options={officerOptions}
                  className={pendingInputClass(data.oficial_director)}
                />
              ))}
              {textField("oficial_director_cedula", "Cedula Oficial Director")}
            </div>

            <div>
              <MultiValueSelector
                label="Tripulantes"
                value={data.tripulantes.map((tripulante) => tripulante.nombre).filter(Boolean)}
                onChange={updateTripulantes}
                options={officerOptions}
                singularLabel="tripulante"
                pluralLabel="tripulantes"
                placeholder="Seleccionar tripulantes..."
                searchPlaceholder="Buscar o escribir tripulante..."
                emptyText="Sin tripulantes seleccionados"
                pending={showPendingState && hasPendingItems(data.tripulantes)}
              />
              <PendingHint show={data.tripulantes.length === 0} />
            </div>

            <div className="border-t border-border/60 pt-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {fieldShell("operacional", "Operacional", (
                  <ReportComboboxInput
                    value={data.operacional || ""}
                    onChange={(value) => updatePersonWithCedula("operacional", "operacional_cedula", value)}
                    options={officerOptions}
                    className={pendingInputClass(data.operacional)}
                  />
                ))}
                {textField("operacional_cedula", "Cedula Operacional")}
              </div>
            </div>

            {stringListField("personas_particulares", "Personas Particulares")}
          </section>

          <section className="space-y-3 rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-background/45 p-3">
            <SectionTitle title="Novedades y motivos" />
            <div>
              <MultiValueSelector
                label="Motivos"
                value={data.motivos}
                onChange={(nextValue) => update("motivos", nextValue)}
                options={motiveOptions}
                maxSelected={MAX_MOTIVOS}
                singularLabel="motivo"
                pluralLabel="motivos"
                placeholder="Seleccionar motivos..."
                searchPlaceholder="Buscar o escribir motivo..."
                emptyText="Sin motivos seleccionados"
                maxText="Maximo 10 motivos seleccionados."
                pending={showPendingState && hasPendingItems(data.motivos)}
              />
              <PendingHint show={data.motivos.length === 0} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Novedades</Label>
              <Textarea value={data.novedades} onChange={(event) => update("novedades", event.target.value)} rows={8} className={pendingInputClass(data.novedades, "text-sm")} />
              <PendingHint show={isEmptyReportValue(data.novedades)} />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className={cn("space-y-3 rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-background/45 p-3", showPendingState && hasPendingItems(data.sitios_visitados) && "report-list-pending")}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {comboboxField("estacion", "Estacion", stationOptions)}
              {textField("destino", "Destino")}
            </div>
            <div className="space-y-3 border-t border-border/60 pt-3">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1">
                <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sitios / posiciones</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => update("sitios_visitados", [...data.sitios_visitados, { nombre_sitio: "", zona: "", posicion: "" }])}><Plus className="h-3 w-3 mr-1" />Agregar</Button>
              </div>
              <div className={cn("hidden gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:grid", siteRowGridClass)}>
                <span>Nombre</span>
                <span>Zona</span>
                <span>Posicion</span>
                <span />
              </div>
              {data.sitios_visitados.map((site, index) => (
                <div key={index} className="space-y-1">
                  <div className={cn("grid gap-1", siteRowGridClass)}>
                    <ReportComboboxInput
                      value={site.nombre_sitio}
                      onChange={(value) => updateSitioNombre(index, value)}
                      options={siteOptions.map((option) => option.nombre_sitio)}
                      placeholder="Nombre"
                      className={pendingInputClass(site.nombre_sitio, compactRowInputClass)}
                    />
                    <Input placeholder="Zona" value={site.zona} onChange={(event) => updateSitio(index, "zona", event.target.value)} className={pendingInputClass(site.zona, compactRowInputClass)} />
                    <Input placeholder="Posicion" value={site.posicion} onChange={(event) => updateSitio(index, "posicion", event.target.value)} className={pendingInputClass(site.posicion, compactRowInputClass)} />
                    <Button type="button" variant="ghost" size="sm" className={compactDeleteButtonClass} aria-label="Eliminar sitio visitado" onClick={() => update("sitios_visitados", data.sitios_visitados.filter((_, idx) => idx !== index))}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  <PendingHint show={isEmptyReportValue(site)} />
                </div>
              ))}
              <PendingHint show={data.sitios_visitados.length === 0} />
            </div>
          </section>

          <section className={cn("space-y-3 rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-background/45 p-3", showPendingState && hasPendingItems(data.embarcaciones_inspeccionadas) && "report-list-pending")}>
            <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1">
              <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Embarcaciones inspeccionadas</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => update("embarcaciones_inspeccionadas", [...data.embarcaciones_inspeccionadas, { nombre: "", matricula: "", no_inspeccion: "", zona: "" }])}><Plus className="h-3 w-3 mr-1" />Agregar</Button>
            </div>
            <div className={cn("hidden gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground lg:grid", inspectedBoatRowGridClass)}>
              <span>Nombre</span>
              <span>Matricula</span>
              <span>N. Inspeccion</span>
              <span>Zona</span>
              <span />
            </div>
            {data.embarcaciones_inspeccionadas.map((boat, index) => (
              <div key={index} className="space-y-1">
                <div className={cn("grid gap-1", inspectedBoatRowGridClass)}>
                  <Input placeholder="Nombre" value={boat.nombre} onChange={(event) => updateInspectedBoat(index, "nombre", event.target.value)} className={pendingInputClass(boat.nombre, compactRowInputClass)} />
                  <Input placeholder="Matricula" value={boat.matricula} onChange={(event) => updateInspectedBoat(index, "matricula", event.target.value)} className={pendingInputClass(boat.matricula, compactRowInputClass)} />
                  <Input placeholder="N. Inspeccion" value={boat.no_inspeccion} onChange={(event) => updateInspectedBoat(index, "no_inspeccion", event.target.value)} className={pendingInputClass(boat.no_inspeccion, compactRowInputClass)} />
                  <Input placeholder="Zona" value={boat.zona} onChange={(event) => updateInspectedBoat(index, "zona", event.target.value)} className={pendingInputClass(boat.zona, compactRowInputClass)} />
                  <Button type="button" variant="ghost" size="sm" className={compactDeleteButtonClass} aria-label="Eliminar embarcacion inspeccionada" onClick={() => update("embarcaciones_inspeccionadas", data.embarcaciones_inspeccionadas.filter((_, idx) => idx !== index))}><Trash2 className="h-3 w-3" /></Button>
                </div>
                <PendingHint show={isEmptyReportValue(boat)} />
              </div>
            ))}
            <PendingHint show={data.embarcaciones_inspeccionadas.length === 0} />
          </section>
        </div>
      </div>

      <section className="space-y-3 rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-background/45 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Combustible y recorrido
            </h4>
            {useFuelLoadToggle && <div className="hidden h-6 w-px bg-border sm:block" />}
          </div>
          {useFuelLoadToggle && (
            <label
              className={cn(
                "flex w-fit items-center gap-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                fuelLoadEnabled ? "text-primary" : "text-muted-foreground hover:text-primary",
              )}
            >
              <Checkbox checked={fuelLoadEnabled} onCheckedChange={toggleFuelLoad} />
              Trasegado de combustible
            </label>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {fuelNumberField("total_antes_viaje", "Total Antes Viaje")}
          {fuelNumberField("combustible_gastado", "Gastado")}
          {fuelBalanceField()}
          {numField("millas_nauticas", "Millas Nauticas")}
        </div>

        {(!useFuelLoadToggle || fuelLoadEnabled) && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[0.8fr_1fr_0.9fr_0.85fr_0.7fr]">
              {textField("tipo_combustible", "Tipo Combustible")}
              {fieldShell("estacion_combustible", "Estacion de Combustible", (
                <ReportComboboxInput
                  value={data.estacion_combustible || ""}
                  onChange={updateFuelProvider}
                  options={FUEL_PROVIDER_OPTIONS}
                  className={pendingInputClass(data.estacion_combustible)}
                />
              ))}
              {textField("lugar_combustible", "Lugar")}
              {textField("cedula_juridica_combustible", "Cedula Juridica")}
              {textField("no_factura", "N. Factura")}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {numField("saldo_anterior", "Saldo Anterior")}
              {numField("combustible_trasegado_bodega", "Trasegado Bodega")}
              {numField("combustible_trasegado_durante", "Trasegado Durante")}
            </div>
          </>
        )}
      </section>

      {!hideActions && (
        <ReportFormActionBar
          onSave={onSave}
          onCancel={onCancel}
          saving={saving}
          saveLabel={saveLabel}
          onDelete={onDelete}
          deleting={deleting}
          deleteLabel={deleteLabel}
        />
      )}
    </Card>
  );
};

export default BoatReportForm;
