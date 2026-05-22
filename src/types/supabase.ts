import type { Database as GeneratedDatabase } from "@/types/supabase.generated";

type AuthUser = { id: string; email: string; display_name: string };

type AuthFunctions = {
  admin_check_session: {
    Args: { p_token: string };
    Returns: { user: AuthUser } | null;
  };
  admin_login: {
    Args: { p_email: string; p_password: string };
    Returns: { token: string; user: AuthUser; error?: string } | null;
  };
  admin_logout: {
    Args: { p_token: string };
    Returns: void;
  };
};

export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: AuthFunctions;
  };
};
