import { Link, useLocation } from "react-router-dom";
import { Bot } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Botón flotante siempre visible que lleva al asistente Rafa. */
export function RafaFab() {
  const { role } = useAuth();
  const location = useLocation();

  if (role !== "admin" && role !== "contador") return null;
  if (location.pathname === "/rafa") return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          size="lg"
          className="fixed bottom-6 right-6 z-50 h-14 gap-2 rounded-full px-5 shadow-lg hover:shadow-xl transition-shadow"
        >
          <Link to="/rafa" aria-label="Abrir asistente Rafa">
            <Bot className="h-5 w-5" />
            <span className="hidden sm:inline font-semibold">Rafa</span>
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">Asistente Rafa</TooltipContent>
    </Tooltip>
  );
}
