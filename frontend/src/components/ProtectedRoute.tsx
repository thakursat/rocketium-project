import type { ReactElement } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAppSelector } from "../hooks/store";

interface ProtectedRouteProps {
  children?: ReactElement;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const auth = useAppSelector((state) => state.auth);

  if (!auth.token) {
    return <Navigate to="/signin" replace />;
  }

  return children ?? <Outlet />;
}
