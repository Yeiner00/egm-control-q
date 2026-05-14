import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  onChoice: (choice: "overwrite" | "new") => void;
  folio: string;
}

const DuplicateModal = ({ open, onClose, onChoice, folio }: Props) => {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Zarpe Duplicado</AlertDialogTitle>
          <AlertDialogDescription>
            Ya existe un registro con el folio <strong>{folio}</strong>. ¿Deseas sobrescribir el registro existente o crear uno nuevo?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => onChoice("overwrite")} className="bg-warning hover:bg-warning/90">
            Sobrescribir
          </AlertDialogAction>
          <AlertDialogAction onClick={() => onChoice("new")}>
            Crear Nuevo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DuplicateModal;
