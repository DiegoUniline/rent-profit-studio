import { Link, useLocation } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import rafaAvatar from "@/assets/rafa-avatar.png";

/** Botón flotante visible solo dentro de la vista de Rafa. */
export function RafaFab() {
  const location = useLocation();


  if (location.pathname !== "/rafa") return null;


  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/rafa"
          aria-label="Abrir asistente Rafa"
          className="group fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-card border border-border/70 py-2 pl-2 pr-4 shadow-lg hover:shadow-xl hover:border-primary/50 transition-all"
        >
          <span className="relative">
            <img
              src={rafaAvatar}
              alt="Rafa, asistente de proyectos"
              loading="lazy"
              width={816}
              height={816}
              className="h-12 w-12 rounded-full object-cover object-top bg-primary/10 ring-2 ring-primary/30 group-hover:ring-primary transition-all"
            />
            <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-card" />
          </span>
          <span className="hidden sm:flex flex-col leading-tight text-left">
            <span className="text-sm font-semibold">Rafa</span>
            <span className="text-[11px] text-muted-foreground">¿Te ayudo?</span>
          </span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="left">Habla con Rafa, tu asistente de proyectos</TooltipContent>
    </Tooltip>
  );
}
