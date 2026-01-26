import { useMemo } from "react";
import { format, addMonths, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { parseLocalDate } from "@/lib/date-utils";
import { es } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Programacion {
  id: string;
  tipo: "ingreso" | "egreso";
  fecha_programada: string;
  monto: number;
  estado: string;
}

interface ProyeccionProgramacionProps {
  programaciones: Programacion[];
}

export function ProyeccionProgramacion({ programaciones }: ProyeccionProgramacionProps) {
  const chartData = useMemo(() => {
    const today = new Date();
    const months: { mes: string; start: Date; end: Date }[] = [];
    
    // Generate 12 months starting from current month
    for (let i = 0; i < 12; i++) {
      const monthDate = addMonths(today, i);
      months.push({
        mes: format(monthDate, "MMM yy", { locale: es }),
        start: startOfMonth(monthDate),
        end: endOfMonth(monthDate),
      });
    }

    let balanceAcumulado = 0;
    
    return months.map(({ mes, start, end }) => {
      const monthProgramaciones = programaciones.filter((p) => {
        if (p.estado === "cancelado") return false;
        const fecha = parseLocalDate(p.fecha_programada);
        return isWithinInterval(fecha, { start, end });
      });

      const ingresos = monthProgramaciones
        .filter((p) => p.tipo === "ingreso")
        .reduce((sum, p) => sum + Number(p.monto), 0);

      const egresos = monthProgramaciones
        .filter((p) => p.tipo === "egreso")
        .reduce((sum, p) => sum + Number(p.monto), 0);

      balanceAcumulado += ingresos - egresos;

      return {
        mes,
        ingresos,
        egresos,
        balance: balanceAcumulado,
      };
    });
  }, [programaciones]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background p-3 shadow-lg">
          <p className="font-medium mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Proyección Financiera (12 meses)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="mes" 
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <YAxis 
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar 
                dataKey="ingresos" 
                name="Ingresos" 
                fill="hsl(var(--chart-2))" 
                radius={[4, 4, 0, 0]}
              />
              <Bar 
                dataKey="egresos" 
                name="Egresos" 
                fill="hsl(var(--chart-1))" 
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="balance"
                name="Balance Acumulado"
                stroke="hsl(var(--chart-3))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--chart-3))", strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
