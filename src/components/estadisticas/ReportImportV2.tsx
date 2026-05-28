import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FilePlus2, FileSpreadsheet, Link2, Loader2, ShieldCheck, Upload, UserPlus, UserRoundCheck, UserX, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import BoatReportForm, { type BoatFormData } from "@/components/estadisticas/BoatReportForm";
import ReportListRow, { type ReportRowStatus } from "@/components/estadisticas/ReportListRow";
import VehicleReportForm, { type VehicleFormData } from "@/components/estadisticas/VehicleReportForm";
import { findOfficerByName } from "@/lib/officers";
import { createBoatReport, createVehicleReport } from "@/lib/reportPersistence";
import { mapToBoatFormData, mapToVehicleFormData, type ExtractedReportData } from "@/lib/report-utils";
import { buildAliasSuggestionsFromFields, buildCatalogSuggestionsFromFields, buildPersonSuggestionsFromFields, confirmReportImportJob, persistReportImportCatalogDecision, uploadReportImportFile } from "@/lib/reportImportClient";
import { normalizeImportText } from "@/lib/reportImportMatching";
import type { ReportImportCatalogSuggestionAction, ReportImportDraft, ReportImportField, ReportImportPersonSuggestionAction } from "@/lib/reportImportSchema";
import { findSiteOption, type ReportSiteOption } from "@/lib/reportSites";

interface ReportImportV2Props {
  stationOptions?: string[];
  vehicleUnitOptions?: string[];
  boatUnitOptions?: string[];
  peopleOptions?: string[];
  motiveOptions?: string[];
  siteOptions?: ReportSiteOption[];
  onCatalogsChanged?: () => void | Promise<void>;
}

type ImportQueueStatus = "pending" | "importing" | "ready" | "failed" | "saved" | "skipped";
type UnknownPersonDecisionMode = "link_existing" | "new_officer";
type UnknownCatalogDecisionMode = "link_existing";

