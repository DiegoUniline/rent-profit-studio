import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Monitor,
  LayoutDashboard,
  Users,
  Building,
  BookOpen,
  User,
  LogOut,
  Briefcase,
  Users2,
  Calculator,
  FileSpreadsheet,
  Calendar,
  BarChart3,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Menu grouped logically
const menuGroups = [
  {
    label: "Principal",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, href: "/", roles: ["admin", "contador", "usuario"] },
    ],
  },
  {
    label: "Catálogos",
    items: [
      { title: "Empresas", icon: Building, href: "/empresas", roles: ["admin", "contador"] },
      { title: "Centros de Negocio", icon: Briefcase, href: "/centros-negocio", roles: ["admin", "contador"] },
      { title: "Terceros", icon: Users2, href: "/terceros", roles: ["admin", "contador"] },
      { title: "Cuentas Contables", icon: BookOpen, href: "/cuentas", roles: ["admin", "contador"] },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { title: "Presupuestos", icon: Calculator, href: "/presupuestos", roles: ["admin", "contador"] },
      { title: "Asientos Contables", icon: FileSpreadsheet, href: "/asientos", roles: ["admin", "contador"] },
      { title: "Programación", icon: Calendar, href: "/programacion", roles: ["admin", "contador"] },
    ],
  },
  {
    label: "Análisis",
    items: [
      { title: "Reportes", icon: BarChart3, href: "/reportes", roles: ["admin", "contador"] },
    ],
  },
  {
    label: "Configuración",
    items: [
      { title: "Usuarios", icon: Users, href: "/usuarios", roles: ["admin"] },
      { title: "Mi Perfil", icon: User, href: "/perfil", roles: ["admin", "contador", "usuario"] },
    ],
  },
];

export function AppSidebar() {
  const location = useLocation();
  const { role, signOut } = useAuth();

  // Filter groups and items based on role
  const filteredGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => role && item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Monitor className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-base font-bold text-sidebar-foreground leading-tight">Uniline</h1>
            <p className="text-[10px] text-muted-foreground leading-tight">Sistema Contable</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {filteredGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium px-2">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={location.pathname === item.href}
                      className="h-9"
                    >
                      <Link to={item.href} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground h-9"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span className="text-sm">Cerrar Sesión</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
