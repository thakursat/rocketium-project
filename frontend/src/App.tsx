import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import DesignListPage from "./pages/DesignListPage";
import DesignEditorPage from "./pages/DesignEditorPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/designs" replace />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/designs" element={<DesignListPage />} />
        <Route path="/designs/:id" element={<DesignEditorPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/designs" replace />} />
    </Routes>
  );
}
