/** Database types mirroring supabase/migrations/0001_initial_schema.sql 1:1. */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ─── Domain enums ─────────────────────────────────────────────────────────────

export type DeviceGroup = 'BAG' | 'OFFSET' | 'AVAMAR';

export const DEVICE_GROUPS: readonly DeviceGroup[] = ['BAG', 'OFFSET', 'AVAMAR'];

/** Runtime check that a string is one of the three valid device groups. */
export function isValidGroup(g: string): g is DeviceGroup {
  return (DEVICE_GROUPS as readonly string[]).includes(g);
}
export type ReportStatus = 'parsed' | 'failed';
export type CapacityTier = 'active' | 'cloud';
export type CompressionPeriod = 'currently_used' | 'last_7_days' | 'last_24_hrs';
export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO' | 'NOTICE';
export type InterfaceState = 'running' | 'down' | 'fault';
export type NotificationType =
  | 'report_received'
  | 'report_missing'
  | 'critical_finding'
  | 'new_device';
export type NotificationSeverity = 'info' | 'warning' | 'critical';
export type AlertRuleOperator = '>' | '>=' | '<' | '<=' | '=';
export type AlertRuleSeverity = 'warning' | 'critical';
export type IngestOutcome =
  | 'ingested'
  | 'skipped_duplicate'
  | 'parse_failed'
  | 'auth_failed';
export type UserRole = 'admin' | 'viewer';

