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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agency_interactions: {
        Row: {
          agency_id: string
          c_level_support_needed: boolean | null
          contract_stock: number | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          current_offer: string | null
          feedback: string | null
          id: string
          interaction_date: string
          interaction_type: string | null
          next_steps: string | null
          source: Database["public"]["Enums"]["update_source"]
          status_after: Database["public"]["Enums"]["negotiation_status"] | null
          status_before:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
        }
        Insert: {
          agency_id: string
          c_level_support_needed?: boolean | null
          contract_stock?: number | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          current_offer?: string | null
          feedback?: string | null
          id?: string
          interaction_date?: string
          interaction_type?: string | null
          next_steps?: string | null
          source?: Database["public"]["Enums"]["update_source"]
          status_after?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          status_before?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
        }
        Update: {
          agency_id?: string
          c_level_support_needed?: boolean | null
          contract_stock?: number | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          current_offer?: string | null
          feedback?: string | null
          id?: string
          interaction_date?: string
          interaction_type?: string | null
          next_steps?: string | null
          source?: Database["public"]["Enums"]["update_source"]
          status_after?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
          status_before?:
            | Database["public"]["Enums"]["negotiation_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_interactions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_sessions: {
        Row: {
          agency_id: string | null
          consultant_id: string | null
          created_at: string
          current_flow: string | null
          current_step: string
          expires_at: string
          id: string
          last_message_at: string
          phone: string
          session_data: Json
          status: Database["public"]["Enums"]["bot_session_status"]
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          consultant_id?: string | null
          created_at?: string
          current_flow?: string | null
          current_step?: string
          expires_at?: string
          id?: string
          last_message_at?: string
          phone: string
          session_data?: Json
          status?: Database["public"]["Enums"]["bot_session_status"]
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          consultant_id?: string | null
          created_at?: string
          current_flow?: string | null
          current_step?: string
          expires_at?: string
          id?: string
          last_message_at?: string
          phone?: string
          session_data?: Json
          status?: Database["public"]["Enums"]["bot_session_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_sessions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "real_estate_agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_sessions_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      consultants: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          regional: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          regional?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          regional?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      hubspot_mappings: {
        Row: {
          agency_id: string
          created_at: string
          hubspot_company_id: string | null
          hubspot_contact_id: string | null
          id: string
          last_synced_at: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          hubspot_company_id?: string | null
          hubspot_contact_id?: string | null
          id?: string
          last_synced_at?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          hubspot_company_id?: string | null
          hubspot_contact_id?: string | null
          id?: string
          last_synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_mappings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "real_estate_agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      real_estate_agencies: {
        Row: {
          c_level_support_needed: boolean
          city: string
          consultant_id: string | null
          contact_role: string | null
          contract_stock: number
          created_at: string
          created_by: string | null
          current_guarantor: string | null
          current_offer: string | null
          feedback: string | null
          guarantor_type: Database["public"]["Enums"]["guarantor_type"] | null
          id: string
          last_interaction_date: string | null
          main_contact: string | null
          name: string
          negotiation_status: Database["public"]["Enums"]["negotiation_status"]
          next_steps: string | null
          regional_director: string | null
          state: string
          total_interactions: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          c_level_support_needed?: boolean
          city: string
          consultant_id?: string | null
          contact_role?: string | null
          contract_stock?: number
          created_at?: string
          created_by?: string | null
          current_guarantor?: string | null
          current_offer?: string | null
          feedback?: string | null
          guarantor_type?: Database["public"]["Enums"]["guarantor_type"] | null
          id?: string
          last_interaction_date?: string | null
          main_contact?: string | null
          name: string
          negotiation_status?: Database["public"]["Enums"]["negotiation_status"]
          next_steps?: string | null
          regional_director?: string | null
          state: string
          total_interactions?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          c_level_support_needed?: boolean
          city?: string
          consultant_id?: string | null
          contact_role?: string | null
          contract_stock?: number
          created_at?: string
          created_by?: string | null
          current_guarantor?: string | null
          current_offer?: string | null
          feedback?: string | null
          guarantor_type?: Database["public"]["Enums"]["guarantor_type"] | null
          id?: string
          last_interaction_date?: string | null
          main_contact?: string | null
          name?: string
          negotiation_status?: Database["public"]["Enums"]["negotiation_status"]
          next_steps?: string | null
          regional_director?: string | null
          state?: string
          total_interactions?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "real_estate_agencies_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
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
          role: Database["public"]["Enums"]["app_role"]
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
      whatsapp_messages: {
        Row: {
          agency_id: string | null
          consultant_id: string | null
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          error_message: string | null
          flow: string | null
          id: string
          message_body: string | null
          parsed_intent: string | null
          phone: string
          raw_payload: Json | null
          status: string
        }
        Insert: {
          agency_id?: string | null
          consultant_id?: string | null
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          flow?: string | null
          id?: string
          message_body?: string | null
          parsed_intent?: string | null
          phone: string
          raw_payload?: Json | null
          status?: string
        }
        Update: {
          agency_id?: string | null
          consultant_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          error_message?: string | null
          flow?: string | null
          id?: string
          message_body?: string | null
          parsed_intent?: string | null
          phone?: string
          raw_payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      expire_stale_bot_sessions: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "consultant"
      bot_session_status: "active" | "completed" | "abandoned"
      guarantor_type:
        | "Garantia Propria"
        | "Concorrente"
        | "Seguradora"
        | "Outro"
      message_direction: "inbound" | "outbound"
      negotiation_status:
        | "Pipeline de Prospecção"
        | "Conversas iniciadas"
        | "Reunião agendada"
        | "Aguardando base"
        | "Stand by"
        | "Sem interesse"
        | "Proposta enviada"
        | "Em negociação"
        | "Convertida"
      update_source: "web" | "whatsapp" | "import"
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
      app_role: ["admin", "manager", "consultant"],
      bot_session_status: ["active", "completed", "abandoned"],
      guarantor_type: [
        "Garantia Propria",
        "Concorrente",
        "Seguradora",
        "Outro",
      ],
      message_direction: ["inbound", "outbound"],
      negotiation_status: [
        "Pipeline de Prospecção",
        "Conversas iniciadas",
        "Reunião agendada",
        "Aguardando base",
        "Stand by",
        "Sem interesse",
        "Proposta enviada",
        "Em negociação",
        "Convertida",
      ],
      update_source: ["web", "whatsapp", "import"],
    },
  },
} as const
