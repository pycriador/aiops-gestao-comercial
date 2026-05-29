import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { API_BASE_URL } from "@/lib/api/config";
import { useBackendStatus } from "@/hooks/use-backend-status";

export function BackendOfflineBanner() {
  const { status } = useBackendStatus();

  if (status === "online") return null;

  if (status === "checking") {
    return (
      <Alert className="rounded-none border-x-0 border-t-0">
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertTitle>Verificando conexão…</AlertTitle>
        <AlertDescription>Conectando ao backend em {API_BASE_URL}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Backend indisponível</AlertTitle>
      <AlertDescription>
        Não foi possível comunicar com o servidor ({API_BASE_URL}). Você continua autenticado; os dados
        exibidos podem estar desatualizados até a conexão voltar.
      </AlertDescription>
    </Alert>
  );
}
