import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import Login from "./auth/Login";
import Register from "./auth/Register";

import Bookings from "./pages/Bookings";
import AdminSlots from "./pages/AdminSlots";
import ClientProfile from "./pages/ClientProfile";
import AdminClients from "./pages/AdminClients";
import AdminPackages from "./pages/AdminPackages";
import MySubscriptions from "./pages/MySubscriptions";
import AdminBilling from "./pages/AdminBilling";
import Forum from "./pages/Forum";
import ClientChat from "./pages/ClientChat";
import AdminChat from "./pages/AdminChat";
import AdminChats from "./pages/AdminChats";

import Splash from "./components/Splash";
import AppShell from "./components/AppShell";

export default function App() {
  const { user, profile, loading } = useAuth();

  if (loading) return <Splash />;

  // ─────────────────────────────
  // NOT AUTHENTICATED
  // ─────────────────────────────
  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Login />} />
        </Routes>
      </BrowserRouter>
    );
  }

  const role = profile?.role;

  // ─────────────────────────────
  // AUTHENTICATED
  // ─────────────────────────────
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          {/* Forum — accessible to all */}
          <Route path="/forum" element={<Forum />} />

          {/* CLIENT */}
          {role === "client" && (
            <>
              <Route path="/" element={<Bookings />} />
              <Route path="/profil/:uid" element={<ClientProfile />} />
              <Route path="/moje-pretplate" element={<MySubscriptions />} />
              <Route path="/chat" element={<ClientChat />} />
            </>
          )}

          {/* ADMIN */}
          {role === "admin" && (
            <>
              <Route path="/" element={<AdminSlots />} />
              <Route path="/raspored" element={<AdminSlots />} />
              <Route path="/klijenti" element={<AdminClients />} />
              <Route path="/paketi" element={<AdminPackages />} />
              <Route path="/naplate" element={<AdminBilling />} />
              <Route path="/profil/:uid" element={<ClientProfile />} />
              <Route path="/poruke" element={<AdminChats />} />
              <Route path="/admin-chat/:conversationId" element={<AdminChat />} />

            </>
          )}

          {/* FALLBACK */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
