import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { RafaChat } from "@/components/rafa/RafaChat";
import { contextoDeRuta } from "@/lib/rafa-chat";
import rafaAvatar from "@/assets/rafa-avatar.png";

/**
 * Botón flotante de Rafa en todas las pantallas (roles con acceso a Rafa).
 * Abre el chat en un panel lateral y le pasa la pantalla actual como contexto
 * (ruta, registro abierto y empresa filtrada). En /rafa no se muestra: ahí el
 * chat ocupa la página.
 */
export function RafaFab() {
  const location = useLocation();
  const { role } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const contexto = useMemo(() => contextoDeRuta(location.pathname), [location.pathname]);

  if (location.pathname === "/rafa") return null;
  if (role !== "admin" && role !== "contador") return null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            aria-label="Abrir asistente Rafa"
            className="group fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full bg-card border border-border/70 py-2 pl-2 pr-4 shadow-lg hover:shadow-xl hover:border-primary/50 transition-all"
          >
            <span className="relative">
              <img
                src={rafaAvatar}
                alt="Rafa, asistente"
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
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">Pregúntale a Rafa sobre esta pantalla</TooltipContent>
      </Tooltip>
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="right" className="flex w-full flex-col gap-3 sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Rafa</SheetTitle>
            <SheetDescription>
              Usa esta pantalla como contexto.{" "}
              <Link to="/rafa" className="text-primary underline-offset-2 hover:underline" onClick={() => setAbierto(false)}>
                Abrir en página completa
              </Link>
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <RafaChat compacto contextoPantalla={contexto} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
