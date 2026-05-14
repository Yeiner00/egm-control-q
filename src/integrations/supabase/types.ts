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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      personas_reporte: {
        Row: {
          created_at: string
          id: string
          nombre: string
          reporte_id: string
          rol: string
          tipo_reporte: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          reporte_id: string
          rol: string
          tipo_reporte: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          reporte_id?: string
          rol?: string
          tipo_reporte?: string
        }
        Relationships: []
      }
      reporte_persona_roles: {
        Row: {
          created_at: string
          id: string
          reporte_persona_id: string
          rol: string
        }
        Insert: {
          created_at?: string
          id?: string
          reporte_persona_id: string
          rol: string
        }
        Update: {
          created_at?: string
          id?: string
          reporte_persona_id?: string
          rol?: string
        }
        Relationships: []
      }
      reporte_personas: {
        Row: {
          cedula: string | null
          created_at: string
          id: string
          nombre: string
          nombre_normalizado: string
          reporte_id: string
          tipo_reporte: string
        }
        Insert: {
          cedula?: string | null
          created_at?: string
          id?: string
          nombre: string
          nombre_normalizado: string
          reporte_id: string
          tipo_reporte: string
        }
        Update: {
          cedula?: string | null
          created_at?: string
          id?: string
          nombre?: string
          nombre_normalizado?: string
          reporte_id?: string
          tipo_reporte?: string
        }
        Relationships: []
      }
      reporte_motivos: {
        Row: {
          created_at: string
          id: string
          motivo: string
          motivo_key: string | null
          motivo_original: string | null
          reporte_id: string
          tipo_reporte: string
        }
        Insert: {
          created_at?: string
          id?: string
          motivo: string
          motivo_key?: string | null
          motivo_original?: string | null
          reporte_id: string
          tipo_reporte: string
        }
        Update: {
          created_at?: string
          id?: string
          motivo?: string
          motivo_key?: string | null
          motivo_original?: string | null
          reporte_id?: string
          tipo_reporte?: string
        }
        Relationships: []
      }
      reporte_sitios: {
        Row: {
          created_at: string
          id: string
          nombre_sitio: string
          posicion: string | null
          reporte_id: string
          zona: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nombre_sitio: string
          posicion?: string | null
          reporte_id: string
          zona?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nombre_sitio?: string
          posicion?: string | null
          reporte_id?: string
          zona?: string | null
        }
        Relationships: []
      }
      reporte_embarcaciones_inspeccionadas: {
        Row: {
          created_at: string
          id: string
          matricula: string | null
          no_inspeccion: string | null
          nombre: string
          posicion: string | null
          reporte_id: string
          zona: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          matricula?: string | null
          no_inspeccion?: string | null
          nombre: string
          posicion?: string | null
          reporte_id: string
          zona?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          matricula?: string | null
          no_inspeccion?: string | null
          nombre?: string
          posicion?: string | null
          reporte_id?: string
          zona?: string | null
        }
        Relationships: []
      }
      reportes_embarcacion: {
        Row: {
          anio: number
          bitacora: string | null
          cedula_juridica_combustible: string | null
          combustible_gastado: number | null
          combustible_trasegado_bodega: number | null
          combustible_trasegado_durante: number | null
          created_at: string
          destino: string | null
          embarcacion: string | null
          estacion: string | null
          estacion_combustible: string | null
          fecha: string | null
          folios: string | null
          hora_regreso: string | null
          hora_salida: string | null
          horas_hombre: number | null
          horas_motor_babor: number | null
          horas_motor_centro: number | null
          horas_motor_estribor: number | null
          horas_navegadas: number | null
          id: string
          lugar_combustible: string | null
          millas_nauticas: number | null
          no_cierre_os: string | null
          no_factura: string | null
          no_reporte: string
          novedades: string | null
          saldo_anterior: number | null
          saldo_despues: number | null
          tipo_combustible: string | null
          total_antes_viaje: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          anio: number
          bitacora?: string | null
          cedula_juridica_combustible?: string | null
          combustible_gastado?: number | null
          combustible_trasegado_bodega?: number | null
          combustible_trasegado_durante?: number | null
          created_at?: string
          destino?: string | null
          embarcacion?: string | null
          estacion?: string | null
          estacion_combustible?: string | null
          fecha?: string | null
          folios?: string | null
          hora_regreso?: string | null
          hora_salida?: string | null
          horas_hombre?: number | null
          horas_motor_babor?: number | null
          horas_motor_centro?: number | null
          horas_motor_estribor?: number | null
          horas_navegadas?: number | null
          id?: string
          lugar_combustible?: string | null
          millas_nauticas?: number | null
          no_cierre_os?: string | null
          no_factura?: string | null
          no_reporte: string
          novedades?: string | null
          saldo_anterior?: number | null
          saldo_despues?: number | null
          tipo_combustible?: string | null
          total_antes_viaje?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          anio?: number
          bitacora?: string | null
          cedula_juridica_combustible?: string | null
          combustible_gastado?: number | null
          combustible_trasegado_bodega?: number | null
          combustible_trasegado_durante?: number | null
          created_at?: string
          destino?: string | null
          embarcacion?: string | null
          estacion?: string | null
          estacion_combustible?: string | null
          fecha?: string | null
          folios?: string | null
          hora_regreso?: string | null
          hora_salida?: string | null
          horas_hombre?: number | null
          horas_motor_babor?: number | null
          horas_motor_centro?: number | null
          horas_motor_estribor?: number | null
          horas_navegadas?: number | null
          id?: string
          lugar_combustible?: string | null
          millas_nauticas?: number | null
          no_cierre_os?: string | null
          no_factura?: string | null
          no_reporte?: string
          novedades?: string | null
          saldo_anterior?: number | null
          saldo_despues?: number | null
          tipo_combustible?: string | null
          total_antes_viaje?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      reportes_vehiculo: {
        Row: {
          anio: number
          bitacora: string | null
          cedula_juridica_combustible: string | null
          combustible_gastado: number | null
          combustible_trasegado_bomba: number | null
          created_at: string
          destino: string | null
          estacion: string | null
          estacion_combustible: string | null
          fecha: string | null
          hora_regreso: string | null
          hora_salida: string | null
          id: string
          kilometros_recorridos: number | null
          lugar_combustible: string | null
          no_factura: string | null
          no_reporte: string
          novedades: string | null
          saldo_combustible_despues_viaje: number | null
          total_horas: number | null
          total_combustible_antes_viaje: number | null
          updated_at: string
          user_id: string | null
          vehiculo: string | null
        }
        Insert: {
          anio: number
          bitacora?: string | null
          cedula_juridica_combustible?: string | null
          combustible_gastado?: number | null
          combustible_trasegado_bomba?: number | null
          created_at?: string
          destino?: string | null
          estacion?: string | null
          estacion_combustible?: string | null
          fecha?: string | null
          hora_regreso?: string | null
          hora_salida?: string | null
          id?: string
          kilometros_recorridos?: number | null
          lugar_combustible?: string | null
          no_factura?: string | null
          no_reporte: string
          novedades?: string | null
          saldo_combustible_despues_viaje?: number | null
          total_horas?: number | null
          total_combustible_antes_viaje?: number | null
          updated_at?: string
          user_id?: string | null
          vehiculo?: string | null
        }
        Update: {
          anio?: number
          bitacora?: string | null
          cedula_juridica_combustible?: string | null
          combustible_gastado?: number | null
          combustible_trasegado_bomba?: number | null
          created_at?: string
          destino?: string | null
          estacion?: string | null
          estacion_combustible?: string | null
          fecha?: string | null
          hora_regreso?: string | null
          hora_salida?: string | null
          id?: string
          kilometros_recorridos?: number | null
          lugar_combustible?: string | null
          no_factura?: string | null
          no_reporte?: string
          novedades?: string | null
          saldo_combustible_despues_viaje?: number | null
          total_horas?: number | null
          total_combustible_antes_viaje?: number | null
          updated_at?: string
          user_id?: string | null
          vehiculo?: string | null
        }
        Relationships: []
      }
      zarpes_semana: {
        Row: {
          cedula_capitan: string | null
          created_at: string
          destino: string | null
          fecha_regreso: string | null
          fecha_viaje: string | null
          hora_ingreso: string | null
          hora_salida: string | null
          id: string
          matricula: string | null
          nombre_capitan: string | null
          nombre_embarcacion: string | null
          num_tripulantes: number | null
          registrado_por: string | null
          updated_at: string
          zarpe_folio: string | null
        }
        Insert: {
          cedula_capitan?: string | null
          created_at?: string
          destino?: string | null
          fecha_regreso?: string | null
          fecha_viaje?: string | null
          hora_ingreso?: string | null
          hora_salida?: string | null
          id?: string
          matricula?: string | null
          nombre_capitan?: string | null
          nombre_embarcacion?: string | null
          num_tripulantes?: number | null
          registrado_por?: string | null
          updated_at?: string
          zarpe_folio?: string | null
        }
        Update: {
          cedula_capitan?: string | null
          created_at?: string
          destino?: string | null
          fecha_regreso?: string | null
          fecha_viaje?: string | null
          hora_ingreso?: string | null
          hora_salida?: string | null
          id?: string
          matricula?: string | null
          nombre_capitan?: string | null
          nombre_embarcacion?: string | null
          num_tripulantes?: number | null
          registrado_por?: string | null
          updated_at?: string
          zarpe_folio?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
