import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "./context/LanguageContext";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { Toaster } from "./components/ui/sonner";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import MapPage from "./pages/MapPage";
import RoutesPage from "./pages/RoutesPage";
import NotificationsPage from "./pages/NotificationsPage";
import ExplorePage from "./pages/ExplorePage";
import SocietyDashboard from "./pages/SocietyDashboard";
import ActivityForm from "./pages/ActivityForm";
import ActivityDetail from "./pages/ActivityDetail";
import FederationDashboard from "./pages/FederationDashboard";
import RegularParticipantsPage from "./pages/RegularParticipantsPage";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-green-800 border-t-transparent rounded-full" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'society') return <Navigate to="/society" />;
    if (user.role === 'federation') return <Navigate to="/federation" />;
    return <Navigate to="/map" />;
  }
  return children;
};

function AppContent() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-stone-50 dark:bg-stone-950">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/routes" element={
              <ProtectedRoute allowedRoles={["hiker"]}><RoutesPage /></ProtectedRoute>
            } />
            <Route path="/notifications" element={
              <ProtectedRoute><NotificationsPage /></ProtectedRoute>
            } />
            {/* Society routes */}
            <Route path="/society" element={
              <ProtectedRoute allowedRoles={["society"]}><SocietyDashboard /></ProtectedRoute>
            } />
            <Route path="/society/activity/new" element={
              <ProtectedRoute allowedRoles={["society"]}><ActivityForm /></ProtectedRoute>
            } />
            <Route path="/society/activity/:activityId" element={
              <ProtectedRoute allowedRoles={["society"]}><ActivityDetail /></ProtectedRoute>
            } />
            <Route path="/society/activity/:activityId/edit" element={
              <ProtectedRoute allowedRoles={["society"]}><ActivityForm /></ProtectedRoute>
            } />
            <Route path="/society/participants" element={
              <ProtectedRoute allowedRoles={["society"]}><RegularParticipantsPage /></ProtectedRoute>
            } />
            {/* Federation routes */}
            <Route path="/federation" element={
              <ProtectedRoute allowedRoles={["federation"]}><FederationDashboard /></ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <Footer />
        <Toaster position="top-right" richColors />
      </div>
    </BrowserRouter>
  );
}

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
