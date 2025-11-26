import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import DesignListPage from "./pages/DesignListPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/designs" replace />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/designs" element={<DesignListPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/designs" replace />} />
    </Routes>
  );
}