interface ImportQueueItem {
  id: string;
  file: File;
  fileName: string;
  status: ImportQueueStatus;
  error?: string;
  jobId?: string;
  draft?: ReportImportDraft;
  vehicleData?: VehicleFormData | null;
  boatData?: BoatFormData | null;
  savedReportId?: string;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const isExcelFile = (file: File) => /\.(xlsx|xls)$/i.test(file.name);

const buildQueueItemId = (file: File, index: number) =>
  `${Date.now()}-${index}-${file.name}-${file.size}-${file.lastModified}`;

const queueStatusLabel: Record<ImportQueueStatus, string> = {
  pending: "En cola",
  importing: "Importando",
  ready: "En revision",
  failed: "Error",
  saved: "Guardado",
  skipped: "Omitido",
};

const confidenceTone = (field: ReportImportField) => {
  if (field.status === "accepted") return "Verde";
  if (field.status === "needs_review") return "Amarillo";
  return "Rojo";
};

const confidenceBadgeVariant = (field: ReportImportField): "default" | "secondary" | "destructive" | "outline" => {
  if (field.status === "accepted") return "default";
  if (field.status === "needs_review") return "secondary";
  return "destructive";
};

const confidenceIcon = (field: ReportImportField) => {
  if (field.status === "accepted") return CheckCircle2;
  if (field.status === "needs_review") return AlertCircle;
  return XCircle;
};

const formatConfidence = (value: number) => `${Math.round(value * 100)}%`;

const fieldReason = (field: ReportImportField) => {
  if (field.kind === "text") return "Texto libre preservado";
  if (field.kind === "deterministic") return "Extraido por celda y validado por formato";
  if (field.kind === "catalog") {
    if (field.metadata.catalogAction === "accepted_suggestion") return "Sugerencia confirmada manualmente";
    if (field.metadata.catalogAction === "linked_existing") return "Vinculado manualmente al catalogo";
    if (field.metadata.catalogAction === "created_new") return "Nuevo valor para agregar al catalogo";
    if (field.metadata.catalogAction === "saved_for_report") return "Confirmado solo para este reporte";
    if (field.metadata.catalogAction === "omitted") return "Omitido manualmente";
    const match = field.metadata.match as { level?: string } | undefined;
    if (match?.level === "alias") return "Alias exacto del catalogo";
    if (match?.level === "normalized") return "Valor normalizado coincide";
    if (match?.level === "rule") return "Regla local coincide con catalogo";
    if (match?.level === "fuzzy") return "Coincidencia probable, requiere revision";
    if (match?.level === "gemini") return "Propuesta de IA, requiere revision";
    return "Valor no confirmado contra catalogo";
  }
  if (field.metadata.warningType === "duplicate_person") return "Nombre repetido; se usara una sola vez";
  if (field.metadata.personAction === "saved_without_cedula") return "Confirmado manualmente como persona sin cedula";
  if (field.metadata.personAction === "possible_new_officer") return "Marcado como posible agente nuevo";
  if (field.metadata.personAction === "created_new_officer") return "Agente nuevo con cedula para agregar al catalogo";
  if (field.metadata.personAction === "linked_existing") return "Vinculado manualmente a oficial del catalogo";
  if (field.metadata.personAction === "omitted") return "Omitido manualmente";
  if (field.metadata.resolutionType === "unknown_person" || field.metadata.resolutionType === "possible_new_officer") {
    return "Nombre no confirmado contra catalogo";
  }
  const match = field.metadata.match as { level?: string } | undefined;
  if (match?.level === "cedula") return "Cedula de firma coincide con catalogo";
  if (match?.level === "alias") return "Alias exacto del catalogo";
  if (match?.level === "normalized") return "Nombre normalizado coincide";
  if (match?.level === "fuzzy") return "Coincidencia probable, requiere revision";
  if (match?.level === "gemini") return "Propuesta de IA, requiere revision";
  return "Sin oficial confirmado";
};

const personActionLabels: Record<ReportImportPersonSuggestionAction, string> = {
  saved_without_cedula: "Guardar como persona sin cedula",
  possible_new_officer: "Posible agente nuevo",
  created_new_officer: "Agregar como agente nuevo",
  linked_existing: "Vincular a oficial existente",
  omitted: "Omitir",
};

const catalogActionLabels: Record<ReportImportCatalogSuggestionAction, string> = {
  accepted_suggestion: "Aceptar sugerencia",
  linked_existing: "Vincular a existente",
  created_new: "Agregar nuevo",
  saved_for_report: "Guardar solo en este reporte",
  omitted: "Omitir",
};

const catalogTypeLabels: Record<string, string> = {
  motive: "motivo",
  site: "sitio",
};

const isUnhandledUnknownPersonField = (field: ReportImportField) =>
  field.kind === "person" &&
  field.status === "rejected" &&
  !field.finalValue &&
  !field.metadata.personAction;

const isUnhandledCatalogField = (field: ReportImportField) =>
  field.kind === "catalog" &&
  field.status !== "accepted" &&
  !field.metadata.catalogAction;

const catalogItemIdFromField = (field: ReportImportField) => {
  if (typeof field.metadata.catalogItemId === "string") return field.metadata.catalogItemId;
  const match = field.metadata.match as { itemId?: unknown } | null | undefined;
  return typeof match?.itemId === "string" ? match.itemId : null;
};

const normalizedPersonKey = (name: string | null | undefined) => normalizeImportText(name || "");

const upsertPersonName = (names: string[], name: string) => {
  const key = normalizedPersonKey(name);
  if (!key) return names;
  const next = names.filter((item) => normalizedPersonKey(item) !== key);
  return [...next, name];
};

const removePersonName = (names: string[], name: string) => {
  const key = normalizedPersonKey(name);
  if (!key) return names;
  return names.filter((item) => normalizedPersonKey(item) !== key);
};

const upsertBoatCrewMember = (people: BoatFormData["tripulantes"], name: string, cedula = "") => {
  const key = normalizedPersonKey(name);
  if (!key) return people;
  const next = people.filter((person) => normalizedPersonKey(person.nombre) !== key);
  return [...next, { nombre: name, cedula }];
};

const removeBoatCrewMember = (people: BoatFormData["tripulantes"], name: string) => {
  const key = normalizedPersonKey(name);
  if (!key) return people;
  return people.filter((person) => normalizedPersonKey(person.nombre) !== key);
};

const fieldGroupKey = (field: ReportImportField) =>
  typeof field.metadata.groupKey === "string" ? field.metadata.groupKey : field.fieldKey.split(".")[0];

const fieldListIndex = (field: ReportImportField) => {
  const metadataIndex = field.metadata.listIndex;
  if (typeof metadataIndex === "number" && Number.isFinite(metadataIndex)) return metadataIndex;
  const parsed = Number(field.fieldKey.split(".").at(-1));
  return Number.isFinite(parsed) ? parsed : -1;
};

const buildInitialFormData = (draft: ReportImportDraft) =>
  draft.reportType === "vehiculo"
    ? { vehicleData: mapToVehicleFormData(draft.extractedData as ExtractedReportData), boatData: null }
    : { vehicleData: null, boatData: mapToBoatFormData(draft.extractedData as ExtractedReportData) };

const queueRowStatus = (status: ImportQueueStatus): ReportRowStatus => {
  if (status === "importing") return "processing";
  if (status === "failed") return "error";
  if (status === "saved") return "saved";
  if (status === "ready") return "ready";
  if (status === "skipped") return "idle";
  return "pending";
};

const getItemFormData = (item?: ImportQueueItem | null) => item?.vehicleData || item?.boatData || null;

const getItemReportNumber = (item: ImportQueueItem) => {
  const data = getItemFormData(item);
  return data?.no_reporte || (item.draft?.extractedData.no_reporte as string | undefined) || null;
};

const getItemDate = (item: ImportQueueItem) => {
  const data = getItemFormData(item);
  return data?.fecha || (item.draft?.extractedData.fecha as string | undefined) || null;
};

const getItemStation = (item: ImportQueueItem) => {
  const data = getItemFormData(item);
  return data?.estacion || (item.draft?.extractedData.estacion as string | undefined) || null;
};

const getItemUnit = (item: ImportQueueItem) => {
  const data = getItemFormData(item);
  return (
    (data && "vehiculo" in data ? data.vehiculo : undefined) ||
    (data && "embarcacion" in data ? data.embarcacion : undefined) ||
    (item.draft?.extractedData.vehiculo as string | undefined) ||
    (item.draft?.extractedData.embarcacion as string | undefined) ||
    null
  );
};

const getItemAttentionCount = (item?: ImportQueueItem | null) =>
  item?.draft?.fields.filter((field) => field.status !== "accepted").length || 0;

const getNextSelectableId = (items: ImportQueueItem[], currentId?: string | null) =>
  items.find((item) => item.id !== currentId && item.status !== "saved" && item.status !== "skipped")?.id || null;

const hasActiveSelection = (items: ImportQueueItem[], itemId?: string | null) =>
  Boolean(itemId && items.some((item) => item.id === itemId && item.status !== "saved" && item.status !== "skipped"));

const isDuplicateError = (message?: string) => /^duplicado:/i.test(message || "");

const cleanCedulaInput = (value: string) => value.replace(/\D/g, "").slice(0, 12);

const isNewOfficerCedulaValid = (value: string) => cleanCedulaInput(value).length >= 6;

const ReportImportV2 = ({
  stationOptions = [],
  vehicleUnitOptions = [],
  boatUnitOptions = [],
  peopleOptions = [],
  motiveOptions = [],
  siteOptions = [],
  onCatalogsChanged,
}: ReportImportV2Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const [queue, setQueue] = useState<ImportQueueItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [showValidatedFields, setShowValidatedFields] = useState(false);
  const [personLinkSelections, setPersonLinkSelections] = useState<Record<string, string>>({});
  const [newOfficerCedulas, setNewOfficerCedulas] = useState<Record<string, string>>({});
  const [unknownPersonDecisionModes, setUnknownPersonDecisionModes] = useState<Record<string, UnknownPersonDecisionMode>>({});
  const [catalogLinkSelections, setCatalogLinkSelections] = useState<Record<string, string>>({});
  const [unknownCatalogDecisionModes, setUnknownCatalogDecisionModes] = useState<Record<string, UnknownCatalogDecisionMode>>({});
  const selectedItem = selectedItemId ? queue.find((item) => item.id === selectedItemId) || null : null;
  const selectedDraft = selectedItem?.draft || null;
  const selectedVehicleData = selectedItem?.vehicleData || null;
  const selectedBoatData = selectedItem?.boatData || null;
  const officerLinkOptions = peopleOptions.filter((person) => findOfficerByName(person));

  const processNextFile = useCallback(async () => {
    if (processingRef.current || uploading || savingItemId) return;

    const nextItem = queue.find((item) => item.status === "pending");
    if (!nextItem) return;

    processingRef.current = true;
    setUploading(true);
    setProcessingItemId(nextItem.id);
    setSelectedItemId((current) => (hasActiveSelection(queue, current) ? current : nextItem.id));
    setQueue((current) =>
      current.map((item) =>
        item.id === nextItem.id ? { ...item, status: "importing", error: undefined } : item,
      ),
    );

    try {
      const nextDraft = await uploadReportImportFile(nextItem.file);
      const initialData = buildInitialFormData(nextDraft);
      setQueue((current) =>
        current.map((item) =>
          item.id === nextItem.id
            ? {
              ...item,
              status: "ready",
              jobId: nextDraft.jobId,
              draft: nextDraft,
              vehicleData: initialData.vehicleData,
              boatData: initialData.boatData,
              error: undefined,
            }
            : item,
        ),
      );
      setSelectedItemId((current) => (hasActiveSelection(queue, current) ? current : nextItem.id));
      setShowValidatedFields(false);
      toast.success("Reporte importado para revision", {
        description: nextItem.fileName,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo importar el reporte";
      setQueue((current) =>
        current.map((item) =>
          item.id === nextItem.id ? { ...item, status: "failed", error: message } : item,
        ),
      );
      setSelectedItemId((current) => (hasActiveSelection(queue, current) ? current : nextItem.id));
      toast.error("No se pudo importar", {
        description: `${nextItem.fileName}: ${message}`,
      });
    } finally {
      processingRef.current = false;
      setUploading(false);
      setProcessingItemId(null);
    }
  }, [queue, savingItemId, uploading]);

  useEffect(() => {
    void processNextFile();
  }, [processNextFile]);

  const enqueueFiles = (files: File[]) => {
    if (!files.length) return;

    let rejectedByType = 0;
    let rejectedBySize = 0;
    const nextItems = files.flatMap((file, index) => {
      if (!isExcelFile(file)) {
        rejectedByType += 1;
        return [];
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        rejectedBySize += 1;
        return [];
      }
      return [{
        id: buildQueueItemId(file, index),
        file,
        fileName: file.name,
        status: "pending" as const,
      }];
    });

    if (nextItems.length) {
      setQueue((current) => [...current, ...nextItems]);
      setSelectedItemId((current) => (hasActiveSelection(queue, current) ? current : nextItems[0]?.id || null));
      toast.success(
        nextItems.length === 1 ? "Archivo agregado a la cola" : `${nextItems.length} archivos agregados a la cola`,
      );
    }
    if (rejectedByType) toast.error(`${rejectedByType} archivo(s) no son Excel .xlsx/.xls`);
    if (rejectedBySize) toast.error(`${rejectedBySize} archivo(s) superan el limite de 5 MB`);
    if (inputRef.current) inputRef.current.value = "";
  };

  const selectItem = (itemId: string) => {
    setShowValidatedFields(false);
    setSelectedItemId(itemId);
  };

  const removeItem = (itemId: string) => {
    const item = queue.find((queueItem) => queueItem.id === itemId);
    if (item?.status === "importing") return;
    const nextQueue = queue.filter((queueItem) => queueItem.id !== itemId);
    setQueue(nextQueue);
    if (selectedItemId === itemId) {
      setShowValidatedFields(false);
      setSelectedItemId(getNextSelectableId(nextQueue, itemId));
    }
  };

  const skipSelected = () => {
    if (!selectedItem || selectedItem.status === "importing") return;
    const nextQueue = queue.map((item) =>
      item.id === selectedItem.id ? { ...item, status: "skipped" as const } : item,
    );
    setQueue(nextQueue);
    setShowValidatedFields(false);
    setSelectedItemId(getNextSelectableId(nextQueue, selectedItem.id));
  };

  const clearQueue = () => {
    if (uploading || savingItemId) return;
    setQueue([]);
    setSelectedItemId(null);
    setShowValidatedFields(false);
  };

  const setUnknownPersonDecisionMode = (key: string, mode: UnknownPersonDecisionMode) => {
    setUnknownPersonDecisionModes((current) => ({
      ...current,
      [key]: mode,
    }));
  };

  const setUnknownCatalogDecisionMode = (key: string, mode: UnknownCatalogDecisionMode) => {
    setUnknownCatalogDecisionModes((current) => ({
      ...current,
      [key]: mode,
    }));
  };

  const updateSelectedVehicleData = (nextData: VehicleFormData) => {
    if (!selectedItemId) return;
    setQueue((current) =>
      current.map((item) => (item.id === selectedItemId ? { ...item, vehicleData: nextData } : item)),
    );
  };

  const updateSelectedBoatData = (nextData: BoatFormData) => {
    if (!selectedItemId) return;
    setQueue((current) =>
      current.map((item) => (item.id === selectedItemId ? { ...item, boatData: nextData } : item)),
    );
  };

  const applyPersonDecisionToVehicleData = (
    data: VehicleFormData | null,
    field: ReportImportField,
    action: ReportImportPersonSuggestionAction,
    finalName: string,
    officerCedula: string,
  ) => {
    if (!data) return data;
    const rawName = field.rawValue || "";
    const shouldOmit = action === "omitted";
    if (field.fieldKey === "chofer") {
      return {
        ...data,
        chofer: shouldOmit ? "" : finalName,
        chofer_cedula: shouldOmit ? "" : officerCedula,
      };
    }
    if (field.fieldKey === "oficial_a_cargo") {
      return {
        ...data,
        oficial_a_cargo: shouldOmit ? "" : finalName,
        oficial_a_cargo_cedula: shouldOmit ? "" : officerCedula,
      };
    }
    if (fieldGroupKey(field) === "acompanantes") {
      return {
        ...data,
        acompanantes: shouldOmit
          ? removePersonName(data.acompanantes, rawName)
          : upsertPersonName(data.acompanantes, finalName),
      };
    }
    return data;
  };

  const applyPersonDecisionToBoatData = (
    data: BoatFormData | null,
    field: ReportImportField,
    action: ReportImportPersonSuggestionAction,
    finalName: string,
    officerCedula: string,
  ) => {
    if (!data) return data;
    const rawName = field.rawValue || "";
    const shouldOmit = action === "omitted";
    const roleUpdates: Partial<BoatFormData> = {};
    if (field.fieldKey === "capitan") {
      roleUpdates.capitan = shouldOmit ? "" : finalName;
      roleUpdates.capitan_cedula = shouldOmit ? "" : officerCedula;
    } else if (field.fieldKey === "encargado_mision") {
      roleUpdates.encargado_mision = shouldOmit ? "" : finalName;
      roleUpdates.encargado_mision_cedula = shouldOmit ? "" : officerCedula;
    } else if (field.fieldKey === "oficial_director") {
      roleUpdates.oficial_director = shouldOmit ? "" : finalName;
      roleUpdates.oficial_director_cedula = shouldOmit ? "" : officerCedula;
    } else if (field.fieldKey === "operacional") {
      roleUpdates.operacional = shouldOmit ? "" : finalName;
      roleUpdates.operacional_cedula = shouldOmit ? "" : officerCedula;
    }

    if (Object.keys(roleUpdates).length > 0) {
      return { ...data, ...roleUpdates };
    }

    if (fieldGroupKey(field) === "tripulantes") {
      return {
        ...data,
        tripulantes: shouldOmit
          ? removeBoatCrewMember(data.tripulantes, rawName)
          : upsertBoatCrewMember(data.tripulantes, finalName, officerCedula),
      };
    }

    return data;
  };

  const applyPersonDecisionToExtractedData = (
    draft: ReportImportDraft,
    field: ReportImportField,
    action: ReportImportPersonSuggestionAction,
    finalName: string,
    officerCedula: string,
  ) => {
    const rawName = field.rawValue || "";
    const shouldOmit = action === "omitted";
    const nextData = { ...draft.extractedData };

    if (draft.reportType === "vehiculo") {
      if (field.fieldKey === "chofer") {
        nextData.chofer = shouldOmit ? "" : finalName;
        nextData.chofer_cedula = shouldOmit ? "" : officerCedula;
      } else if (field.fieldKey === "oficial_a_cargo") {
        nextData.oficial_a_cargo = shouldOmit ? "" : finalName;
        nextData.oficial_a_cargo_cedula = shouldOmit ? "" : officerCedula;
      } else if (fieldGroupKey(field) === "acompanantes") {
        const current = Array.isArray(nextData.acompanantes) ? nextData.acompanantes.map(String) : [];
        nextData.acompanantes = shouldOmit ? removePersonName(current, rawName) : upsertPersonName(current, finalName);
      }
      return nextData;
    }

    const setBoatRole = (nameKey: string, cedulaKey: string) => {
      nextData[nameKey] = shouldOmit ? "" : finalName;
      nextData[cedulaKey] = shouldOmit ? "" : officerCedula;
    };

    if (field.fieldKey === "capitan") setBoatRole("capitan", "capitan_cedula");
    else if (field.fieldKey === "encargado_mision") setBoatRole("encargado_mision", "encargado_mision_cedula");
    else if (field.fieldKey === "oficial_director") setBoatRole("oficial_director", "oficial_director_cedula");
    else if (field.fieldKey === "operacional") setBoatRole("operacional", "operacional_cedula");
    else if (fieldGroupKey(field) === "tripulantes") {
      const current = Array.isArray(nextData.tripulantes)
        ? nextData.tripulantes.flatMap((person) => {
            if (typeof person === "string") return [{ nombre: person, cedula: "" }];
            if (person && typeof person === "object") {
              const record = person as Record<string, unknown>;
              return [{ nombre: String(record.nombre || ""), cedula: String(record.cedula || "") }];
            }
            return [];
          })
        : [];
      nextData.tripulantes = shouldOmit
        ? removeBoatCrewMember(current, rawName)
        : upsertBoatCrewMember(current, finalName, officerCedula);
    }

    return nextData;
  };

  const catalogOptionsForField = (field: ReportImportField) => {
    const catalogType = field.metadata.catalogType;
    if (catalogType === "motive") return motiveOptions;
    if (catalogType === "site") return siteOptions.map((option) => option.nombre_sitio);
    return [];
  };

  const replaceCatalogString = (
    values: string[],
    field: ReportImportField,
    finalValue: string,
    omit: boolean,
  ) => {
    const rawKey = normalizeImportText(field.rawValue || "");
    const finalKey = normalizeImportText(field.finalValue || "");
    const index = fieldListIndex(field);
    const nextValues = [...values];
    const matchesField = (value: string) => {
      const key = normalizeImportText(value);
      return key && (key === rawKey || key === finalKey);
    };

    if (omit) {
      if (nextValues.some(matchesField)) {
        return nextValues.filter((value) => !matchesField(value));
      }
      return index >= 0 && index < nextValues.length
        ? nextValues.filter((_, valueIndex) => valueIndex !== index)
        : nextValues;
    }

    if (!finalValue) return nextValues;
    const replacementIndex = nextValues.findIndex(matchesField);
    if (replacementIndex >= 0) nextValues[replacementIndex] = finalValue;
    else if (index >= 0 && index < nextValues.length) nextValues[index] = finalValue;
    else nextValues.push(finalValue);

    return nextValues.reduce<string[]>((items, value) => {
      const cleanValue = value.trim();
      const key = normalizeImportText(cleanValue);
      if (!cleanValue || items.some((item) => normalizeImportText(item) === key)) return items;
      return [...items, cleanValue];
    }, []);
  };

  const siteValueFromCatalogDecision = (
    field: ReportImportField,
    finalValue: string,
    currentSite?: { zona?: string; posicion?: string } | null,
  ) => {
    const siteOption = findSiteOption(siteOptions, finalValue);
    const match = field.metadata.match as { zona?: unknown; posicion?: unknown } | null | undefined;
    const metadataZona = typeof field.metadata.siteZona === "string" ? field.metadata.siteZona : "";
    const metadataPosicion = typeof field.metadata.sitePosicion === "string" ? field.metadata.sitePosicion : "";
    const matchZona = typeof match?.zona === "string" ? match.zona : "";
    const matchPosicion = typeof match?.posicion === "string" ? match.posicion : "";

    return {
      nombre_sitio: finalValue,
      zona: siteOption?.zona || currentSite?.zona || metadataZona || matchZona || "",
      posicion: siteOption?.posicion || currentSite?.posicion || metadataPosicion || matchPosicion || "",
    };
  };

  const replaceCatalogSite = <T extends { nombre_sitio: string; zona: string; posicion: string }>(
    values: T[],
    field: ReportImportField,
    finalValue: string,
    omit: boolean,
  ) => {
    const rawKey = normalizeImportText(field.rawValue || "");
    const finalKey = normalizeImportText(field.finalValue || "");
    const index = fieldListIndex(field);
    const matchesField = (site: T) => {
      const key = normalizeImportText(site.nombre_sitio);
      return key && (key === rawKey || key === finalKey);
    };

    if (omit) {
      if (values.some(matchesField)) {
        return values.filter((site) => !matchesField(site));
      }
      return index >= 0 && index < values.length
        ? values.filter((_, siteIndex) => siteIndex !== index)
        : values;
    }

    if (!finalValue) return values;
    const nextValues = [...values];
    const replacementIndex = nextValues.findIndex(matchesField);
    const existingSite = replacementIndex >= 0
      ? nextValues[replacementIndex]
      : index >= 0 && index < nextValues.length
        ? nextValues[index]
        : undefined;
    const nextSite = siteValueFromCatalogDecision(field, finalValue, existingSite);

    if (replacementIndex >= 0) nextValues[replacementIndex] = { ...nextValues[replacementIndex], ...nextSite };
    else if (index >= 0 && index < nextValues.length) nextValues[index] = { ...nextValues[index], ...nextSite };
    else nextValues.push(nextSite as T);

    return nextValues;
  };

  const applyCatalogDecisionToVehicleData = (
    data: VehicleFormData | null,
    field: ReportImportField,
    action: ReportImportCatalogSuggestionAction,
    finalValue: string,
  ) => {
    if (!data) return data;
    const shouldOmit = action === "omitted";
    if (field.metadata.catalogType === "motive") {
      return { ...data, motivos: replaceCatalogString(data.motivos, field, finalValue, shouldOmit) };
    }
    if (field.metadata.catalogType === "site") {
      return { ...data, sitios_visitados: replaceCatalogSite(data.sitios_visitados, field, finalValue, shouldOmit) };
    }
    return data;
  };

  const applyCatalogDecisionToBoatData = (
    data: BoatFormData | null,
    field: ReportImportField,
    action: ReportImportCatalogSuggestionAction,
    finalValue: string,
  ) => {
    if (!data) return data;
    const shouldOmit = action === "omitted";
    if (field.metadata.catalogType === "motive") {
      return { ...data, motivos: replaceCatalogString(data.motivos, field, finalValue, shouldOmit) };
    }
    if (field.metadata.catalogType === "site") {
      return { ...data, sitios_visitados: replaceCatalogSite(data.sitios_visitados, field, finalValue, shouldOmit) };
    }
    return data;
  };

  const applyCatalogDecisionToExtractedData = (
    draft: ReportImportDraft,
    field: ReportImportField,
    action: ReportImportCatalogSuggestionAction,
    finalValue: string,
  ) => {
    const nextData = { ...draft.extractedData };
    const shouldOmit = action === "omitted";
    if (field.metadata.catalogType === "motive") {
      const current = Array.isArray(nextData.motivos) ? nextData.motivos.map(String) : [];
      nextData.motivos = replaceCatalogString(current, field, finalValue, shouldOmit);
    } else if (field.metadata.catalogType === "site") {
      const current = Array.isArray(nextData.sitios_visitados)
        ? nextData.sitios_visitados.flatMap((site) => {
            if (!site || typeof site !== "object") return [];
            const record = site as Record<string, unknown>;
            return [{
              nombre_sitio: String(record.nombre_sitio || ""),
              zona: String(record.zona || ""),
              posicion: String(record.posicion || ""),
            }];
          })
        : [];
      nextData.sitios_visitados = replaceCatalogSite(current, field, finalValue, shouldOmit);
    }
    return nextData;
  };

  const applyPersonDecision = (
    field: ReportImportField,
    action: ReportImportPersonSuggestionAction,
    linkedOfficerName?: string,
    newOfficerCedula?: string,
  ) => {
    if (!selectedItemId) return;
    const rawName = field.rawValue || "";
    const officer = linkedOfficerName ? findOfficerByName(linkedOfficerName) : undefined;
    const cleanedNewOfficerCedula = cleanCedulaInput(newOfficerCedula || "");
    if (action === "created_new_officer" && !isNewOfficerCedulaValid(cleanedNewOfficerCedula)) {
      toast.error("Ingrese una cedula valida para agregar el agente nuevo");
      return;
    }
    const finalName = action === "omitted"
      ? ""
      : action === "linked_existing"
        ? (officer?.nombre || linkedOfficerName || rawName)
        : rawName;
    const officerCedula = action === "linked_existing"
      ? officer?.identificacion || ""
      : action === "created_new_officer"
        ? cleanedNewOfficerCedula
        : "";

    setQueue((current) =>
      current.map((item) => {
        if (item.id !== selectedItemId || !item.draft) return item;
        const nextFields = item.draft.fields.map((currentField) => {
          if (currentField.fieldKey !== field.fieldKey) return currentField;
          return {
            ...currentField,
            source: "manual" as const,
            finalValue: finalName || null,
            normalizedValue: normalizeImportText(finalName || rawName),
            confidence: 1,
            status: "accepted" as const,
            metadata: {
              ...currentField.metadata,
              personAction: action,
              resolutionType: action === "linked_existing" || action === "created_new_officer"
                ? "catalog_officer"
                : currentField.metadata.resolutionType || "unknown_person",
              officerCedula: officerCedula || null,
              manualFinalName: finalName || null,
              manualActionLabel: personActionLabels[action],
              match: action === "linked_existing" || action === "created_new_officer"
                ? {
                    officerId: null,
                    nombre: finalName,
                    cedula: officerCedula || null,
                    confidence: 1,
                    level: action === "linked_existing" ? "gemini" : "none",
                    needsReview: false,
                  }
                : currentField.metadata.match,
            },
          };
        });
        const nextDraft = {
          ...item.draft,
          fields: nextFields,
          extractedData: applyPersonDecisionToExtractedData(item.draft, field, action, finalName, officerCedula),
          status: nextFields.some((nextField) => nextField.status !== "accepted") ? "review_required" as const : "ready" as const,
        };

        return {
          ...item,
          draft: nextDraft,
          vehicleData: item.draft.reportType === "vehiculo"
            ? applyPersonDecisionToVehicleData(item.vehicleData, field, action, finalName, officerCedula)
            : item.vehicleData,
          boatData: item.draft.reportType === "embarcacion"
            ? applyPersonDecisionToBoatData(item.boatData, field, action, finalName, officerCedula)
            : item.boatData,
        };
      }),
    );
    setShowValidatedFields(false);
    setUnknownPersonDecisionModes((current) => {
      const next = { ...current };
      delete next[`${selectedItemId}:${field.fieldKey}`];
      return next;
    });
  };

  const applyCatalogDecision = async (
    field: ReportImportField,
    action: ReportImportCatalogSuggestionAction,
    linkedValue?: string,
  ) => {
    if (!selectedItemId) return;
    const itemId = selectedItemId;
    const rawValue = field.rawValue || "";
    const catalogType = field.metadata.catalogType === "motive" || field.metadata.catalogType === "site"
      ? field.metadata.catalogType
      : null;
    const finalValue = action === "omitted"
      ? ""
      : action === "linked_existing"
        ? (linkedValue || "")
        : action === "accepted_suggestion"
          ? (field.finalValue || rawValue)
          : rawValue;

    if (action === "linked_existing" && !finalValue) {
      toast.error("Seleccione un valor del catalogo para vincular");
      return;
    }
    if (action === "created_new" && !normalizeImportText(finalValue)) {
      toast.error("El valor nuevo debe tener nombre");
      return;
    }
    if (!catalogType) {
      toast.error("No se pudo identificar el tipo de catalogo");
      return;
    }

    const shouldPersistCatalogDecision =
      action === "accepted_suggestion" ||
      action === "linked_existing" ||
      action === "created_new";
    const siteDecision = catalogType === "site" && finalValue
      ? siteValueFromCatalogDecision(field, finalValue)
      : null;
    let persistedCatalogItemId = catalogItemIdFromField(field);
    let persistedCatalogLabel = finalValue || null;

    if (shouldPersistCatalogDecision) {
      setSavingItemId(itemId);
      try {
        const persisted = await persistReportImportCatalogDecision({
          catalogType,
          rawValue,
          finalValue: finalValue || null,
          action,
          catalogItemId: persistedCatalogItemId,
          zona: siteDecision?.zona || null,
          posicion: siteDecision?.posicion || null,
        });
        persistedCatalogItemId = persisted.catalogItemId || persistedCatalogItemId;
        persistedCatalogLabel = persisted.catalogLabel || persistedCatalogLabel;
        toast.success("Catalogo actualizado");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo actualizar el catalogo");
        setSavingItemId(null);
        return;
      }
      await onCatalogsChanged?.().catch((error) => {
        toast.error("Catalogo actualizado, pero no se pudieron refrescar las listas", {
          description: error instanceof Error ? error.message : undefined,
        });
      });
    }
    const decisionFinalValue = persistedCatalogLabel || finalValue;

    setQueue((current) =>
      current.map((item) => {
        if (item.id !== itemId || !item.draft) return item;
        const nextFields = item.draft.fields.map((currentField) => {
          if (currentField.fieldKey !== field.fieldKey) return currentField;
          const siteOption = currentField.metadata.catalogType === "site" ? findSiteOption(siteOptions, decisionFinalValue) : null;
          const catalogItemId = siteOption?.id || persistedCatalogItemId || catalogItemIdFromField(currentField);
          return {
            ...currentField,
            source: "manual" as const,
            finalValue: decisionFinalValue || null,
            normalizedValue: normalizeImportText(decisionFinalValue || rawValue),
            confidence: 1,
            status: "accepted" as const,
            metadata: {
              ...currentField.metadata,
              catalogAction: action,
              manualFinalValue: decisionFinalValue || null,
              manualActionLabel: catalogActionLabels[action],
              catalogLabel: decisionFinalValue || null,
              catalogItemId,
              match: action === "linked_existing" || action === "created_new" || action === "accepted_suggestion"
                ? {
                    itemId: catalogItemId,
                    label: decisionFinalValue,
                    confidence: 1,
                    level: action === "accepted_suggestion" ? "fuzzy" : "manual",
                    needsReview: false,
                    zona: siteOption?.zona || currentField.metadata.siteZona || null,
                    posicion: siteOption?.posicion || currentField.metadata.sitePosicion || null,
                  }
                : currentField.metadata.match,
            },
          };
        });
        const nextDraft = {
          ...item.draft,
          fields: nextFields,
          extractedData: applyCatalogDecisionToExtractedData(item.draft, field, action, decisionFinalValue),
          status: nextFields.some((nextField) => nextField.status !== "accepted") ? "review_required" as const : "ready" as const,
        };

        return {
          ...item,
          draft: nextDraft,
          vehicleData: item.draft.reportType === "vehiculo"
            ? applyCatalogDecisionToVehicleData(item.vehicleData, field, action, decisionFinalValue)
            : item.vehicleData,
          boatData: item.draft.reportType === "embarcacion"
            ? applyCatalogDecisionToBoatData(item.boatData, field, action, decisionFinalValue)
            : item.boatData,
        };
      }),
    );
    setShowValidatedFields(false);
    setUnknownCatalogDecisionModes((current) => {
      const next = { ...current };
      delete next[`${itemId}:${field.fieldKey}`];
      return next;
    });
    if (shouldPersistCatalogDecision) setSavingItemId(null);
  };

  const saveSelectedDraft = async () => {
    if (!selectedItem?.draft) return;
    const currentItem = selectedItem;
    const currentDraft = currentItem.draft;
    const unresolvedUnknowns = currentDraft.fields.filter(isUnhandledUnknownPersonField);
    const unresolvedCatalogs = currentDraft.fields.filter(isUnhandledCatalogField);
    if (unresolvedUnknowns.length > 0) {
      toast.error("Revise los nombres desconocidos antes de guardar", {
        description: `${unresolvedUnknowns.length} nombre(s) requieren una decision.`,
      });
      return;
    }
    if (unresolvedCatalogs.length > 0) {
      toast.error("Revise motivos y sitios dudosos antes de guardar", {
        description: `${unresolvedCatalogs.length} campo(s) requieren una decision.`,
      });
      return;
    }
    setSavingItemId(currentItem.id);
    try {
      const result = currentDraft.reportType === "vehiculo"
        ? await createVehicleReport(currentItem.vehicleData as VehicleFormData)
        : await createBoatReport(currentItem.boatData as BoatFormData);
      if (result.error || !result.reportId) {
        const message = result.error || "No se pudo guardar el reporte";
        setQueue((current) =>
          current.map((item) => (item.id === currentItem.id ? { ...item, error: message } : item)),
        );
        toast.error(message);
        return;
      }

      const aliasSuggestions = buildAliasSuggestionsFromFields(currentDraft.fields);
      const personSuggestions = buildPersonSuggestionsFromFields(currentDraft.fields);
      const catalogSuggestions = buildCatalogSuggestionsFromFields(currentDraft.fields);
      await confirmReportImportJob(currentDraft.jobId, currentDraft.reportType, result.reportId, aliasSuggestions, personSuggestions, catalogSuggestions);
      toast.success("Reporte guardado con auditoria de importacion");
      const nextQueue = queue.map((item) =>
        item.id === currentItem.id
          ? { ...item, status: "saved" as const, savedReportId: result.reportId, error: undefined }
          : item,
      );
      setQueue(nextQueue);
      setShowValidatedFields(false);
      setSelectedItemId(getNextSelectableId(nextQueue, currentItem.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar";
      setQueue((current) =>
        current.map((item) => (item.id === currentItem.id ? { ...item, error: message } : item)),
      );
      toast.error("No se pudo guardar", {
        description: message,
      });
    } finally {
      setSavingItemId(null);
    }
  };

  const acceptedCount = selectedDraft?.fields.filter((field) => field.status === "accepted").length || 0;
  const reviewCount = selectedDraft?.fields.filter((field) => field.status === "needs_review").length || 0;
  const rejectedCount = selectedDraft?.fields.filter((field) => field.status === "rejected").length || 0;
  const attentionCount = reviewCount + rejectedCount;
  const attentionFields = selectedDraft?.fields.filter((field) => field.status !== "accepted") || [];
  const evidenceFields = selectedDraft ? (showValidatedFields ? selectedDraft.fields : attentionFields) : [];
  const pendingCount = queue.filter((item) => item.status === "pending").length;
  const failedCount = queue.filter((item) => item.status === "failed").length;
  const savedCount = queue.filter((item) => item.status === "saved").length;
  const readyCount = queue.filter((item) => item.status === "ready").length;

  const renderSelectedItemDetails = () => {
    if (!selectedItem) return null;

    if (selectedItem.status === "pending" || selectedItem.status === "importing") {
      return (
        <div className="flex items-start gap-3 rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-background/70 p-4">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {selectedItem.status === "importing" || processingItemId === selectedItem.id ? "Procesando reporte" : "Reporte en cola"}
            </h4>
            <p className="section-copy">{selectedItem.fileName}</p>
          </div>
        </div>
      );
    }

    if (selectedItem.status === "failed") {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No se pudo importar este reporte</AlertTitle>
          <AlertDescription>{selectedItem.error || "Revise el archivo e intente de nuevo."}</AlertDescription>
        </Alert>
      );
    }

    if (selectedItem.status === "saved") {
      return (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Reporte guardado</AlertTitle>
          <AlertDescription>La auditoria de importacion quedo enlazada al reporte final.</AlertDescription>
        </Alert>
      );
    }

    if (selectedItem.status === "skipped") {
      return (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Reporte omitido</AlertTitle>
          <AlertDescription>Puede quitarlo de la bandeja o volver a subir el archivo.</AlertDescription>
        </Alert>
      );
    }

    if (!selectedDraft) return null;

    return (
      <div className="grid gap-3">
        {selectedItem.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{isDuplicateError(selectedItem.error) ? "Reporte duplicado" : "No se pudo guardar"}</AlertTitle>
            <AlertDescription>{selectedItem.error}</AlertDescription>
          </Alert>
        )}

        {selectedDraft.geminiError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Gemini no completo la revision</AlertTitle>
            <AlertDescription>
              La extraccion local se conserva. Los campos dudosos quedan para revision manual.
            </AlertDescription>
          </Alert>
        )}

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              {showValidatedFields ? "Evidencia por campo" : "Campos que requieren revision"}
            </h4>
            {acceptedCount > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowValidatedFields((current) => !current)}
                  disabled={Boolean(savingItemId)}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  {showValidatedFields ? "Ocultar validados" : "Ver validados"}
                </Button>
              </div>
            )}
          </div>
          <div className="grid gap-2 p-5 sm:p-6 lg:p-4">
            {evidenceFields.length === 0 && (
              <div className="flex items-start gap-3 rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-muted/35 p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Sin campos por revisar</div>
                  <div className="text-xs text-muted-foreground">
                    Puede revisar el formulario final y guardar el reporte con auditoria.
                  </div>
                </div>
              </div>
            )}

            {evidenceFields.map((field) => {
              const Icon = confidenceIcon(field);
              const showUnknownActions = isUnhandledUnknownPersonField(field);
              const showCatalogActions = isUnhandledCatalogField(field);
              const linkSelectionKey = `${selectedItem.id}:${field.fieldKey}`;
              const decisionMode = unknownPersonDecisionModes[linkSelectionKey] || null;
              const catalogDecisionMode = unknownCatalogDecisionModes[linkSelectionKey] || null;
              const selectedOfficerName = personLinkSelections[linkSelectionKey] || "";
              const selectedCatalogValue = catalogLinkSelections[linkSelectionKey] || "";
              const newOfficerCedula = newOfficerCedulas[linkSelectionKey] || "";
              const canCreateNewOfficer = isNewOfficerCedulaValid(newOfficerCedula);
              const catalogOptions = catalogOptionsForField(field);
              const catalogType = typeof field.metadata.catalogType === "string" ? field.metadata.catalogType : "catalog";
              const catalogLabel = catalogTypeLabels[catalogType] || "valor";
              return (
                <div key={`${field.fieldKey}-${field.cellAddress}`} className="report-list-row-shell">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{field.label}</span>
                        <Badge variant={confidenceBadgeVariant(field)}>
                          {confidenceTone(field)} {formatConfidence(field.confidence)}
                        </Badge>
                        {field.cellAddress && <Badge variant="outline">{field.cellAddress}</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{fieldReason(field)}</div>
                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                        <div className="min-w-0 rounded-[calc(var(--radius)-0.16rem)] bg-muted/45 p-2">
                          <span className="font-semibold text-muted-foreground">Raw: </span>
                          <span className="break-words text-foreground">{field.rawValue || "Sin dato"}</span>
                        </div>
                        <div className="min-w-0 rounded-[calc(var(--radius)-0.16rem)] bg-muted/45 p-2">
                          <span className="font-semibold text-muted-foreground">Final: </span>
                          <span className="break-words text-foreground">{field.finalValue || "Pendiente"}</span>
                        </div>
                      </div>
                      {showUnknownActions && (
                        <div className="mt-3 rounded-[calc(var(--radius)-0.16rem)] border border-border/70 bg-background/75 p-3">
                          <div className="mb-3">
                            <div className="text-sm font-semibold text-foreground">
                              {field.rawValue || "Este nombre"} no esta en el catalogo. Que desea hacer?
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Elija una accion para resolverlo antes de guardar el reporte.
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant={decisionMode === "link_existing" ? "secondary" : "outline"}
                              size="sm"
                              disabled={Boolean(savingItemId)}
                              onClick={() => setUnknownPersonDecisionMode(linkSelectionKey, "link_existing")}
                            >
                              <Link2 className="mr-1 h-4 w-4" />
                              Vincular a oficial existente
                            </Button>
                            <Button
                              type="button"
                              variant={decisionMode === "new_officer" ? "secondary" : "outline"}
                              size="sm"
                              disabled={Boolean(savingItemId)}
                              onClick={() => setUnknownPersonDecisionMode(linkSelectionKey, "new_officer")}
                            >
                              <UserPlus className="mr-1 h-4 w-4" />
                              Agregar como agente nuevo
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={Boolean(savingItemId)}
                              onClick={() => applyPersonDecision(field, "saved_without_cedula")}
                            >
                              <UserRoundCheck className="mr-1 h-4 w-4" />
                              Guardar como persona sin cedula
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={Boolean(savingItemId)}
                              onClick={() => applyPersonDecision(field, "omitted")}
                            >
                              <UserX className="mr-1 h-4 w-4" />
                              Omitir
                            </Button>
                          </div>
                          {decisionMode === "link_existing" && (
                            <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto]">
                              <select
                                className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={selectedOfficerName}
                                onChange={(event) =>
                                  setPersonLinkSelections((current) => ({
                                    ...current,
                                    [linkSelectionKey]: event.target.value,
                                  }))
                                }
                                aria-label={`Vincular ${field.rawValue || field.label} a oficial existente`}
                              >
                                <option value="">Seleccionar oficial existente...</option>
                                {officerLinkOptions.map((person) => (
                                  <option key={person} value={person}>
                                    {person}
                                  </option>
                                ))}
                              </select>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!selectedOfficerName || Boolean(savingItemId)}
                                onClick={() => applyPersonDecision(field, "linked_existing", selectedOfficerName)}
                              >
                                <Link2 className="mr-1 h-4 w-4" />
                                Confirmar vinculacion
                              </Button>
                            </div>
                          )}
                          {decisionMode === "new_officer" && (
                            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto]">
                              <input
                                className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={newOfficerCedula}
                                onChange={(event) =>
                                  setNewOfficerCedulas((current) => ({
                                    ...current,
                                    [linkSelectionKey]: cleanCedulaInput(event.target.value),
                                  }))
                                }
                                placeholder="Cedula del agente nuevo"
                                aria-label={`Cedula para agregar ${field.rawValue || field.label} como agente nuevo`}
                                disabled={Boolean(savingItemId)}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!canCreateNewOfficer || Boolean(savingItemId)}
                                onClick={() => applyPersonDecision(field, "created_new_officer", undefined, newOfficerCedula)}
                              >
                                <UserPlus className="mr-1 h-4 w-4" />
                                Agregar agente nuevo
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      {showCatalogActions && (
                        <div className="mt-3 rounded-[calc(var(--radius)-0.16rem)] border border-border/70 bg-background/75 p-3">
                          <div className="mb-3">
                            <div className="text-sm font-semibold text-foreground">
                              {field.finalValue
                                ? `${field.rawValue || `Este ${catalogLabel}`} parece coincidir con ${field.finalValue}. Que desea hacer?`
                                : `${field.rawValue || `Este ${catalogLabel}`} no esta en el catalogo. Que desea hacer?`}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              La decision se guarda en auditoria y puede mejorar futuras comparaciones.
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {field.finalValue && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={Boolean(savingItemId)}
                                onClick={() => applyCatalogDecision(field, "accepted_suggestion")}
                              >
                                <CheckCircle2 className="mr-1 h-4 w-4" />
                                Aceptar sugerencia
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant={catalogDecisionMode === "link_existing" ? "secondary" : "outline"}
                              size="sm"
                              disabled={Boolean(savingItemId)}
                              onClick={() => setUnknownCatalogDecisionMode(linkSelectionKey, "link_existing")}
                            >
                              <Link2 className="mr-1 h-4 w-4" />
                              Vincular a existente
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={Boolean(savingItemId)}
                              onClick={() => applyCatalogDecision(field, "created_new")}
                            >
                              <FilePlus2 className="mr-1 h-4 w-4" />
                              Agregar nuevo
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={Boolean(savingItemId)}
                              onClick={() => applyCatalogDecision(field, "saved_for_report")}
                            >
                              <UserRoundCheck className="mr-1 h-4 w-4" />
                              Guardar solo en este reporte
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={Boolean(savingItemId)}
                              onClick={() => applyCatalogDecision(field, "omitted")}
                            >
                              <UserX className="mr-1 h-4 w-4" />
                              Omitir
                            </Button>
                          </div>
                          {catalogDecisionMode === "link_existing" && (
                            <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto]">
                              <select
                                className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={selectedCatalogValue}
                                onChange={(event) =>
                                  setCatalogLinkSelections((current) => ({
                                    ...current,
                                    [linkSelectionKey]: event.target.value,
                                  }))
                                }
                                aria-label={`Vincular ${field.rawValue || field.label} a ${catalogLabel} existente`}
                              >
                                <option value="">Seleccionar {catalogLabel} existente...</option>
                                {catalogOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!selectedCatalogValue || Boolean(savingItemId)}
                                onClick={() => applyCatalogDecision(field, "linked_existing", selectedCatalogValue)}
                              >
                                <Link2 className="mr-1 h-4 w-4" />
                                Confirmar vinculacion
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {selectedDraft.reportType === "vehiculo" && selectedVehicleData && (
          <VehicleReportForm
            data={selectedVehicleData}
            onChange={updateSelectedVehicleData}
            onSave={saveSelectedDraft}
            onCancel={skipSelected}
            saving={savingItemId === selectedItem.id}
            saveLabel="Guardar con auditoria"
            cancelLabel="Omitir reporte"
            stationOptions={stationOptions}
            unitOptions={vehicleUnitOptions}
            peopleOptions={peopleOptions}
            motiveOptions={motiveOptions}
            siteOptions={siteOptions}
          />
        )}

        {selectedDraft.reportType === "embarcacion" && selectedBoatData && (
          <BoatReportForm
            data={selectedBoatData}
            onChange={updateSelectedBoatData}
            onSave={saveSelectedDraft}
            onCancel={skipSelected}
            saving={savingItemId === selectedItem.id}
            saveLabel="Guardar con auditoria"
            cancelLabel="Omitir reporte"
            stationOptions={stationOptions}
            unitOptions={boatUnitOptions}
            peopleOptions={peopleOptions}
            motiveOptions={motiveOptions}
            siteOptions={siteOptions}
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="w-full overflow-hidden">
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="flex items-start gap-3">
            <div className="flex shrink-0 items-center justify-center text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <div className="section-eyebrow">Importacion V2</div>
              <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">Carga con confianza y auditoria</h3>
              <p className="section-copy">
                Suba uno o varios Excel para conservar evidencia por celda, revisar nombres con semaforo y guardar cada reporte final.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5 sm:p-6 lg:p-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(event) => {
              enqueueFiles(Array.from(event.target.files || []));
            }}
          />
          <div className="panel-subtle flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {queue.length > 0 ? `${queue.length} reporte(s) en la bandeja` : "Seleccione uno o varios reportes Excel"}
                </div>
                <div className="text-xs text-muted-foreground" aria-live="polite">
                  {queue.length > 0
                    ? `${readyCount} listo(s), ${pendingCount} en cola, ${savedCount} guardado(s), ${failedCount} con error.`
                    : "Limite servidor: 5 MB por archivo. Se procesa un reporte a la vez; Gemini solo se usa en campos dudosos."}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {queue.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={clearQueue} disabled={uploading || Boolean(savingItemId)}>
                  Vaciar cola
                </Button>
              )}
              <Button type="button" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading || Boolean(savingItemId)}>
                {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                {uploading ? "Importando..." : "Seleccionar Excel(s)"}
              </Button>
            </div>
          </div>

          {queue.length > 0 && (
            <div className="rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-background/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-foreground">Bandeja de importacion</div>
                  <div className="text-xs text-muted-foreground">
                    Seleccione un reporte para revisar sus campos y guardarlo.
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {queue.map((item) => {
                  const itemAttentionCount = getItemAttentionCount(item);
                  const isSelected = selectedItemId === item.id;
                  const isSavingItem = savingItemId === item.id;
                  const rowStatus = isSavingItem
                    ? "processing"
                    : item.error && item.status === "ready"
                      ? "save-error"
                      : queueRowStatus(item.status);
                  const statusText = isSavingItem
                    ? "Guardando"
                    : item.status === "ready"
                      ? item.error
                        ? isDuplicateError(item.error) ? "Duplicado" : "Error al guardar"
                        : itemAttentionCount > 0
                          ? `${itemAttentionCount} por revisar`
                          : "Listo para guardar"
                      : item.status === "saved"
                        ? "Guardado con auditoria"
                        : queueStatusLabel[item.status];
                  const selectedRowClass = isSelected
                    ? rowStatus === "error" || rowStatus === "save-error"
                      ? "border-destructive/70 bg-destructive/5"
                      : "border-primary/45 bg-primary/5"
                    : undefined;

                  return (
                    <ReportListRow
                      key={item.id}
                      origin="subida"
                      type={item.draft?.reportType}
                      status={rowStatus}
                      reportNumber={getItemReportNumber(item)}
                      date={getItemDate(item)}
                      station={getItemStation(item)}
                      unit={getItemUnit(item)}
                      title={item.fileName}
                      expanded={isSelected}
                      expandable
                      statusText={statusText}
                      errorText={item.error}
                      metrics={item.draft ? [{
                        label: "Revision",
                        value: itemAttentionCount > 0 ? `${itemAttentionCount} pendiente(s)` : "Sin pendientes",
                        icon: itemAttentionCount > 0 ? AlertCircle : CheckCircle2,
                      }] : []}
                      onExpandedChange={(open) => {
                        if (open) {
                          selectItem(item.id);
                        } else {
                          setSelectedItemId(null);
                        }
                      }}
                      hideEditAction
                      onRemove={item.status === "importing" ? undefined : () => removeItem(item.id)}
                      removeLabel={`Quitar ${item.fileName}`}
                      className={selectedRowClass}
                    >
                      {isSelected ? renderSelectedItemDetails() : null}
                    </ReportListRow>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default ReportImportV2;
