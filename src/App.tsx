import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Usuarios from "./pages/Usuarios";
import Empresas from "./pages/Empresas";
import Cuentas from "./pages/Cuentas";
import CuentaDetalle from "./pages/CuentaDetalle";
import Perfil from "./pages/Perfil";
import CentrosNegocio from "./pages/CentrosNegocio";
import Terceros from "./pages/Terceros";
import Presupuestos from "./pages/Presupuestos";
import EjercidoDetalle from "./pages/EjercidoDetalle";
import Asientos from "./pages/Asientos";
import AsientoDetalle from "./pages/AsientoDetalle";
import Programacion from "./pages/Programacion";
import Reportes from "./pages/Reportes";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/auth"
        element={
          <PublicRoute>
            <Auth />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/usuarios"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Usuarios />
          </ProtectedRoute>
        }
      />
      <Route
        path="/empresas"
        element={
          <ProtectedRoute allowedRoles={["admin", "contador"]}>
            <Empresas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cuentas"
        element={
          <ProtectedRoute allowedRoles={["admin", "contador"]}>
            <Cuentas />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cuentas/:id"
        element={
          <ProtectedRoute allowedRoles={["admin", "contador"]}>
            <CuentaDetalle />
          </ProtectedRoute>
        }
      />
      <Route
        path="/perfil"
        element={
          <ProtectedRoute>
            <Perfil />
          </ProtectedRoute>
        }
      />
      <Route
        path="/centros-negocio"
        element={
          <ProtectedRoute allowedRoles={["admin", "contador"]}>
            <CentrosNegocio />
          </ProtectedRoute>
        }
      />
      <Route
        path="/terceros"
        element={
          <ProtectedRoute allowedRoles={["admin", "contador"]}>
            <Terceros />
          </ProtectedRoute>
        }
      />
      <Route
        path="/presupuestos"
        element={
          <ProtectedRoute allowedRoles={["admin", "contador"]}>
            <Presupuestos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/presupuestos/:id/ejercido"
        element={
          <ProtectedRoute allowedRoles={["admin", "contador"]}>
            <EjercidoDetalle />
          </ProtectedRoute>
        }
      />
      <Route
        path="/asientos"
        element={
          <ProtectedRoute allowedRoles={["admin", "contador"]}>
            <Asientos />
          </ProtectedRoute>
        }
      />
      <Route
        path="/asientos/:id"
        element={
          <ProtectedRoute allowedRoles={["admin", "contador"]}>
            <AsientoDetalle />
          </ProtectedRoute>
        }
      />
      <Route
        path="/programacion"
        element={
          <ProtectedRoute allowedRoles={["admin", "contador"]}>
            <Programacion />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reportes"
        element={
          <ProtectedRoute allowedRoles={["admin", "contador"]}>
            <Reportes />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
