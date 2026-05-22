import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { user, loading } = useAuth();

  // Render nothing while session check is in flight — prevents flash-redirect on hard refresh
  if (loading) return null;

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