// ─── Database interface ───────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          full_name: string | null;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          full_name?: string | null;
          role: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          full_name?: string | null;
          role?: UserRole;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };

      devices: {
        Row: {
          id: string;
          hostname: string;
          display_name: string | null;
          device_group: DeviceGroup | null;
          location: string | null;
          model_no: string | null;
          serial_no: string | null;
          chassis_serial: string | null;
          os_version: string | null;
          time_zone: string | null;
          admin_email: string | null;
          is_active: boolean;
          first_seen_at: string;
          last_report_at: string | null;
        };
        Insert: {
          id?: string;
          hostname: string;
          display_name?: string | null;
          device_group?: DeviceGroup | null;
          location?: string | null;
          model_no?: string | null;
          serial_no?: string | null;
          chassis_serial?: string | null;
          os_version?: string | null;
          time_zone?: string | null;
          admin_email?: string | null;
          is_active?: boolean;
          first_seen_at?: string;
          last_report_at?: string | null;
        };
        Update: {
          id?: string;
          hostname?: string;
          display_name?: string | null;
          device_group?: DeviceGroup | null;
          location?: string | null;
          model_no?: string | null;
          serial_no?: string | null;
          chassis_serial?: string | null;
          os_version?: string | null;
          time_zone?: string | null;
          admin_email?: string | null;
          is_active?: boolean;
          first_seen_at?: string;
          last_report_at?: string | null;
        };
        Relationships: [];
      };

      reports: {
        Row: {
          id: string;
          device_id: string;
          report_date: string;
          generated_at: string;
          email_message_id: string;
          storage_path: string;
          partb_storage_path: string | null;
          file_size_bytes: number;
          status: ReportStatus;
          parse_warnings: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          device_id: string;
          report_date: string;
          generated_at: string;
          email_message_id: string;
          storage_path: string;
          partb_storage_path?: string | null;
          file_size_bytes: number;
          status: ReportStatus;
          parse_warnings?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          device_id?: string;
          report_date?: string;
          generated_at?: string;
          email_message_id?: string;
          storage_path?: string;
          partb_storage_path?: string | null;
          file_size_bytes?: number;
          status?: ReportStatus;
          parse_warnings?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_device_id_fkey';
            columns: ['device_id'];
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
        ];
      };

      capacity_snapshots: {
        Row: {
          id: string;
          report_id: string;
          tier: CapacityTier;
          resource: string;
          size_gib: number | null;
          used_gib: number;
          avail_gib: number | null;
          use_pct: number | null;
          cleanable_gib: number | null;
        };
        Insert: {
          id?: string;
          report_id: string;
          tier?: CapacityTier;
          resource: string;
          size_gib?: number | null;
          used_gib: number;
          avail_gib?: number | null;
          use_pct?: number | null;
          cleanable_gib?: number | null;
        };
        Update: {
          id?: string;
          report_id?: string;
          tier?: CapacityTier;
          resource?: string;
          size_gib?: number | null;
          used_gib?: number;
          avail_gib?: number | null;
          use_pct?: number | null;
          cleanable_gib?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'capacity_snapshots_report_id_fkey';
            columns: ['report_id'];
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
        ];
      };

      compression_stats: {
        Row: {
          id: string;
          report_id: string;
          period: CompressionPeriod;
          precomp_gib: number;
          postcomp_gib: number;
          global_comp_factor: number | null;
          local_comp_factor: number | null;
          total_comp_factor: number;
          reduction_pct: number;
        };
        Insert: {
          id?: string;
          report_id: string;
          period: CompressionPeriod;
          precomp_gib: number;
          postcomp_gib: number;
          global_comp_factor?: number | null;
          local_comp_factor?: number | null;
          total_comp_factor: number;
          reduction_pct: number;
        };
        Update: {
          id?: string;
          report_id?: string;
          period?: CompressionPeriod;
          precomp_gib?: number;
          postcomp_gib?: number;
          global_comp_factor?: number | null;
          local_comp_factor?: number | null;
          total_comp_factor?: number;
          reduction_pct?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'compression_stats_report_id_fkey';
            columns: ['report_id'];
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
        ];
      };

      device_alerts: {
        Row: {
          id: string;
          report_id: string;
          alert_id: string;
          severity: AlertSeverity;
          class: string;
          object: string;
          message: string;
          posted_at: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          report_id: string;
          alert_id: string;
          severity: AlertSeverity;
          class: string;
          object: string;
          message: string;
          posted_at: string;
          is_active: boolean;
        };
        Update: {
          id?: string;
          report_id?: string;
          alert_id?: string;
          severity?: AlertSeverity;
          class?: string;
          object?: string;
          message?: string;
          posted_at?: string;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'device_alerts_report_id_fkey';
            columns: ['report_id'];
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
        ];
      };

      network_interfaces: {
        Row: {
          id: string;
          report_id: string;
          port: string;
          state: InterfaceState;
          link_up: boolean | null;
          speed: string | null;
          duplex: string | null;
          hardware_address: string | null;
        };
        Insert: {
          id?: string;
          report_id: string;
          port: string;
          state: InterfaceState;
          link_up?: boolean | null;
          speed?: string | null;
          duplex?: string | null;
          hardware_address?: string | null;
        };
        Update: {
          id?: string;
          report_id?: string;
          port?: string;
          state?: InterfaceState;
          link_up?: boolean | null;
          speed?: string | null;
          duplex?: string | null;
          hardware_address?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'network_interfaces_report_id_fkey';
            columns: ['report_id'];
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
        ];
      };

      system_health: {
        Row: {
          id: string;
          report_id: string;
          uptime_days: number | null;
          load_avg_1m: number | null;
          load_avg_5m: number | null;
          load_avg_15m: number | null;
          mem_total_mib: number | null;
          mem_free_mib: number | null;
          swap_total_mib: number | null;
          swap_free_mib: number | null;
          system_availability_pct: number | null;
          fs_availability_pct: number | null;
          last_cleaning_at: string | null;
        };
        Insert: {
          id?: string;
          report_id: string;
          uptime_days?: number | null;
          load_avg_1m?: number | null;
          load_avg_5m?: number | null;
          load_avg_15m?: number | null;
          mem_total_mib?: number | null;
          mem_free_mib?: number | null;
          swap_total_mib?: number | null;
          swap_free_mib?: number | null;
          system_availability_pct?: number | null;
          fs_availability_pct?: number | null;
          last_cleaning_at?: string | null;
        };
        Update: {
          id?: string;
          report_id?: string;
          uptime_days?: number | null;
          load_avg_1m?: number | null;
          load_avg_5m?: number | null;
          load_avg_15m?: number | null;
          mem_total_mib?: number | null;
          mem_free_mib?: number | null;
          swap_total_mib?: number | null;
          swap_free_mib?: number | null;
          system_availability_pct?: number | null;
          fs_availability_pct?: number | null;
          last_cleaning_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'system_health_report_id_fkey';
            columns: ['report_id'];
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
        ];
      };

      disk_summary: {
        Row: {
          id: string;
          report_id: string;
          disks_in_use: number;
          disks_spare: number;
          disks_failed: number;
          disks_absent: number;
          reliability_notes: Json | null;
        };
        Insert: {
          id?: string;
          report_id: string;
          disks_in_use?: number;
          disks_spare?: number;
          disks_failed?: number;
          disks_absent?: number;
          reliability_notes?: Json | null;
        };
        Update: {
          id?: string;
          report_id?: string;
          disks_in_use?: number;
          disks_spare?: number;
          disks_failed?: number;
          disks_absent?: number;
          reliability_notes?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'disk_summary_report_id_fkey';
            columns: ['report_id'];
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
        ];
      };

      mtrees: {
        Row: {
          id: string;
          report_id: string;
          mtree_path: string;
          precomp_gib: number;
          status: string | null;
        };
        Insert: {
          id?: string;
          report_id: string;
          mtree_path: string;
          precomp_gib: number;
          status?: string | null;
        };
        Update: {
          id?: string;
          report_id?: string;
          mtree_path?: string;
          precomp_gib?: number;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'mtrees_report_id_fkey';
            columns: ['report_id'];
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
        ];
      };

      system_notifications: {
        Row: {
          id: string;
          device_id: string | null;
          report_id: string | null;
          type: NotificationType;
          severity: NotificationSeverity;
          title: string;
          body: string;
          email_sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          device_id?: string | null;
          report_id?: string | null;
          type: NotificationType;
          severity: NotificationSeverity;
          title: string;
          body: string;
          email_sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          device_id?: string | null;
          report_id?: string | null;
          type?: NotificationType;
          severity?: NotificationSeverity;
          title?: string;
          body?: string;
          email_sent_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'system_notifications_device_id_fkey';
            columns: ['device_id'];
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'system_notifications_report_id_fkey';
            columns: ['report_id'];
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
        ];
      };

      alert_rules: {
        Row: {
          id: string;
          name: string;
          metric: string;
          operator: AlertRuleOperator;
          threshold: number | null;
          severity: AlertRuleSeverity;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          metric: string;
          operator: AlertRuleOperator;
          threshold?: number | null;
          severity: AlertRuleSeverity;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          metric?: string;
          operator?: AlertRuleOperator;
          threshold?: number | null;
          severity?: AlertRuleSeverity;
          enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };

      ingest_log: {
        Row: {
          id: string;
          email_message_id: string | null;
          device_hostname: string | null;
          outcome: IngestOutcome;
          detail: Json | null;
          duration_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email_message_id?: string | null;
          device_hostname?: string | null;
          outcome: IngestOutcome;
          detail?: Json | null;
          duration_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email_message_id?: string | null;
          device_hostname?: string | null;
          outcome?: IngestOutcome;
          detail?: Json | null;
          duration_ms?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };

      two_factor_codes: {
        Row: {
          id:         string;
          user_id:    string;
          code_hash:  string;
          salt:       string;
          expires_at: string;
          consumed:   boolean;
          attempts:   number;
          created_at: string;
        };
        Insert: {
          id?:        string;
          user_id:    string;
          code_hash:  string;
          salt:       string;
          expires_at: string;
          consumed?:  boolean;
          attempts?:  number;
          created_at?: string;
        };
        Update: {
          consumed?:  boolean;
          attempts?:  number;
        };
        Relationships: [
          {
            foreignKeyName: 'two_factor_codes_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };

      app_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
    };

    Views: {
      v_bag_devices: {
        Row: Database['public']['Tables']['devices']['Row'];
        Relationships: [];
      };
      v_offset_devices: {
        Row: Database['public']['Tables']['devices']['Row'];
        Relationships: [];
      };
      v_avamar_devices: {
        Row: Database['public']['Tables']['devices']['Row'];
        Relationships: [];
      };
      v_device_latest: {
        Row: Database['public']['Tables']['devices']['Row'] & {
          latest_report_id: string | null;
          latest_report_date: string | null;
          latest_generated_at: string | null;
          latest_report_status: ReportStatus | null;
          latest_parse_warnings: Json | null;
        };
        Relationships: [];
      };
    };

    Functions: {
      get_current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      ingest_report: {
        Args: { payload: Record<string, unknown> };
        Returns: Json;
      };
    };

    Enums: Record<PropertyKey, never>;
    CompositeTypes: Record<PropertyKey, never>;
  };
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Extract the Row type for any public table. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/** Extract the Insert type for any public table. */
export type Inserts<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/** Extract the Update type for any public table. */
export type Updates<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

/** Extract the Row type for any public view. */
export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row'];
