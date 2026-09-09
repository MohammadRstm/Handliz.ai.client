import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { Spinner } from "../components/Spinner";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isInitializing } = useAuth();

  if (isInitializing) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
        <Spinner label="Loading..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
