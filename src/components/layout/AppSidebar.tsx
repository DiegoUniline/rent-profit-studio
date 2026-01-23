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
  Building2,
  LayoutDashboard,
  Users,
  Building,
  BookOpen,
  User,
  LogOut,
  Briefcase,
  Users2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const menuItems = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/", roles: ["admin", "contador", "usuario"] },
  { title: "Empresas", icon: Building, href: "/empresas", roles: ["admin", "contador"] },
  { title: "Centro de Negocios", icon: Briefcase, href: "/centros-negocio", roles: ["admin", "contador"] },
  { title: "Terceros", icon: Users2, href: "/terceros", roles: ["admin", "contador"] },
  { title: "Cuentas", icon: BookOpen, href: "/cuentas", roles: ["admin", "contador"] },
  { title: "Usuarios", icon: Users, href: "/usuarios", roles: ["admin"] },
  { title: "Mi Perfil", icon: User, href: "/perfil", roles: ["admin", "contador", "usuario"] },
];

export function AppSidebar() {
  const location = useLocation();
  const { role, signOut } = useAuth();

  const filteredMenu = menuItems.filter(
    (item) => role && item.roles.includes(role)
  );

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-sidebar-foreground">MaqRentable</h1>
            <p className="text-xs text-muted-foreground">Sistema Contable</p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenu.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.href}
                  >
                    <Link to={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar Sesión
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
