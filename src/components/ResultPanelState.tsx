import type { ReactNode } from "react";
import { SearchCheck } from "lucide-react";

interface ResultPanelStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
}

const ResultPanelState = ({
  title,
  description,
  icon,
}: ResultPanelStateProps) => {
  return (
    <div className="empty-state border-0 bg-transparent px-4 py-6">
      <div className="flex items-center justify-center text-primary">
        {icon ?? <SearchCheck className="h-7 w-7" />}
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
};

export default ResultPanelState;
