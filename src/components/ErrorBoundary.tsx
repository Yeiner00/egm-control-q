import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary capturo:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            role="alert"
            className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center"
          >
            <h1 className="text-2xl font-bold text-foreground">Algo salio mal</h1>
            <p className="text-muted-foreground max-w-md">
              La aplicacion encontro un error inesperado. Recarga la pagina para continuar.
            </p>
            <Button onClick={() => window.location.reload()}>Recargar</Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

const ErrorBoundary = ErrorBoundaryInner;
export default ErrorBoundary;
