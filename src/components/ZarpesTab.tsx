import { CalendarRange, Ship } from "lucide-react";
import { Card } from "@/components/ui/card";
import ZarpeTable from "@/components/ZarpeTable";

const ZarpesTab = () => {
  return (
    <div className="space-y-5 animate-fade-in">
      <Card className="mx-auto w-full overflow-hidden">
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="flex items-start gap-3">
            <div className="section-icon-shell">
              <Ship className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="section-eyebrow">Modulo de zarpes</div>
              <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">
                Consultar y exportar zarpes
              </h3>
              <p className="section-copy">
                Revise los registros guardados y descargue el Excel por rango de fechas.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="mx-auto w-full overflow-hidden">
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="flex items-center gap-3">
            <div className="section-icon-shell">
              <CalendarRange className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="section-eyebrow">Consulta</div>
              <h2 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">
                Registros de zarpes
              </h2>
              <p className="section-copy">
                Filtre por rango de fechas y exporte los zarpes registrados.
              </p>
            </div>
          </div>
        </div>
        <ZarpeTable refreshKey={0} />
      </Card>
    </div>
  );
};

export default ZarpesTab;
