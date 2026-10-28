import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { HomePage } from "./pages/HomePage";
import { ProjectPage } from "./pages/ProjectPage";
import { SettingsPage } from "./pages/SettingsPage";
import { BillingPage } from "./pages/BillingPage";
import { UsageProvider } from "./usage/UsageContext";

function App() {
  return (
    <AuthProvider>
      {/* Inside AuthProvider (usage fetches need accessToken) but outside BrowserRouter -
          one usage snapshot shared across every route, so a refresh() fired from deep
          inside ProjectPage after a successful generation is immediately visible on the
          Billing page or the Home header too, without prop drilling between them. */}
      <UsageProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <ProtectedRoute>
                  <ProjectPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing"
              element={
                <ProtectedRoute>
                  <BillingPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </UsageProvider>
    </AuthProvider>
  );
}

export default App;
