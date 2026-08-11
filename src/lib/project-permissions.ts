// Permisos granulares por proyecto: extiende proyecto_usuarios (acceso por-recurso
// ya existente) en vez de crear un sistema de permisos paralelo.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ProyectoAcceso {
  canEditPresupuesto: boolean;
  canEditCronograma: boolean;
  canViewProgramacionFinanciera: boolean;
  canEditProgramacionFinanciera: boolean;
}

const FULL_ACCESS: ProyectoAcceso = {
  canEditPresupuesto: true,
  canEditCronograma: true,
  canViewProgramacionFinanciera: true,
  canEditProgramacionFinanciera: true,
};

const NO_ACCESS: ProyectoAcceso = {
  canEditPresupuesto: false,
  canEditCronograma: false,
  canViewProgramacionFinanciera: false,
  canEditProgramacionFinanciera: false,
};

// Arquitecto: ve todo el módulo Proyectos (incluida la programación financiera)
// en todos los proyectos sin necesidad de asignación por proyecto_usuarios, pero
// solo puede editar el cronograma (fecha_inicio/fecha_fin/avance); nunca el
// presupuesto ni la programación financiera.
const ARQUITECTO_ACCESS: ProyectoAcceso = {
  canEditPresupuesto: false,
  canEditCronograma: true,
  canViewProgramacionFinanciera: true,
  canEditProgramacionFinanciera: false,
};

/**
 * Permisos del usuario actual dentro de un proyecto.
 * admin/contador: acceso total (igual que hoy). arquitecto: ve todo, solo edita
 * cronograma, en todos los proyectos (sin depender de proyecto_usuarios).
 * rol 'usuario': depende de las banderas de su fila en proyecto_usuarios
 * (editar_cronograma, ver_programacion_financiera, editar_programacion_financiera);
 * editar presupuesto sigue reservado a admin/contador, sin cambios.
 */
export function useProyectoAcceso(proyectoId: string | undefined): ProyectoAcceso {
  const { role, user } = useAuth();
  const [acceso, setAcceso] = useState<ProyectoAcceso>(NO_ACCESS);

  useEffect(() => {
    if (role === "admin" || role === "contador") {
      setAcceso(FULL_ACCESS);
      return;
    }
    if (role === "arquitecto") {
      setAcceso(ARQUITECTO_ACCESS);
      return;
    }
    if (!proyectoId || !user) {
      setAcceso(NO_ACCESS);
      return;
    }

    let activo = true;
    supabase
      .from("proyecto_usuarios")
      .select("editar_cronograma, ver_programacion_financiera, editar_programacion_financiera")
      .eq("proyecto_id", proyectoId)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!activo) return;
        if (!data) {
          setAcceso(NO_ACCESS);
          return;
        }
        setAcceso({
          canEditPresupuesto: false,
          canEditCronograma: data.editar_cronograma,
          canViewProgramacionFinanciera: data.ver_programacion_financiera,
          canEditProgramacionFinanciera: data.editar_programacion_financiera,
        });
      });

    return () => {
      activo = false;
    };
  }, [role, user, proyectoId]);

  return acceso;
}
