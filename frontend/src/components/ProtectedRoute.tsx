import type { ReactElement } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAppSelector } from "../hooks/store";
import { Navbar } from "./Navbar";

interface ProtectedRouteProps {
  children?: ReactElement;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const auth = useAppSelector((state) => state.auth);

  if (!auth.token) {
    return <Navigate to="/signin" replace />;
  }

  const content = children ?? <Outlet />;

  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-content">{content}</main>
    </div>
  );
}
