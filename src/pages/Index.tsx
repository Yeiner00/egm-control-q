import { Suspense, lazy, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Anchor,
  BarChart3,
  ClipboardList,
  FileSpreadsheet,
  Home,
  LogOut,
  Menu,
  PanelLeftClose,
  Ship,
  X,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import HeaderMiniCalendar from "@/components/HeaderMiniCalendar";
import { cn } from "@/lib/utils";

const InicioTab = lazy(() => import("@/components/InicioTab"));
const ReportesTab = lazy(() => import("@/components/ReportesTab"));
const ZarpesTab = lazy(() => import("@/components/ZarpesTab"));
const EstadisticasTab = lazy(() => import("@/components/EstadisticasTab"));
const EstadisticaTab = lazy(() => import("@/components/EstadisticaTab"));

type AppTab = "inicio" | "zarpes" | "reportes" | "estadisticas" | "estadistica";
type ReportesSubtab = "manual" | "subir" | "gestionar" | "exportar";
type ZarpesSubtab = "subir" | "consulta";
type ReportEditTarget =
  | { tipo: "vehiculo"; reportId: string }
  | { tipo: "embarcacion"; reportId: string };
type SubtabRequest<T extends string> = { value: T; nonce: number; editTarget?: ReportEditTarget };

const NAV_ITEMS: Array<{
  value: AppTab;
  label: string;
  shortLabel: string;
  eyebrow: string;
  icon: typeof Home;
}> = [
  { value: "inicio", label: "Inicio", shortLabel: "Panel operativo", eyebrow: "Vista general", icon: Home },
  { value: "reportes", label: "Reportes", shortLabel: "Carga y gestion", eyebrow: "Datos operativos", icon: FileSpreadsheet },
  { value: "estadisticas", label: "Propuestas", shortLabel: "Analisis por persona", eyebrow: "Insumos y evaluacion", icon: ClipboardList },
  { value: "estadistica", label: "Estadistica", shortLabel: "Indicadores", eyebrow: "Proximamente", icon: BarChart3 },
  { value: "zarpes", label: "Zarpes", shortLabel: "Control de zarpes", eyebrow: "Operacion maritima", icon: Ship },
];

const TabFallback = () => (
  <div className="flex justify-center py-12">
    <div className="operational-loader">
      <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <span>Cargando modulo operativo...</span>
    </div>
  </div>
);

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>("inicio");
  const [reportesSubtabRequest, setReportesSubtabRequest] = useState<SubtabRequest<ReportesSubtab> | null>(null);
  const [zarpesSubtabRequest, setZarpesSubtabRequest] = useState<SubtabRequest<ZarpesSubtab> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session) navigate("/login");
    });

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (!data.session) navigate("/login");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    navigate("/login");
  }, [navigate]);

  const handleTabChange = (value: AppTab) => {
    setActiveTab(value);
    setSidebarOpen(false);
    if (value !== "reportes") {
      setReportesSubtabRequest(null);
    }
  };

  const openReportesManual = () => {
    setReportesSubtabRequest({ value: "manual", nonce: Date.now() });
    handleTabChange("reportes");
  };

  const openZarpesUpload = () => {
    setZarpesSubtabRequest({ value: "subir", nonce: Date.now() });
    handleTabChange("zarpes");
  };

  const openEstadistica = () => {
    handleTabChange("estadistica");
  };

  const openReportEditor = (target: ReportEditTarget) => {
    setReportesSubtabRequest({ value: "gestionar", nonce: Date.now(), editTarget: target });
    handleTabChange("reportes");
  };

  const clearReportesSubtabRequest = (nonce: number) => {
    setReportesSubtabRequest((current) => (current?.nonce === nonce ? null : current));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="operational-loader">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span>Preparando panel operativo...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const userLabel = user.email?.split("@")[0]?.replace(/[._-]+/g, " ") ?? "Usuario";

  return (
    <div className="app-shell app-shell-sidebar">
      <Tabs value={activeTab} onValueChange={(value) => handleTabChange(value as AppTab)} className="min-h-screen">
        <aside className="sidebar-rail hidden lg:flex">
          <div className="sidebar-brand-compact">
            <div className="sidebar-brand-mark sidebar-brand-mark-compact">
              <Anchor className="h-9 w-9" />
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Navegacion principal">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handleTabChange(item.value)}
                  className={cn("sidebar-nav-item", isActive && "sidebar-nav-item-active")}
                >
                  <span className={cn("sidebar-nav-icon", isActive && "sidebar-nav-icon-active")}>
                    <Icon className="h-[1.4rem] w-[1.4rem]" />
                  </span>
                  <span className="sidebar-nav-label">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="sidebar-footer w-full">
            <div className="sidebar-user-card">
              <span className="sidebar-user-name" title={userLabel}>
                {userLabel}
              </span>
            </div>
          </div>
        </aside>

        <div className="flex h-screen min-h-0 flex-1 flex-col overflow-hidden lg:pl-[5.25rem]">
          <header className="top-header">
            <div className="relative z-10 flex min-h-[4.75rem] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:min-h-[4.1rem] lg:px-6 lg:py-2.5">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="header-icon-button lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Abrir menu lateral"
                >
                  <Menu className="h-[1.1rem] w-[1.1rem]" />
                </Button>
                <div className="app-title-lockup">
                  <span className="app-title">
                    Administracion reportes
                  </span>
                  <span className="app-title-status">
                    No oficial
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <HeaderMiniCalendar />
                <ThemeToggle className="header-icon-button shrink-0" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="header-icon-button header-exit-button shrink-0"
                  onClick={handleLogout}
                  aria-label="Cerrar sesion"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="text-sm font-semibold">Salir</span>
                </Button>
              </div>
            </div>
          </header>

          <main className="panel-section app-workspace min-h-0 flex-1 space-y-6 overflow-y-auto py-6 sm:py-8 lg:space-y-5 lg:py-5">
            <TabsContent value="inicio">
              <Suspense fallback={<TabFallback />}>
                <InicioTab
                  onOpenReportesManual={openReportesManual}
                  onOpenZarpesUpload={openZarpesUpload}
                  onOpenEstadistica={openEstadistica}
                />
              </Suspense>
            </TabsContent>
            <TabsContent value="zarpes">
              <Suspense fallback={<TabFallback />}>
                <ZarpesTab subtabRequest={zarpesSubtabRequest} />
              </Suspense>
            </TabsContent>
            <TabsContent value="reportes">
              <Suspense fallback={<TabFallback />}>
                <ReportesTab subtabRequest={reportesSubtabRequest} onSubtabRequestConsumed={clearReportesSubtabRequest} />
              </Suspense>
            </TabsContent>
            <TabsContent value="estadisticas">
              <Suspense fallback={<TabFallback />}>
                <EstadisticasTab onEditReport={openReportEditor} />
              </Suspense>
            </TabsContent>
            <TabsContent value="estadistica">
              <Suspense fallback={<TabFallback />}>
                <EstadisticaTab />
              </Suspense>
            </TabsContent>
          </main>
        </div>

        <div
          className={cn(
            "fixed inset-0 z-50 bg-background/70 backdrop-blur-sm transition-all duration-300 lg:hidden",
            sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setSidebarOpen(false)}
        >
          <div
            className={cn(
              "h-full w-[18rem] max-w-[86vw] border-r border-white/10 bg-navy px-4 py-4 text-white shadow-[18px_0_50px_-22px_rgba(2,8,23,0.9)] transition-transform duration-300",
              sidebarOpen ? "translate-x-0" : "-translate-x-full",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="sidebar-brand-mark h-10 w-10 rounded-[0.95rem]">
                  <Anchor className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <span className="block truncate text-sm font-bold tracking-[0.08em] text-white">Administracion reportes</span>
                  <span className="block text-[0.72rem] font-bold uppercase tracking-[0.18em] text-teal-light">No oficial</span>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setSidebarOpen(false)}
                aria-label="Cerrar menu lateral"
              >
                <X className="h-[1.1rem] w-[1.1rem]" />
              </Button>
            </div>

            <nav className="space-y-2" aria-label="Navegacion movil">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.value;

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => handleTabChange(item.value)}
                    className={cn("sidebar-nav-item", isActive && "sidebar-nav-item-active")}
                  >
                    <span className={cn("sidebar-nav-icon", isActive && "sidebar-nav-icon-active")}>
                    <Icon className="h-[1.25rem] w-[1.25rem]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{item.label}</span>
                      <span className="block truncate text-[0.68rem] text-current/65">{item.eyebrow}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-6 border-t border-white/10 pt-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-white/75">
                <PanelLeftClose className="h-4 w-4" />
                <span>Navegacion operativa</span>
              </div>
              <div className="sidebar-user-chip">
                <div className="sidebar-user-dot" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white/95">{userLabel}</div>
                  <div className="truncate text-[0.68rem] text-white/55">Sesion activa</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  );
};

export default Index;
