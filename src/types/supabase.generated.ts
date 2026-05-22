export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      activity_events: { Row: any; Insert: any; Update: any };
      alerts: { Row: any; Insert: any; Update: any };
      app_settings: { Row: any; Insert: any; Update: any };
      buyers: { Row: any; Insert: any; Update: any };
      comments: { Row: any; Insert: any; Update: any };
      csv_import_errors: { Row: any; Insert: any; Update: any };
      csv_import_entity_links: { Row: any; Insert: any; Update: any };
      csv_imports: { Row: any; Insert: any; Update: any };
      inventory_events: { Row: any; Insert: any; Update: any };
      inventory_items: { Row: any; Insert: any; Update: any };
      lookbook_template_items: { Row: any; Insert: any; Update: any };
      lookbook_templates: { Row: any; Insert: any; Update: any };
      locations: { Row: any; Insert: any; Update: any };
      mapping_presets: { Row: any; Insert: any; Update: any };
      people: { Row: any; Insert: any; Update: any };
      po_line_items: { Row: any; Insert: any; Update: any };
      products: { Row: any; Insert: any; Update: any };
      purchase_order_notifications: { Row: any; Insert: any; Update: any };
      purchase_orders: { Row: any; Insert: any; Update: any };
      sops: { Row: any; Insert: any; Update: any };
      training_modules: { Row: any; Insert: any; Update: any };
      training_progress: { Row: any; Insert: any; Update: any };
      vendors: { Row: any; Insert: any; Update: any };
      wins: { Row: any; Insert: any; Update: any };
    };
    Views: Record<string, never>;
    Functions: {
      admin_check_session: {
        Args: { p_token: string };
        Returns: { user: { id: string; email: string; display_name: string } } | null;
      };
      admin_login: {
        Args: { p_email: string; p_password: string };
        Returns: { token: string; user: { id: string; email: string; display_name: string }; error?: string } | null;
      };
      admin_logout: {
        Args: { p_token: string };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
