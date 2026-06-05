import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleOff,
  Edit3,
  History,
  Link2,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Tags,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  approveOfficerAliasSuggestion,
  loadReportCatalogAdminData,
  rejectOfficerAliasSuggestion,
  saveCatalogAlias,
  saveCatalogMotive,
  saveCatalogOfficer,
  saveCatalogSite,
  setCatalogAliasStatus,
  setCatalogMotiveActive,
  setCatalogOfficerActive,
  setCatalogSiteActive,
  updateCatalogSuggestionStatus,
  updatePersonSuggestionStatus,
  type CatalogAliasSuggestion,
  type CatalogAliasType,
  type CatalogMotive,
  type CatalogOfficer,
  type CatalogPersonSuggestion,
  type CatalogSite,
  type CatalogStatusFilter,
  type ReportCatalogAdminData,
} from "@/lib/reportCatalogAdmin";

type CatalogAdminTab = "officers" | "motives" | "sites" | "suggestions";
type EditorState =
  | { kind: "officer"; item?: CatalogOfficer }
  | { kind: "motive"; item?: CatalogMotive }
  | { kind: "site"; item?: CatalogSite }
  | {
      kind: "alias";
      aliasType: CatalogAliasType;
      targetId?: string;
      item?: {
        id: string;
        alias: string;
        status: string;
        targetId: string;
      };
    };

interface EditorForm {
  nombre: string;
  cedula: string;
  motivo: string;
  nombreSitio: string;
  zona: string;
  posicion: string;
  alias: string;
  targetId: string;
  status: "active" | "inactive";
}

interface ReportCatalogAdminProps {
  onCatalogsChanged?: () => void;
}

const emptyForm: EditorForm = {
  nombre: "",
  cedula: "",
  motivo: "",
  nombreSitio: "",
  zona: "",
  posicion: "",
  alias: "",
  targetId: "",
  status: "active",
};

const statusLabels: Record<CatalogStatusFilter, string> = {
  active: "Activos",
  inactive: "Inactivos",
  all: "Todos",
};

const actionLabels: Record<string, string> = {
  accepted_suggestion: "Acepto sugerencia",
  linked_existing: "Vinculo existente",
  created_new: "Creo nuevo",
  saved_for_report: "Guardo solo reporte",
  omitted: "Omitio",
  saved_without_cedula: "Sin cedula",
  possible_new_officer: "Posible agente",
  created_new_officer: "Agente nuevo",
  linked_existing_person: "Vinculo persona",
};

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const includesSearch = (search: string, ...values: Array<string | null | undefined>) => {
  if (!search) return true;
  const normalized = normalizeSearch(values.filter(Boolean).join(" "));
  return normalized.includes(search);
};

const ActiveBadge = ({ active }: { active: boolean }) => (
  <Badge variant={active ? "default" : "secondary"} className={active ? "bg-emerald-700" : ""}>
    {active ? "Activo" : "Inactivo"}
  </Badge>
);

const AliasStatusBadge = ({ status }: { status: string }) => (
  <Badge variant={status === "active" ? "outline" : "secondary"}>
    {status === "active" ? "Alias activo" : "Alias inactivo"}
  </Badge>
);

const SuggestionBadge = ({ status }: { status: string }) => {
  const approved = status === "approved" || status === "reviewed" || status === "active";
  const rejected = status === "rejected" || status === "dismissed";
  return (
    <Badge variant={approved ? "default" : rejected ? "secondary" : "outline"} className={approved ? "bg-emerald-700" : ""}>
      {status}
    </Badge>
  );
};

