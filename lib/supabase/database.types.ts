export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string
          name: string
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          display_order: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          id: string
          report_name: string
          report_date: string
          file_url: string | null
          status: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          report_name: string
          report_date: string
          file_url?: string | null
          status?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          report_name?: string
          report_date?: string
          file_url?: string | null
          status?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_files: {
        Row: {
          id: string
          report_id: string
          file_name: string
          file_size: number
          uploaded_at: string
        }
        Insert: {
          id?: string
          report_id: string
          file_name: string
          file_size: number
          uploaded_at?: string
        }
        Update: {
          id?: string
          report_id?: string
          file_name?: string
          file_size?: number
          uploaded_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          full_name: string | null
          role: "admin" | "user"
          is_active: boolean
          created_at: string
          updated_at: string
          invited_by: string | null
        }
        Insert: {
          id: string
          full_name?: string | null
          role?: "admin" | "user"
          is_active?: boolean
          created_at?: string
          updated_at?: string
          invited_by?: string | null
        }
        Update: {
          id?: string
          full_name?: string | null
          role?: "admin" | "user"
          is_active?: boolean
          created_at?: string
          updated_at?: string
          invited_by?: string | null
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
