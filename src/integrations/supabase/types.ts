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
      flujos_programados: {
        Row: {
          asiento_movimiento_id: string | null
          auto_generado: boolean
          created_at: string
          descripcion: string | null
          empresa_id: string | null
          fecha: string
          id: string
          monto: number
          presupuesto_id: string | null
          tipo: string
        }
        Insert: {
          asiento_movimiento_id?: string | null
          auto_generado?: boolean
          created_at?: string
          descripcion?: string | null
          empresa_id?: string | null
          fecha: string
          id?: string
          monto?: number
          presupuesto_id?: string | null
          tipo: string
        }
        Update: {
          asiento_movimiento_id?: string | null
          auto_generado?: boolean
          created_at?: string
          descripcion?: string | null
          empresa_id?: string | null
          fecha?: string
          id?: string
          monto?: number
          presupuesto_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "flujos_programados_asiento_movimiento_id_fkey"
            columns: ["asiento_movimiento_id"]
            isOneToOne: false
            referencedRelation: "asiento_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flujos_programados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flujos_programados_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuestos: {
        Row: {
          activo: boolean
          avance_manual: number | null
          cantidad: number
          centro_negocio_id: string | null
          created_at: string
          cuenta_id: string | null
          empresa_id: string
          es_project: boolean
          fecha_fin: string | null
          fecha_inicio: string | null
          frecuencia:
            | Database["public"]["Enums"]["frecuencia_presupuesto"]
            | null
          id: string
          notas: string | null
          orden: number | null
          partida: string
          precio_unitario: number
          responsable_tercero_id: string | null
          tercero_id: string | null
          unidad_medida_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          avance_manual?: number | null
          cantidad?: number
          centro_negocio_id?: string | null
          created_at?: string
          cuenta_id?: string | null
          empresa_id: string
          es_project?: boolean
          fecha_fin?: string | null
          fecha_inicio?: string | null
          frecuencia?:
            | Database["public"]["Enums"]["frecuencia_presupuesto"]
            | null
          id?: string
          notas?: string | null
          orden?: number | null
          partida: string
          precio_unitario?: number
          responsable_tercero_id?: string | null
          tercero_id?: string | null
          unidad_medida_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          avance_manual?: number | null
          cantidad?: number
          centro_negocio_id?: string | null
          created_at?: string
          cuenta_id?: string | null
          empresa_id?: string
          es_project?: boolean
          fecha_fin?: string | null
          fecha_inicio?: string | null
          frecuencia?:
            | Database["public"]["Enums"]["frecuencia_presupuesto"]
            | null
          id?: string
          notas?: string | null
          orden?: number | null
          partida?: string
          precio_unitario?: number
          responsable_tercero_id?: string | null
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
            foreignKeyName: "presupuestos_responsable_tercero_id_fkey"
            columns: ["responsable_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
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
          codigo_acceso: string | null
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
          codigo_acceso?: string | null
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
          codigo_acceso?: string | null
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
          presupuesto_id: string | null
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
          presupuesto_id?: string | null
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
          presupuesto_id?: string | null
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
            foreignKeyName: "programaciones_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
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
      proyecto_auditoria: {
        Row: {
          accion: string
          created_at: string
          entidad_id: string | null
          id: string
          proyecto_id: string
          user_id: string
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          accion: string
          created_at?: string
          entidad_id?: string | null
          id?: string
          proyecto_id: string
          user_id: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          accion?: string
          created_at?: string
          entidad_id?: string | null
          id?: string
          proyecto_id?: string
          user_id?: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_auditoria_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_cronograma_shares: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          id: string
          proyecto_id: string
          token: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          proyecto_id: string
          token: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          proyecto_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_cronograma_shares_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_programacion_financiera: {
        Row: {
          anticipo_fecha: string | null
          anticipo_monto: number
          created_at: string
          created_by: string | null
          empresa_id: string
          fecha_inicio: string | null
          frecuencia:
            | Database["public"]["Enums"]["programacion_proyecto_frecuencia"]
            | null
          id: string
          modo: Database["public"]["Enums"]["programacion_proyecto_modo"]
          numero_pagos: number | null
          presupuesto_id: string | null
          proyecto_id: string
          tiene_anticipo: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          anticipo_fecha?: string | null
          anticipo_monto?: number
          created_at?: string
          created_by?: string | null
          empresa_id: string
          fecha_inicio?: string | null
          frecuencia?:
            | Database["public"]["Enums"]["programacion_proyecto_frecuencia"]
            | null
          id?: string
          modo: Database["public"]["Enums"]["programacion_proyecto_modo"]
          numero_pagos?: number | null
          presupuesto_id?: string | null
          proyecto_id: string
          tiene_anticipo?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          anticipo_fecha?: string | null
          anticipo_monto?: number
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          fecha_inicio?: string | null
          frecuencia?:
            | Database["public"]["Enums"]["programacion_proyecto_frecuencia"]
            | null
          id?: string
          modo?: Database["public"]["Enums"]["programacion_proyecto_modo"]
          numero_pagos?: number | null
          presupuesto_id?: string | null
          proyecto_id?: string
          tiene_anticipo?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_programacion_financiera_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_programacion_financiera_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: true
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_programacion_financiera_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_programacion_pagos: {
        Row: {
          concepto: string | null
          created_at: string
          es_anticipo: boolean
          fecha: string
          id: string
          monto: number
          orden: number
          programacion_id: string
          proyecto_id: string
        }
        Insert: {
          concepto?: string | null
          created_at?: string
          es_anticipo?: boolean
          fecha: string
          id?: string
          monto: number
          orden?: number
          programacion_id: string
          proyecto_id: string
        }
        Update: {
          concepto?: string | null
          created_at?: string
          es_anticipo?: boolean
          fecha?: string
          id?: string
          monto?: number
          orden?: number
          programacion_id?: string
          proyecto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_programacion_pagos_programacion_id_fkey"
            columns: ["programacion_id"]
            isOneToOne: false
            referencedRelation: "proyecto_programacion_financiera"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_programacion_pagos_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_tareas: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          empresa_id: string
          estado: Database["public"]["Enums"]["tarea_estado"]
          fecha_vencimiento: string | null
          id: string
          notas: string | null
          orden: number
          proyecto_id: string
          responsable_tercero_id: string | null
          titulo: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id: string
          estado?: Database["public"]["Enums"]["tarea_estado"]
          fecha_vencimiento?: string | null
          id?: string
          notas?: string | null
          orden?: number
          proyecto_id: string
          responsable_tercero_id?: string | null
          titulo: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          estado?: Database["public"]["Enums"]["tarea_estado"]
          fecha_vencimiento?: string | null
          id?: string
          notas?: string | null
          orden?: number
          proyecto_id?: string
          responsable_tercero_id?: string | null
          titulo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_tareas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_tareas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_tareas_responsable_tercero_id_fkey"
            columns: ["responsable_tercero_id"]
            isOneToOne: false
            referencedRelation: "terceros"
            referencedColumns: ["id"]
          },
        ]
      }
      proyecto_usuarios: {
        Row: {
          created_at: string
          created_by: string | null
          editar_cronograma: boolean
          editar_programacion_financiera: boolean
          empresa_id: string
          id: string
          proyecto_id: string
          user_id: string
          ver_programacion_financiera: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          editar_cronograma?: boolean
          editar_programacion_financiera?: boolean
          empresa_id: string
          id?: string
          proyecto_id: string
          user_id: string
          ver_programacion_financiera?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          editar_cronograma?: boolean
          editar_programacion_financiera?: boolean
          empresa_id?: string
          id?: string
          proyecto_id?: string
          user_id?: string
          ver_programacion_financiera?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "proyecto_usuarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyecto_usuarios_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyectos: {
        Row: {
          activo: boolean
          centro_negocio_id: string
          created_at: string
          created_by: string | null
          empresa_id: string
          id: string
          nombre: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activo?: boolean
          centro_negocio_id: string
          created_at?: string
          created_by?: string | null
          empresa_id: string
          id?: string
          nombre: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activo?: boolean
          centro_negocio_id?: string
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proyectos_centro_negocio_id_fkey"
            columns: ["centro_negocio_id"]
            isOneToOne: true
            referencedRelation: "centros_negocio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      rafa_sesiones: {
        Row: {
          created_at: string
          estado: string
          id: string
          plan: Json | null
          propuesta: Json | null
          resumen: string | null
          titulo: string
          transcripcion: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          estado?: string
          id?: string
          plan?: Json | null
          propuesta?: Json | null
          resumen?: string | null
          titulo?: string
          transcripcion?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          estado?: string
          id?: string
          plan?: Json | null
          propuesta?: Json | null
          resumen?: string | null
          titulo?: string
          transcripcion?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      actualizar_cronograma_partida: {
        Args: {
          _avance_manual: number
          _fecha_fin: string
          _fecha_inicio: string
          _presupuesto_id: string
        }
        Returns: undefined
      }
      get_cronograma_publico: {
        Args: { _token: string }
        Returns: {
          avance: number
          cuenta_codigo: string
          cuenta_nombre: string
          fecha_fin: string
          fecha_inicio: string
          partida: string
          proyecto_nombre: string
          vencida: boolean
        }[]
      }
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
      app_role: "admin" | "contador" | "usuario" | "arquitecto"
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
      programacion_proyecto_frecuencia:
        | "semanal"
        | "mensual"
        | "trimestral"
        | "semestral"
        | "anual"
        | "quincenal"
        | "personalizada"
      programacion_proyecto_modo: "automatica" | "manual"
      tarea_estado: "pendiente" | "en_progreso" | "bloqueada" | "hecho"
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
      app_role: ["admin", "contador", "usuario", "arquitecto"],
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
      programacion_proyecto_frecuencia: [
        "semanal",
        "mensual",
        "trimestral",
        "semestral",
        "anual",
        "quincenal",
        "personalizada",
      ],
      programacion_proyecto_modo: ["automatica", "manual"],
      tarea_estado: ["pendiente", "en_progreso", "bloqueada", "hecho"],
      tipo_asiento: ["ingreso", "egreso", "diario"],
      tipo_persona: ["fisica", "moral"],
      tipo_programacion: ["ingreso", "egreso"],
    },
  },
} as const
