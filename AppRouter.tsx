import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import MainLayout from "./layouts/MainLayout";
import HomePage from "./pages/HomePage";
import CreatePage from "./pages/CreatePage";
import DashboardPage from "./pages/DashboardPage";
import { InfluencerProvider } from "./services/InfluencerContext";
import { ToastProvider } from "./services/ToastContext";
import { AuthProvider, useAuth } from "./services/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";

const GOOGLE_CLIENT_ID = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID || "";

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/" />;
};

const AppRouter: React.FC = () => {
  return (
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <InfluencerProvider>
                <MainLayout>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route
                      path="/create"
                      element={
                        <ProtectedRoute>
                          <CreatePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/dashboard/:id"
                      element={
                        <ProtectedRoute>
                          <DashboardPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                </MainLayout>
              </InfluencerProvider>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  );
};

export default AppRouter;
