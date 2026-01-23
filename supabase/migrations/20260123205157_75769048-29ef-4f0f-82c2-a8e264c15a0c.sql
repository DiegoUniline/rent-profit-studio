-- Enum para roles de usuario
CREATE TYPE public.app_role AS ENUM ('admin', 'contador', 'usuario');

-- Enum para tipo de persona
CREATE TYPE public.tipo_persona AS ENUM ('fisica', 'moral');

-- Enum para naturaleza de cuenta
CREATE TYPE public.naturaleza_cuenta AS ENUM ('deudora', 'acreedora');

-- Enum para clasificación de cuenta
CREATE TYPE public.clasificacion_cuenta AS ENUM ('titulo', 'saldo');

-- Tabla de perfiles de usuario
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nombre_completo TEXT NOT NULL,
  nombre_usuario TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  telefono TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla de roles de usuario (separada para seguridad)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'usuario',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Tabla de empresas con datos fiscales completos
CREATE TABLE public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_persona tipo_persona NOT NULL,
  rfc TEXT NOT NULL UNIQUE,
  razon_social TEXT NOT NULL,
  nombre_comercial TEXT,
  regimen_fiscal TEXT,
  uso_cfdi TEXT,
  -- Dirección fiscal
  calle TEXT,
  numero_exterior TEXT,
  numero_interior TEXT,
  colonia TEXT,
  codigo_postal TEXT,
  ciudad TEXT,
  estado TEXT,
  pais TEXT DEFAULT 'México',
  -- Contacto
  telefono_principal TEXT,
  email_fiscal TEXT,
  representante_legal TEXT,
  -- Datos bancarios
  banco TEXT,
  numero_cuenta TEXT,
  clabe TEXT,
  -- Metadatos
  activa BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabla de cuentas contables
CREATE TABLE public.cuentas_contables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  naturaleza naturaleza_cuenta NOT NULL,
  clasificacion clasificacion_cuenta NOT NULL,
  cuenta_padre_id UUID REFERENCES public.cuentas_contables(id),
  nivel INTEGER NOT NULL DEFAULT 1,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);

-- Función para verificar roles (security definer para evitar recursión)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Función para obtener el rol del usuario
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers para updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_empresas_updated_at
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cuentas_updated_at
  BEFORE UPDATE ON public.cuentas_contables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Función para crear perfil automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nombre_completo, nombre_usuario)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'nombre_usuario', split_part(NEW.email, '@', 1))
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'usuario');
  
  RETURN NEW;
END;
$$;

-- Trigger para nuevo usuario
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_contables ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Políticas RLS para user_roles
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Políticas RLS para empresas
CREATE POLICY "Authenticated users can view empresas"
  ON public.empresas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and contadores can insert empresas"
  ON public.empresas FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'contador')
  );

CREATE POLICY "Admins and contadores can update empresas"
  ON public.empresas FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'contador')
  );

CREATE POLICY "Admins can delete empresas"
  ON public.empresas FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Políticas RLS para cuentas_contables
CREATE POLICY "Authenticated users can view cuentas"
  ON public.cuentas_contables FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and contadores can insert cuentas"
  ON public.cuentas_contables FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'contador')
  );

CREATE POLICY "Admins and contadores can update cuentas"
  ON public.cuentas_contables FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'contador')
  );

CREATE POLICY "Admins can delete cuentas"
  ON public.cuentas_contables FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));