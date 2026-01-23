import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, BookOpen, Users, TrendingUp } from "lucide-react";

interface Stats {
  empresas: number;
  cuentas: number;
  usuarios: number;
}

export default function Dashboard() {
  const { role } = useAuth();
  const [stats, setStats] = useState<Stats>({ empresas: 0, cuentas: 0, usuarios: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [empresasRes, cuentasRes] = await Promise.all([
        supabase.from("empresas").select("id", { count: "exact", head: true }),
        supabase.from("cuentas_contables").select("id", { count: "exact", head: true }),
      ]);

      let usuariosCount = 0;
      if (role === "admin") {
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true });
        usuariosCount = count ?? 0;
      }

      setStats({
        empresas: empresasRes.count ?? 0,
        cuentas: cuentasRes.count ?? 0,
        usuarios: usuariosCount,
      });
      setLoading(false);
    };

    fetchStats();
  }, [role]);

  const cards = [
    {
      title: "Empresas",
      value: stats.empresas,
      description: "Empresas registradas",
      icon: Building,
      show: role === "admin" || role === "contador",
    },
    {
      title: "Cuentas",
      value: stats.cuentas,
      description: "Cuentas contables",
      icon: BookOpen,
      show: role === "admin" || role === "contador",
    },
    {
      title: "Usuarios",
      value: stats.usuarios,
      description: "Usuarios del sistema",
      icon: Users,
      show: role === "admin",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Bienvenido a MaqRentable</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards
          .filter((card) => card.show)
          .map((card) => (
            <Card key={card.title} className="animate-slide-in">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loading ? "..." : card.value}
                </div>
                <p className="text-xs text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Resumen del Sistema
          </CardTitle>
          <CardDescription>Estado actual de MaqRentable</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Utiliza el menú lateral para navegar entre los diferentes módulos del sistema.
            {role === "admin" && " Como administrador, tienes acceso completo a todas las funciones."}
            {role === "contador" && " Como contador, puedes gestionar empresas y cuentas contables."}
            {role === "usuario" && " Como usuario, puedes ver información básica del sistema."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