const Toolbar = ({
  search,
  onSearchChange,
  status,
  onStatusChange,
  onAdd,
  addLabel,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  status: CatalogStatusFilter;
  onStatusChange: (value: CatalogStatusFilter) => void;
  onAdd?: () => void;
  addLabel?: string;
}) => (
  <div className="flex flex-col gap-3 border-b border-border/70 p-4 lg:flex-row lg:items-center lg:justify-between">
    <div className="relative w-full lg:max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Buscar..."
        className="pl-9 lg:pl-9"
      />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Select value={status} onValueChange={(value) => onStatusChange(value as CatalogStatusFilter)}>
        <SelectTrigger className="h-9 w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(statusLabels) as CatalogStatusFilter[]).map((key) => (
            <SelectItem key={key} value={key}>{statusLabels[key]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onAdd && (
        <Button onClick={onAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      )}
    </div>
  </div>
);

const EmptyState = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md border border-dashed border-border/80 p-8 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

const RowAction = ({
  children,
  onClick,
  variant = "outline",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "outline" | "secondary" | "destructive";
  disabled?: boolean;
}) => (
  <Button type="button" variant={variant} size="sm" className="h-8 gap-1.5" onClick={onClick} disabled={disabled}>
    {children}
  </Button>
);

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-CR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const aliasesForSearch = (aliases: Array<{ alias: string }>) => aliases.map((alias) => alias.alias).join(" ");

const ReportCatalogAdmin = ({ onCatalogsChanged }: ReportCatalogAdminProps) => {
  const [data, setData] = useState<ReportCatalogAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<CatalogAdminTab>("officers");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CatalogStatusFilter>("active");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [form, setForm] = useState<EditorForm>(emptyForm);

  const searchKey = useMemo(() => normalizeSearch(search), [search]);

  const loadData = async () => {
    setLoading(true);
    try {
      setData(await loadReportCatalogAdminData());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar los catalogos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const reloadAfterMutation = async () => {
    await loadData();
    await onCatalogsChanged?.();
  };

  const openOfficerEditor = (item?: CatalogOfficer) => {
    setForm({
      ...emptyForm,
      nombre: item?.nombre || "",
      cedula: item?.cedula || "",
    });
    setEditor({ kind: "officer", item });
  };

  const openMotiveEditor = (item?: CatalogMotive) => {
    setForm({
      ...emptyForm,
      motivo: item?.motivo || "",
    });
    setEditor({ kind: "motive", item });
  };

  const openSiteEditor = (item?: CatalogSite) => {
    setForm({
      ...emptyForm,
      nombreSitio: item?.nombre_sitio || "",
      zona: item?.zona || "",
      posicion: item?.posicion || "",
    });
    setEditor({ kind: "site", item });
  };

  const openAliasEditor = (
    aliasType: CatalogAliasType,
    targetId?: string,
    item?: { id: string; alias: string; status: string; targetId: string },
  ) => {
    setForm({
      ...emptyForm,
      alias: item?.alias || "",
      targetId: item?.targetId || targetId || "",
      status: item?.status === "inactive" ? "inactive" : "active",
    });
    setEditor({ kind: "alias", aliasType, targetId, item });
  };

  const closeEditor = () => {
    setEditor(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      if (editor.kind === "officer") {
        await saveCatalogOfficer({
          id: editor.item?.id,
          nombre: form.nombre,
          cedula: form.cedula,
          active: editor.item?.active ?? true,
        });
      }
      if (editor.kind === "motive") {
        await saveCatalogMotive({
          id: editor.item?.id,
          motivo: form.motivo,
          active: editor.item?.active ?? true,
        });
      }
      if (editor.kind === "site") {
        await saveCatalogSite({
          id: editor.item?.id,
          nombre_sitio: form.nombreSitio,
          zona: form.zona,
          posicion: form.posicion,
          active: editor.item?.active ?? true,
        });
      }
      if (editor.kind === "alias") {
        await saveCatalogAlias({
          type: editor.aliasType,
          id: editor.item?.id,
          targetId: form.targetId,
          alias: form.alias,
          status: form.status,
        });
      }
      toast.success("Catalogo actualizado");
      closeEditor();
      await reloadAfterMutation();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const mutate = async (callback: () => Promise<void>, successMessage: string) => {
    setSaving(true);
    try {
      await callback();
      toast.success(successMessage);
      await reloadAfterMutation();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  const filteredOfficers = useMemo(() => {
    if (!data) return [];
    return data.officers.filter((officer) => {
      const statusOk = statusFilter === "all" || officer.active === (statusFilter === "active");
      return statusOk && includesSearch(searchKey, officer.nombre, officer.cedula, aliasesForSearch(officer.aliases));
    });
  }, [data, searchKey, statusFilter]);

  const filteredMotives = useMemo(() => {
    if (!data) return [];
    return data.motives.filter((motive) => {
      const statusOk = statusFilter === "all" || motive.active === (statusFilter === "active");
      return statusOk && includesSearch(searchKey, motive.motivo, aliasesForSearch(motive.aliases));
    });
  }, [data, searchKey, statusFilter]);

  const filteredSites = useMemo(() => {
    if (!data) return [];
    return data.sites.filter((site) => {
      const statusOk = statusFilter === "all" || site.active === (statusFilter === "active");
      return statusOk && includesSearch(searchKey, site.nombre_sitio, site.zona, site.posicion, aliasesForSearch(site.aliases));
    });
  }, [data, searchKey, statusFilter]);

  const filteredAliasSuggestions = useMemo(() => {
    if (!data) return [];
    return data.aliasSuggestions.filter((suggestion) =>
      includesSearch(searchKey, suggestion.raw_alias, suggestion.officerName, suggestion.status),
    );
  }, [data, searchKey]);

  const filteredPersonSuggestions = useMemo(() => {
    if (!data) return [];
    return data.personSuggestions.filter((suggestion) =>
      includesSearch(searchKey, suggestion.raw_name, suggestion.final_name, suggestion.officerName, suggestion.action_taken, suggestion.status),
    );
  }, [data, searchKey]);

  const filteredCatalogSuggestions = useMemo(() => {
    if (!data) return [];
    return data.catalogSuggestions.filter((suggestion) =>
      includesSearch(searchKey, suggestion.raw_value, suggestion.final_value, suggestion.catalogLabel, suggestion.action_taken, suggestion.status),
    );
  }, [data, searchKey]);

  const targetOptions = useMemo(() => {
    if (!data || editor?.kind !== "alias") return [];
    if (editor.aliasType === "officer") {
      return data.officers.map((item) => ({ id: item.id, label: `${item.nombre} - ${item.cedula}` }));
    }
    if (editor.aliasType === "motive") {
      return data.motives.map((item) => ({ id: item.id, label: item.motivo }));
    }
    return data.sites.map((item) => ({ id: item.id, label: item.nombre_sitio }));
  }, [data, editor]);

  const renderAliasChips = (
    type: CatalogAliasType,
    aliases: Array<{ id: string; alias: string; status: string; [key: string]: string | null | undefined }>,
    targetIdKey: "officer_id" | "motive_id" | "site_id",
  ) => {
    if (aliases.length === 0) {
      return <span className="text-xs text-muted-foreground">Sin alias</span>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {aliases.map((alias) => (
          <span key={alias.id} className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1 text-xs">
            <span>{alias.alias}</span>
            <AliasStatusBadge status={alias.status} />
            <button
              type="button"
              className="rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={() => openAliasEditor(type, String(alias[targetIdKey] || ""), {
                id: alias.id,
                alias: alias.alias,
                status: alias.status,
                targetId: String(alias[targetIdKey] || ""),
              })}
              aria-label={`Editar alias ${alias.alias}`}
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={() => mutate(
                () => setCatalogAliasStatus(type, alias.id, alias.status === "active" ? "inactive" : "active"),
                alias.status === "active" ? "Alias desactivado" : "Alias reactivado",
              )}
              aria-label={alias.status === "active" ? `Desactivar alias ${alias.alias}` : `Reactivar alias ${alias.alias}`}
            >
              {alias.status === "active" ? <CircleOff className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
            </button>
          </span>
        ))}
      </div>
    );
  };

  const renderOfficers = () => (
    <>
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        onAdd={() => openOfficerEditor()}
        addLabel="Agregar oficial"
      />
      <div className="space-y-2 p-4">
        {filteredOfficers.length === 0 && <EmptyState>No hay oficiales para este filtro.</EmptyState>}
        {filteredOfficers.map((officer) => (
          <div key={officer.id} className="rounded-md border border-border/75 bg-background p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <UserRound className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-foreground">{officer.nombre}</h4>
                  <Badge variant="outline">{officer.cedula}</Badge>
                  <ActiveBadge active={officer.active} />
                </div>
                {renderAliasChips("officer", officer.aliases, "officer_id")}
              </div>
              <div className="flex flex-wrap gap-2">
                <RowAction onClick={() => openOfficerEditor(officer)}>
                  <Edit3 className="h-4 w-4" />
                  Editar
                </RowAction>
                <RowAction onClick={() => openAliasEditor("officer", officer.id)}>
                  <Link2 className="h-4 w-4" />
                  Alias
                </RowAction>
                <RowAction
                  variant={officer.active ? "destructive" : "secondary"}
                  onClick={() => mutate(
                    () => setCatalogOfficerActive(officer.id, !officer.active),
                    officer.active ? "Oficial desactivado" : "Oficial reactivado",
                  )}
                >
                  {officer.active ? <CircleOff className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  {officer.active ? "Desactivar" : "Reactivar"}
                </RowAction>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  const renderMotives = () => (
    <>
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        onAdd={() => openMotiveEditor()}
        addLabel="Agregar motivo"
      />
      <div className="space-y-2 p-4">
        {filteredMotives.length === 0 && <EmptyState>No hay motivos para este filtro.</EmptyState>}
        {filteredMotives.map((motive) => (
          <div key={motive.id} className="rounded-md border border-border/75 bg-background p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Tags className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-foreground">{motive.motivo}</h4>
                  <ActiveBadge active={motive.active} />
                </div>
                {renderAliasChips("motive", motive.aliases, "motive_id")}
              </div>
              <div className="flex flex-wrap gap-2">
                <RowAction onClick={() => openMotiveEditor(motive)}>
                  <Edit3 className="h-4 w-4" />
                  Editar
                </RowAction>
                <RowAction onClick={() => openAliasEditor("motive", motive.id)}>
                  <Link2 className="h-4 w-4" />
                  Alias
                </RowAction>
                <RowAction
                  variant={motive.active ? "destructive" : "secondary"}
                  onClick={() => mutate(
                    () => setCatalogMotiveActive(motive.id, !motive.active),
                    motive.active ? "Motivo desactivado" : "Motivo reactivado",
                  )}
                >
                  {motive.active ? <CircleOff className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  {motive.active ? "Desactivar" : "Reactivar"}
                </RowAction>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  const renderSites = () => (
    <>
      <Toolbar
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        onAdd={() => openSiteEditor()}
        addLabel="Agregar sitio"
      />
      <div className="space-y-2 p-4">
        {filteredSites.length === 0 && <EmptyState>No hay sitios para este filtro.</EmptyState>}
        {filteredSites.map((site) => (
          <div key={site.id} className="rounded-md border border-border/75 bg-background p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-foreground">{site.nombre_sitio}</h4>
                  <ActiveBadge active={site.active} />
                  {site.zona && <Badge variant="outline">{site.zona}</Badge>}
                </div>
                {site.posicion && <p className="text-sm text-muted-foreground">{site.posicion}</p>}
                {renderAliasChips("site", site.aliases, "site_id")}
              </div>
              <div className="flex flex-wrap gap-2">
                <RowAction onClick={() => openSiteEditor(site)}>
                  <Edit3 className="h-4 w-4" />
                  Editar
                </RowAction>
                <RowAction onClick={() => openAliasEditor("site", site.id)}>
                  <Link2 className="h-4 w-4" />
                  Alias
                </RowAction>
                <RowAction
                  variant={site.active ? "destructive" : "secondary"}
                  onClick={() => mutate(
                    () => setCatalogSiteActive(site.id, !site.active),
                    site.active ? "Sitio desactivado" : "Sitio reactivado",
                  )}
                >
                  {site.active ? <CircleOff className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  {site.active ? "Desactivar" : "Reactivar"}
                </RowAction>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  const renderAliasSuggestion = (suggestion: CatalogAliasSuggestion) => (
    <div key={suggestion.id} className="rounded-md border border-border/75 bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <span className="font-semibold">{suggestion.raw_alias}</span>
            <SuggestionBadge status={suggestion.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Alias sugerido para {suggestion.officerName} {suggestion.officerCedula && `(${suggestion.officerCedula})`}
          </p>
          <p className="text-xs text-muted-foreground">{formatDateTime(suggestion.created_at)}</p>
        </div>
        {suggestion.status === "pending" && (
          <div className="flex flex-wrap gap-2">
            <RowAction onClick={() => mutate(() => approveOfficerAliasSuggestion(suggestion), "Alias aprobado")}>
              <CheckCircle2 className="h-4 w-4" />
              Aprobar
            </RowAction>
            <RowAction variant="secondary" onClick={() => mutate(() => rejectOfficerAliasSuggestion(suggestion.id), "Sugerencia descartada")}>
              <XCircle className="h-4 w-4" />
              Descartar
            </RowAction>
          </div>
        )}
      </div>
    </div>
  );

  const renderPersonSuggestion = (suggestion: CatalogPersonSuggestion) => (
    <div key={suggestion.id} className="rounded-md border border-border/75 bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            <span className="font-semibold">{suggestion.raw_name}</span>
            <SuggestionBadge status={suggestion.status} />
            <Badge variant="outline">{actionLabels[suggestion.action_taken] || suggestion.action_taken}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Final: {suggestion.final_name || "Sin valor final"}
            {suggestion.officerName ? ` - vinculado a ${suggestion.officerName}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">{formatDateTime(suggestion.created_at)}</p>
        </div>
        {suggestion.status === "pending" && (
          <div className="flex flex-wrap gap-2">
            <RowAction onClick={() => mutate(() => updatePersonSuggestionStatus(suggestion.id, "reviewed"), "Sugerencia revisada")}>
              <CheckCircle2 className="h-4 w-4" />
              Revisada
            </RowAction>
            <RowAction variant="secondary" onClick={() => mutate(() => updatePersonSuggestionStatus(suggestion.id, "dismissed"), "Sugerencia descartada")}>
              <XCircle className="h-4 w-4" />
              Descartar
            </RowAction>
          </div>
        )}
      </div>
    </div>
  );

  const renderSuggestions = () => (
    <>
      <div className="border-b border-border/70 p-4">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar sugerencias..." className="pl-9 lg:pl-9" />
        </div>
      </div>
      <div className="space-y-5 p-4">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">Alias de oficiales</h4>
          </div>
          {filteredAliasSuggestions.length === 0 && <EmptyState>No hay sugerencias de alias.</EmptyState>}
          {filteredAliasSuggestions.map(renderAliasSuggestion)}
        </section>
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">Personas revisadas</h4>
          </div>
          {filteredPersonSuggestions.length === 0 && <EmptyState>No hay sugerencias de personas.</EmptyState>}
          {filteredPersonSuggestions.map(renderPersonSuggestion)}
        </section>
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Tags className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">Motivos y sitios</h4>
          </div>
          {filteredCatalogSuggestions.length === 0 && <EmptyState>No hay historial de motivos o sitios.</EmptyState>}
          {filteredCatalogSuggestions.map((suggestion) => (
            <div key={suggestion.id} className="rounded-md border border-border/75 bg-background p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{suggestion.raw_value}</span>
                    <Badge variant="outline">{suggestion.catalog_type === "motive" ? "Motivo" : "Sitio"}</Badge>
                    <Badge variant="outline">{actionLabels[suggestion.action_taken] || suggestion.action_taken}</Badge>
                    <SuggestionBadge status={suggestion.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Final: {suggestion.final_value || "Sin valor final"}
                    {suggestion.catalogLabel ? ` - catalogo: ${suggestion.catalogLabel}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(suggestion.created_at)}</p>
                </div>
                {suggestion.status === "active" && (
                  <div className="flex flex-wrap gap-2">
                    <RowAction onClick={() => mutate(() => updateCatalogSuggestionStatus(suggestion.id, "reviewed"), "Historial marcado como revisado")}>
                      <CheckCircle2 className="h-4 w-4" />
                      Revisada
                    </RowAction>
                    <RowAction variant="secondary" onClick={() => mutate(() => updateCatalogSuggestionStatus(suggestion.id, "dismissed"), "Historial descartado")}>
                      <XCircle className="h-4 w-4" />
                      Descartar
                    </RowAction>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h4 className="font-semibold">Cambios manuales recientes</h4>
          </div>
          {!data?.audit.length && <EmptyState>No hay cambios manuales recientes.</EmptyState>}
          {data?.audit.slice(0, 20).map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1 rounded-md border border-border/75 bg-muted/25 p-3 text-sm lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{entry.entity_table}</Badge>
                <span className="font-medium">{entry.action}</span>
                <span className="text-muted-foreground">{entry.entity_id}</span>
              </div>
              <span className="text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );

  const editorTitle = editor?.kind === "officer"
    ? editor.item ? "Editar oficial" : "Agregar oficial"
    : editor?.kind === "motive"
      ? editor.item ? "Editar motivo" : "Agregar motivo"
      : editor?.kind === "site"
        ? editor.item ? "Editar sitio" : "Agregar sitio"
        : editor?.kind === "alias"
          ? editor.item ? "Editar alias" : "Agregar alias"
          : "";

  return (
    <Card className="overflow-hidden border-border/80">
      <div className="flex flex-col gap-3 border-b border-border/80 bg-muted/30 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Catalogos V2</p>
            <h3 className="text-lg font-semibold text-foreground">Control de catalogos y aprendizaje</h3>
            <p className="text-sm text-muted-foreground">
              Edite opciones, alias y sugerencias que usa la importacion con confianza.
            </p>
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={loadData} disabled={loading || saving}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as CatalogAdminTab); setSearch(""); }} className="w-full">
        <div className="border-b border-border/80 px-4 pt-4">
          <TabsList>
            <TabsTrigger value="officers">Oficiales</TabsTrigger>
            <TabsTrigger value="motives">Motivos</TabsTrigger>
            <TabsTrigger value="sites">Sitios</TabsTrigger>
            <TabsTrigger value="suggestions">Sugerencias</TabsTrigger>
          </TabsList>
        </div>

        {loading && (
          <div className="flex min-h-[280px] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando catalogos...
          </div>
        )}

        {!loading && data && (
          <>
            <TabsContent value="officers" className="m-0">{renderOfficers()}</TabsContent>
            <TabsContent value="motives" className="m-0">{renderMotives()}</TabsContent>
            <TabsContent value="sites" className="m-0">{renderSites()}</TabsContent>
            <TabsContent value="suggestions" className="m-0">{renderSuggestions()}</TabsContent>
          </>
        )}
      </Tabs>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open) closeEditor(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editorTitle}</DialogTitle>
            <DialogDescription>
              Los cambios quedan activos para proximas importaciones y se registran en auditoria.
            </DialogDescription>
          </DialogHeader>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
            className="space-y-4"
          >
            {editor?.kind === "officer" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="catalog-officer-name">Nombre</Label>
                  <Input id="catalog-officer-name" value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="catalog-officer-cedula">Cedula</Label>
                  <Input id="catalog-officer-cedula" value={form.cedula} onChange={(event) => setForm((current) => ({ ...current, cedula: event.target.value.replace(/\D/g, "") }))} />
                </div>
              </>
            )}

            {editor?.kind === "motive" && (
              <div className="space-y-2">
                <Label htmlFor="catalog-motive-name">Motivo</Label>
                <Input id="catalog-motive-name" value={form.motivo} onChange={(event) => setForm((current) => ({ ...current, motivo: event.target.value }))} />
              </div>
            )}

            {editor?.kind === "site" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="catalog-site-name">Sitio</Label>
                  <Input id="catalog-site-name" value={form.nombreSitio} onChange={(event) => setForm((current) => ({ ...current, nombreSitio: event.target.value }))} />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="catalog-site-zone">Zona</Label>
                    <Input id="catalog-site-zone" value={form.zona} onChange={(event) => setForm((current) => ({ ...current, zona: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-site-position">Posicion</Label>
                    <Input id="catalog-site-position" value={form.posicion} onChange={(event) => setForm((current) => ({ ...current, posicion: event.target.value }))} />
                  </div>
                </div>
              </>
            )}

            {editor?.kind === "alias" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="catalog-alias-name">Alias</Label>
                  <Input id="catalog-alias-name" value={form.alias} onChange={(event) => setForm((current) => ({ ...current, alias: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Destino</Label>
                  <Select value={form.targetId} onValueChange={(value) => setForm((current) => ({ ...current, targetId: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione destino..." />
                    </SelectTrigger>
                    <SelectContent>
                      {targetOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as "active" | "inactive" }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Activo</SelectItem>
                      <SelectItem value="inactive">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeEditor} disabled={saving}>Cancelar</Button>
              <Button type="submit" disabled={saving} className={cn("gap-2", saving && "opacity-80")}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ReportCatalogAdmin;
