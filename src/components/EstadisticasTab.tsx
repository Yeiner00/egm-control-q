import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardVehicles from "@/components/estadisticas/DashboardVehicles";
import DashboardBoats from "@/components/estadisticas/DashboardBoats";
import { CarFront, ClipboardList, Ship } from "lucide-react";
import { Card } from "@/components/ui/card";

type ReportEditTarget =
  | { tipo: "vehiculo"; reportId: string }
  | { tipo: "embarcacion"; reportId: string };

interface EstadisticasTabProps {
  onEditReport?: (target: ReportEditTarget) => void;
}

const EstadisticasTab = ({ onEditReport }: EstadisticasTabProps) => {
  return (
    <div className="space-y-5 animate-fade-in lg:space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="flex items-start gap-3">
            <div className="flex shrink-0 items-center justify-center text-primary">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="section-eyebrow">Propuestas</div>
              <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">Generar propuesta por persona</h3>
              <p className="section-copy">
                Consulte los datos de vehiculo o embarcacion en un periodo seleccionado para respaldar propuestas y justificar una calificacion alta por desempeno.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="dashboard-vehiculos" className="space-y-5 lg:space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard-vehiculos">
            <CarFront className="h-4 w-4" />
            Vehiculos
          </TabsTrigger>
          <TabsTrigger value="dashboard-embarcacion">
            <Ship className="h-4 w-4" />
            Embarcacion
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard-vehiculos">
          <DashboardVehicles onEditReport={onEditReport} />
        </TabsContent>
        <TabsContent value="dashboard-embarcacion">
          <DashboardBoats onEditReport={onEditReport} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EstadisticasTab;
