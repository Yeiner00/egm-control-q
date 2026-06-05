import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, FilePlus2, X, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasEmptyReportValue, isEmptyReportValue } from "@/lib/missingData";
import { findFuelProvider, FUEL_PROVIDER_OPTIONS } from "@/lib/fuelProviders";
import { findSiteOption, type ReportSiteOption } from "@/lib/reportSites";
import { findOfficerByName, normalizeKnownPersonName, normalizeKnownPersonNames } from "@/lib/officers";
import { normalizeNameKey } from "@/lib/normalizeName";
import ReportComboboxInput from "@/components/estadisticas/ReportComboboxInput";
import ReportFormActionBar from "@/components/estadisticas/ReportFormActionBar";

export interface VehicleSiteData {
  nombre_sitio: string;
  zona: string;
  posicion: string;
}

export interface VehicleFormData {
  no_reporte: string;
  bitacora: string;
  fecha: string;
  hora_salida: string;
  hora_regreso: string;
  estacion: string;
  vehiculo: string;
  destino: string;
  motivos: string[];
  chofer: string;
  chofer_cedula: string;
  acompanantes: string[];
  oficial_a_cargo: string;
  oficial_a_cargo_cedula: string;
  sitios_visitados: VehicleSiteData[];
  estacion_combustible: string;
  lugar_combustible: string;
  cedula_juridica_combustible: string;
  no_factura: string;
  combustible_trasegado_bomba: number | null;
  total_combustible_antes_viaje: number | null;
  combustible_gastado: number | null;
  saldo_combustible_despues_viaje: number | null;
  kilometros_recorridos: number | null;
  novedades: string;
}

