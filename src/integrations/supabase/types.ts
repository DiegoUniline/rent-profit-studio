export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      asiento_movimientos: {
        Row: {
          asiento_id: string
          created_at: string
          cuenta_id: string
          debe: number
          haber: number
          id: string
          orden: number
          partida: string
          presupuesto_id: string | null
        }
        Insert: {
          asiento_id: string
          created_at?: string
          cuenta_id: string
          debe?: number
          haber?: number
          id?: string
          orden?: number
          partida: string
          presupuesto_id?: string | null
        }
        Update: {
          asiento_id?: string
          created_at?: string
          cuenta_id?: string
          debe?: number
          haber?: number
          id?: string
          orden?: number
          partida?: string
          presupuesto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asiento_movimientos_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asientos_contables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_movimientos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asiento_movimientos_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      asientos_contables: {
        Row: {
          centro_negocio_id: string | null
          created_at: string
          created_by: string | null
          empresa_id: string
          estado: Database["public"]["Enums"]["estado_asiento"]
          fecha: string
          id: string
          numero_asiento: number
          observaciones: string | null
          tercero_id: string | null
          tipo: Database["public"]["Enums"]["tipo_asiento"]
          total_debe: number
          total_haber: number
          updated_at: string
        }
        Insert: {
          centro_negocio_id?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id: string
          estado?: Database["public"]["Enums"]["estado_asiento"]
          fecha?: string
          id?: string
          numero_asiento?: number
          observaciones?: string | null
          tercero_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_asiento"]
          total_debe?: number
          total_haber?: number
          updated_at?: string
        }
        Update: {
          centro_negocio_id?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          estado?: Database["public"]["Enums"]["estado_asiento"]
          fecha?: string
          id?: string
          numero_asiento?: number
          observaciones?: string | null
          tercero_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_asiento"]
          total_debe?: number
          total_haber?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asientos_contables_centro_negocio_id_fkey"
            columns: ["centro_negocio_id"]
            isOneToOne: false
            referencedRelation: "centros_negocio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asientos_contables_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asientos_contables_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      centros_negocio: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          responsable: string | null
          tipo_actividad: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          responsable?: string | null
          tipo_actividad?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          responsable?: string | null
          tipo_actividad?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "centros_negocio_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_contables: {
        Row: {
          activa: boolean
          clasificacion: Database["public"]["Enums"]["clasificacion_cuenta"]
          codigo: string
          created_at: string
          cuenta_padre_id: string | null
          empresa_id: string
          id: string
          naturaleza: Database["public"]["Enums"]["naturaleza_cuenta"]
          nivel: number
          nombre: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          clasificacion: Database["public"]["Enums"]["clasificacion_cuenta"]
          codigo: string
          created_at?: string
          cuenta_padre_id?: string | null
          empresa_id: string
          id?: string
          naturaleza: Database["public"]["Enums"]["naturaleza_cuenta"]
          nivel?: number
          nombre: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          clasificacion?: Database["public"]["Enums"]["clasificacion_cuenta"]
          codigo?: string
          created_at?: string
          cuenta_padre_id?: string | null
          empresa_id?: string
          id?: string
          naturaleza?: Database["public"]["Enums"]["naturaleza_cuenta"]
          nivel?: number
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_contables_cuenta_padre_id_fkey"
            columns: ["cuenta_padre_id"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_contables_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          activa: boolean
          banco: string | null
          calle: string | null
          ciudad: string | null
          clabe: string | null
          codigo_postal: string | null
          colonia: string | null
          created_at: string
          created_by: string | null
          email_fiscal: string | null
          estado: string | null
          id: string
          nombre_comercial: string | null
          numero_cuenta: string | null
          numero_exterior: string | null
          numero_interior: string | null
          pais: string | null
          razon_social: string
          regimen_fiscal: string | null
          representante_legal: string | null
          rfc: string
          telefono_principal: string | null
          tipo_persona: Database["public"]["Enums"]["tipo_persona"]
          updated_at: string
          uso_cfdi: string | null
        }
        Insert: {
          activa?: boolean
          banco?: string | null
          calle?: string | null
          ciudad?: string | null
          clabe?: string | null
          codigo_postal?: string | null
          colonia?: string | null
          created_at?: string
          created_by?: string | null
          email_fiscal?: string | null
          estado?: string | null
          id?: string
          nombre_comercial?: string | null
          numero_cuenta?: string | null
          numero_exterior?: string | null
          numero_interior?: string | null
          pais?: string | null
          razon_social: string
          regimen_fiscal?: string | null
          representante_legal?: string | null
          rfc: string
          telefono_principal?: string | null
          tipo_persona: Database["public"]["Enums"]["tipo_persona"]
          updated_at?: string
          uso_cfdi?: string | null
        }
        Update: {
          activa?: boolean
          banco?: string | null
          calle?: string | null
          ciudad?: string | null
          clabe?: string | null
          codigo_postal?: string | null
          colonia?: string | null
          created_at?: string
          created_by?: string | null
          email_fiscal?: string | null
          estado?: string | null
          id?: string
          nombre_comercial?: string | null
          numero_cuenta?: string | null
          numero_exterior?: string | null
          numero_interior?: string | null
          pais?: string | null
          razon_social?: string
          regimen_fiscal?: string | null
          representante_legal?: string | null
          rfc?: string
          telefono_principal?: string | null
          tipo_persona?: Database["public"]["Enums"]["tipo_persona"]
          updated_at?: string
          uso_cfdi?: string | null
        }
        Relationships: []
      }
      presupuestos: {
        Row: {
          activo: boolean
          cantidad: number
          centro_negocio_id: string | null
          created_at: string
          cuenta_id: string | null
          empresa_id: string
          fecha_fin: string | null
          fecha_inicio: string | null
          frecuencia:
            | Database["public"]["Enums"]["frecuencia_presupuesto"]
            | null
          id: string
          notas: string | null
          partida: string
          precio_unitario: number
          tercero_id: string | null
          unidad_medida_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          cantidad?: number
          centro_negocio_id?: string | null
          created_at?: string
          cuenta_id?: string | null
          empresa_id: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          frecuencia?:
            | Database["public"]["Enums"]["frecuencia_presupuesto"]
            | null
          id?: string
          notas?: string | null
          partida: string
          precio_unitario?: number
          tercero_id?: string | null
          unidad_medida_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          cantidad?: number
          centro_negocio_id?: string | null
          created_at?: string
          cuenta_id?: string | null
          empresa_id?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          frecuencia?:
            | Database["public"]["Enums"]["frecuencia_presupuesto"]
            | null
          id?: string
          notas?: string | null
          partida?: string
          precio_unitario?: number
          tercero_id?: string | null
          unidad_medida_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presupuestos_centro_negocio_id_fkey"
            columns: ["centro_negocio_id"]
            isOneToOne: false
            referencedRelation: "centros_negocio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_contables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_unidad_medida_id_fkey"
            columns: ["unidad_medida_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          nombre_completo: string
          nombre_usuario: string
          telefono: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          nombre_completo: string
          nombre_usuario: string
          telefono?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          nombre_completo?: string
          nombre_usuario?: string
          telefono?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      programaciones: {
        Row: {
          asiento_id: string | null
          centro_negocio_id: string | null
          created_at: string
          created_by: string | null
          empresa_id: string
          estado: Database["public"]["Enums"]["estado_programacion"]
          fecha_programada: string
          id: string
          monto: number
          observaciones: string | null
          tercero_id: string | null
          tipo: Database["public"]["Enums"]["tipo_programacion"]
          updated_at: string
        }
        Insert: {
          asiento_id?: string | null
          centro_negocio_id?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id: string
          estado?: Database["public"]["Enums"]["estado_programacion"]
          fecha_programada: string
          id?: string
          monto?: number
          observaciones?: string | null
          tercero_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_programacion"]
          updated_at?: string
        }
        Update: {
          asiento_id?: string | null
          centro_negocio_id?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          estado?: Database["public"]["Enums"]["estado_programacion"]
          fecha_programada?: string
          id?: string
          monto?: number
          observaciones?: string | null
          tercero_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_programacion"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programaciones_asiento_id_fkey"
            columns: ["asiento_id"]
            isOneToOne: false
            referencedRelation: "asientos_contables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programaciones_centro_negocio_id_fkey"
            columns: ["centro_negocio_id"]
            isOneToOne: false
            referencedRelation: "centros_negocio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programaciones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programaciones_tercero_id_fkey"
            columns: ["tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      terceros: {
        Row: {
          activo: boolean
          banco: string | null
          calle: string | null
          ciudad: string | null
          clabe: string | null
          codigo_postal: string | null
          colonia: string | null
          contacto_nombre: string | null
          created_at: string
          email: string | null
          empresa_id: string
          estado: string | null
          id: string
          nombre_comercial: string | null
          numero_cuenta: string | null
          numero_exterior: string | null
          numero_interior: string | null
          razon_social: string
          rfc: string
          telefono: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          banco?: string | null
          calle?: string | null
          ciudad?: string | null
          clabe?: string | null
          codigo_postal?: string | null
          colonia?: string | null
          contacto_nombre?: string | null
          created_at?: string
          email?: string | null
          empresa_id: string
          estado?: string | null
          id?: string
          nombre_comercial?: string | null
          numero_cuenta?: string | null
          numero_exterior?: string | null
          numero_interior?: string | null
          razon_social: string
          rfc: string
          telefono?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          banco?: string | null
          calle?: string | null
          ciudad?: string | null
          clabe?: string | null
          codigo_postal?: string | null
          colonia?: string | null
          contacto_nombre?: string | null
          created_at?: string
          email?: string | null
          empresa_id?: string
          estado?: string | null
          id?: string
          nombre_comercial?: string | null
          numero_cuenta?: string | null
          numero_exterior?: string | null
          numero_interior?: string | null
          razon_social?: string
          rfc?: string
          telefono?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terceros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades_medida: {
        Row: {
          activa: boolean
          codigo: string
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean
          codigo: string
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "contador" | "usuario"
      clasificacion_cuenta: "titulo" | "saldo"
      estado_asiento: "borrador" | "aplicado" | "cancelado"
      estado_programacion: "pendiente" | "ejecutado" | "cancelado"
      frecuencia_presupuesto:
        | "semanal"
        | "mensual"
        | "bimestral"
        | "trimestral"
        | "semestral"
        | "anual"
      naturaleza_cuenta: "deudora" | "acreedora"
      tipo_asiento: "ingreso" | "egreso" | "diario"
      tipo_persona: "fisica" | "moral"
      tipo_programacion: "ingreso" | "egreso"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "contador", "usuario"],
      clasificacion_cuenta: ["titulo", "saldo"],
      estado_asiento: ["borrador", "aplicado", "cancelado"],
      estado_programacion: ["pendiente", "ejecutado", "cancelado"],
      frecuencia_presupuesto: [
        "semanal",
        "mensual",
        "bimestral",
        "trimestral",
        "semestral",
        "anual",
      ],
      naturaleza_cuenta: ["deudora", "acreedora"],
      tipo_asiento: ["ingreso", "egreso", "diario"],
      tipo_persona: ["fisica", "moral"],
      tipo_programacion: ["ingreso", "egreso"],
    },
  },
} as const