interface Props {
  data: VehicleFormData;
  onChange: (data: VehicleFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  hideActions?: boolean;
  stationOptions?: string[];
  unitOptions?: string[];
  peopleOptions?: string[];
  motiveOptions?: string[];
  siteOptions?: ReportSiteOption[];
  useFuelLoadToggle?: boolean;
  fuelLoadEnabled?: boolean;
  onFuelLoadEnabledChange?: (enabled: boolean) => void;
  showPendingState?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  onDelete?: () => void;
  deleting?: boolean;
  deleteLabel?: string;
}

const MAX_ACOMPANANTES = 4;
const MAX_MOTIVOS = 10;
const siteRowGridClass = "sm:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)_minmax(0,0.9fr)_2rem]";
const compactRowInputClass = "min-w-0 h-8 lg:h-8 px-3 py-0 text-sm";
const compactDeleteButtonClass = "h-8 w-8 shrink-0 px-0";
const VEHICLE_BITACORA_BY_UNIT: Record<string, string> = {
  "SNG-08": "02",
  "SNG-16": "03",
  "SNG-25": "02",
};

const normalizeSelectionValue = (value: string) => value.trim().toLocaleLowerCase();

const normalizePersonSelectionValue = (value: string) => normalizeNameKey(normalizeKnownPersonName(value));

const normalizeVehicleKey = (value: string) => value.trim().toLocaleUpperCase();

const getVehicleBitacora = (vehicle: string) => {
  const vehicleKey = normalizeVehicleKey(vehicle);
  if (!vehicleKey) return "";
  return VEHICLE_BITACORA_BY_UNIT[vehicleKey] ?? "00";
};

interface MultiValueSelectorProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: string[];
  maxSelected: number;
  singularLabel: string;
  pluralLabel: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  maxText: string;
  blockedValue?: string;
  blockedLabel?: string;
  pending: boolean;
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
  blockedValue,
  blockedLabel,
  pending,
}: MultiValueSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const cleanSearch = search.trim();
  const selectedValues = value.filter((item) => item.trim());
  const selectedSet = useMemo(
    () => new Set(selectedValues.map(normalizeSelectionValue)),
    [selectedValues],
  );
  const blockedNormalized = normalizeSelectionValue(blockedValue || "");
  const hasReachedLimit = selectedValues.length >= maxSelected;

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

    onChange(uniqueValues.slice(0, maxSelected));
  };

  const toggleValue = (nextValue: string) => {
    const normalizedValue = normalizeSelectionValue(nextValue);
    if (!normalizedValue || normalizedValue === blockedNormalized) return;
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
    typedValueNormalized !== blockedNormalized &&
    !selectedSet.has(typedValueNormalized) &&
    !options.some((option) => normalizeSelectionValue(option) === typedValueNormalized);
  const typedValueDisabled = hasReachedLimit;

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
                    disabled={typedValueDisabled}
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
                  const isBlocked = normalizedOption === blockedNormalized;
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
            {hasReachedLimit && (
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
        <div className="flex flex-wrap gap-1.5">
          {selectedValues.map((item) => (
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

const VehicleReportForm = ({
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
  useFuelLoadToggle = false,
  fuelLoadEnabled: controlledFuelLoadEnabled,
  onFuelLoadEnabledChange,
  showPendingState = true,
  saveLabel = "Guardar Reporte",
  cancelLabel,
  onDelete,
  deleting = false,
  deleteLabel,
}: Props) => {
  const hasFuelLoadData =
    !isEmptyReportValue(data.estacion_combustible) ||
    !isEmptyReportValue(data.lugar_combustible) ||
    !isEmptyReportValue(data.cedula_juridica_combustible) ||
    !isEmptyReportValue(data.no_factura) ||
    !isEmptyReportValue(data.combustible_trasegado_bomba) ||
    !isEmptyReportValue(data.total_combustible_antes_viaje) ||
    !isEmptyReportValue(data.saldo_combustible_despues_viaje);
  const [numericFieldWarnings, setNumericFieldWarnings] = useState<Partial<Record<keyof VehicleFormData, boolean>>>({});
  const [fuelLoadEnabledState, setFuelLoadEnabledState] = useState(() => !useFuelLoadToggle || hasFuelLoadData);
  const fuelLoadEnabled = controlledFuelLoadEnabled ?? fuelLoadEnabledState;
  const [fuelBalanceManuallyEdited, setFuelBalanceManuallyEdited] = useState(false);

  const update = (key: keyof VehicleFormData, value: unknown) => {
    onChange({ ...data, [key]: value });
  };

  const updateChofer = (value: string) => {
    const cleanValue = normalizeKnownPersonName(value);
    const normalizedValue = normalizePersonSelectionValue(cleanValue);
    const officer = findOfficerByName(cleanValue);
    onChange({
      ...data,
      chofer: cleanValue,
      ...(officer ? { chofer_cedula: officer.identificacion || "" } : {}),
      acompanantes: data.acompanantes.filter((acompanante) => normalizePersonSelectionValue(acompanante) !== normalizedValue),
    });
  };

  const updateVehiculo = (value: string) => {
    onChange({
      ...data,
      vehiculo: value,
      bitacora: getVehicleBitacora(value),
    });
  };

  const updateOficial = (value: string) => {
    const cleanValue = normalizeKnownPersonName(value);
    const officer = findOfficerByName(cleanValue);
    onChange({
      ...data,
      oficial_a_cargo: cleanValue,
      ...(officer ? { oficial_a_cargo_cedula: officer.identificacion || "" } : {}),
    });
  };

  const getAutoFuelBalance = (totalAntes: unknown, combustibleGastado: unknown) => {
    if (typeof totalAntes !== "number" || !Number.isFinite(totalAntes)) return null;
    if (typeof combustibleGastado !== "number" || !Number.isFinite(combustibleGastado)) return null;
    return Number((totalAntes - combustibleGastado).toFixed(3));
  };

  const updateWithFuelBalance = (nextData: VehicleFormData) => {
    if (!useFuelLoadToggle || !fuelLoadEnabled || fuelBalanceManuallyEdited) {
      onChange(nextData);
      return;
    }

    const autoBalance = getAutoFuelBalance(
      nextData.total_combustible_antes_viaje,
      nextData.combustible_gastado,
    );

    onChange({
      ...nextData,
      saldo_combustible_despues_viaje: autoBalance,
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
    setFuelBalanceManuallyEdited(false);
    onChange({
      ...data,
      estacion_combustible: "",
      lugar_combustible: "",
      cedula_juridica_combustible: "",
      no_factura: "",
      combustible_trasegado_bomba: null,
      total_combustible_antes_viaje: null,
      saldo_combustible_despues_viaje: null,
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

    setFuelBalanceManuallyEdited(false);
    const autoBalance = getAutoFuelBalance(
      data.total_combustible_antes_viaje,
      data.combustible_gastado,
    );
    if (autoBalance != null) {
      onChange({ ...data, saldo_combustible_despues_viaje: autoBalance });
    }
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

  const field = (key: keyof VehicleFormData, label: string, input: ReactNode) => {
    const pending = isEmptyReportValue(data[key]);
    return (
      <div className="min-w-0 space-y-1">
        <Label className="text-xs">{label}</Label>
        {input}
        <PendingHint show={pending} />
      </div>
    );
  };

  const textInput = (key: keyof VehicleFormData, label: string, type = "text") =>
    field(key, label, (
      <Input
        type={type}
        value={(data[key] as string) || ""}
        onChange={(event) => update(key, event.target.value)}
        className={pendingInputClass(data[key])}
      />
    ));

  const digitsInput = (key: keyof VehicleFormData, label: string, maxLength: number) =>
    field(key, label, (
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

  const comboboxInput = (
    key: keyof VehicleFormData,
    label: string,
    options: string[],
    placeholder = "Seleccionar o escribir...",
  ) =>
    field(key, label, (
      <ReportComboboxInput
        value={(data[key] as string) || ""}
        onChange={(value) => update(key, value)}
        options={options}
        placeholder={placeholder}
        className={pendingInputClass(data[key])}
      />
    ));

  const numberInput = (key: keyof VehicleFormData, label: string) =>
    field(key, label, (
      <Input
        type="number"
        step="any"
        value={(data[key] as number) ?? ""}
        onChange={(event) => update(key, event.target.value ? Number(event.target.value) : null)}
        className={pendingInputClass(data[key])}
      />
    ));

  const fuelNumberInput = (key: keyof VehicleFormData, label: string) =>
    field(key, label, (
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

  const fuelBalanceInput = () =>
    field("saldo_combustible_despues_viaje", "Saldo Despues (L)", (
      <Input
        type="number"
        step="any"
        value={data.saldo_combustible_despues_viaje ?? ""}
        onChange={(event) => {
          const value = event.target.value ? Number(event.target.value) : null;
          if (value == null) {
            setFuelBalanceManuallyEdited(false);
            const autoBalance = getAutoFuelBalance(
              data.total_combustible_antes_viaje,
              data.combustible_gastado,
            );
            update("saldo_combustible_despues_viaje", autoBalance);
            return;
          }

          setFuelBalanceManuallyEdited(true);
          update("saldo_combustible_despues_viaje", value);
        }}
        className={pendingInputClass(data.saldo_combustible_despues_viaje)}
      />
    ));

  const addSitio = () => update("sitios_visitados", [...data.sitios_visitados, { nombre_sitio: "", zona: "", posicion: "" }]);
  const removeSitio = (i: number) => update("sitios_visitados", data.sitios_visitados.filter((_, idx) => idx !== i));
  const updateSitio = (i: number, key: keyof VehicleSiteData, v: string) => {
    const s = [...data.sitios_visitados];
    s[i] = { ...s[i], [key]: v };
    update("sitios_visitados", s);
  };

  const updateSitioNombre = (i: number, value: string) => {
    const siteOption = findSiteOption(siteOptions, value);
    const s = [...data.sitios_visitados];
    s[i] = {
      ...s[i],
      nombre_sitio: value,
      ...(siteOption
        ? {
            zona: siteOption.zona,
            posicion: siteOption.posicion,
          }
        : {}),
    };
    update("sitios_visitados", s);
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="panel-card text-card-foreground space-y-4 p-4 animate-fade-in"
    >
      <div className="flex flex-col gap-1 border-b border-border/70 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Reporte de Vehiculo - Revisar Datos</h3>
          <p className="text-xs text-muted-foreground">Distribucion basada en la plantilla Excel de vehiculos.</p>
        </div>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Consecutivo / viaje / sitios
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
        <div className="space-y-4">
          <section className="space-y-3 rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-background/45 p-3">
            <SectionTitle title="Encabezado del viaje" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2">
              {digitsInput("no_reporte", "N. Reporte", 4)}
              {textInput("fecha", "Fecha", "date")}
              {textInput("hora_salida", "Hora Salida", "time")}
              {textInput("hora_regreso", "Hora Regreso", "time")}
              {field("vehiculo", "Vehiculo", (
                <ReportComboboxInput
                  value={data.vehiculo || ""}
                  onChange={updateVehiculo}
                  options={unitOptions}
                  className={pendingInputClass(data.vehiculo)}
                />
              ))}
              {digitsInput("bitacora", "Bitacora", 2)}
            </div>
          </section>

          <section className="space-y-3 rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-background/45 p-3">
            <SectionTitle title="Personal de movil" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {field("chofer", "Chofer", (
                <ReportComboboxInput
                  value={data.chofer || ""}
                  onChange={updateChofer}
                  options={peopleOptions}
                  className={pendingInputClass(data.chofer)}
                />
              ))}
              {textInput("chofer_cedula", "Cedula Chofer")}
            </div>

            <div>
              <MultiValueSelector
                label="Acompanantes"
                value={data.acompanantes}
                onChange={(nextValue) => update("acompanantes", normalizeKnownPersonNames(nextValue))}
                options={peopleOptions}
                maxSelected={MAX_ACOMPANANTES}
                singularLabel="acompanante"
                pluralLabel="acompanantes"
                placeholder="Seleccionar acompanantes..."
                searchPlaceholder="Buscar o escribir acompanante..."
                emptyText="Sin acompanantes seleccionados"
                maxText="Maximo 4 acompanantes seleccionados."
                blockedValue={data.chofer}
                blockedLabel="Chofer"
                pending={showPendingState && hasPendingItems(data.acompanantes)}
              />
              <PendingHint show={data.acompanantes.length === 0} />
            </div>

            <div className="border-t border-border/60 pt-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {field("oficial_a_cargo", "Oficial a Cargo", (
                  <ReportComboboxInput
                    value={data.oficial_a_cargo || ""}
                    onChange={updateOficial}
                    options={peopleOptions}
                    className={pendingInputClass(data.oficial_a_cargo)}
                  />
                ))}
                {textInput("oficial_a_cargo_cedula", "Cedula Oficial")}
              </div>
            </div>
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
              <Textarea value={data.novedades} onChange={(event) => update("novedades", event.target.value)} rows={7} className={pendingInputClass(data.novedades, "text-sm")} />
              <PendingHint show={isEmptyReportValue(data.novedades)} />
            </div>
          </section>
        </div>

        <section className={cn("space-y-3 rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-background/45 p-3", showPendingState && hasPendingItems(data.sitios_visitados) && "report-list-pending")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {comboboxInput("estacion", "Estacion", stationOptions)}
            {textInput("destino", "Destino")}
          </div>

          <div className="space-y-3 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1">
              <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sitios de interes visitados</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addSitio}><Plus className="h-3 w-3 mr-1" />Agregar</Button>
            </div>
            <div className={cn("hidden gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:grid", siteRowGridClass)}>
              <span>Nombre</span>
              <span>Zona</span>
              <span>Posicion</span>
              <span />
            </div>
            {data.sitios_visitados.map((s, i) => {
              const sitioPending = hasEmptyReportValue([s.nombre_sitio, s.zona, s.posicion]);
              return (
                <div key={i} className="space-y-1">
                  <div className={cn("grid gap-1", siteRowGridClass)}>
                    <ReportComboboxInput
                      value={s.nombre_sitio}
                      onChange={(value) => updateSitioNombre(i, value)}
                      options={siteOptions.map((option) => option.nombre_sitio)}
                      placeholder="Nombre"
                      className={pendingInputClass(s.nombre_sitio, compactRowInputClass)}
                    />
                    <Input placeholder="Zona" value={s.zona} onChange={(event) => updateSitio(i, "zona", event.target.value)} className={pendingInputClass(s.zona, compactRowInputClass)} />
                    <Input placeholder="Posicion" value={s.posicion} onChange={(event) => updateSitio(i, "posicion", event.target.value)} className={pendingInputClass(s.posicion, compactRowInputClass)} />
                    <Button type="button" variant="ghost" size="sm" className={compactDeleteButtonClass} aria-label="Eliminar sitio visitado" onClick={() => removeSitio(i)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  <PendingHint show={sitioPending} />
                </div>
              );
            })}
            <PendingHint show={data.sitios_visitados.length === 0} />
          </div>
        </section>
      </div>

      <section className="space-y-3 rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-background/45 p-3">
        <div className="flex flex-col gap-3 border-b border-border/60 pb-2 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Combustible, factura y kilometraje
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
              Carga de combustible
            </label>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {numberInput("kilometros_recorridos", "Kilometros")}
          {fuelNumberInput("combustible_gastado", "Combustible Gastado (L)")}
        </div>

        {(!useFuelLoadToggle || fuelLoadEnabled) && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {field("estacion_combustible", "Estacion de Combustible", (
                <ReportComboboxInput
                  value={data.estacion_combustible || ""}
                  onChange={updateFuelProvider}
                  options={FUEL_PROVIDER_OPTIONS}
                  className={pendingInputClass(data.estacion_combustible)}
                />
              ))}
              {textInput("lugar_combustible", "Lugar")}
              {textInput("cedula_juridica_combustible", "Cedula Juridica")}
              {textInput("no_factura", "N. Factura")}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {numberInput("combustible_trasegado_bomba", "Trasegado Bomba (L)")}
              {fuelNumberInput("total_combustible_antes_viaje", "Total Antes Viaje (L)")}
              {fuelBalanceInput()}
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
          cancelLabel={cancelLabel}
          onDelete={onDelete}
          deleting={deleting}
          deleteLabel={deleteLabel}
        />
      )}
    </form>
  );
};

export default VehicleReportForm;
