import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { signOut } from "firebase/auth";
import { useAuth } from "./context/AuthContext";
import { auth } from "./firebase";

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

export default function App() {
  const { user, profile, loading } = useAuth();

  if (loading) return <div>Učitavanje...</div>;

  if (!user) {
    return (
      <div>
        <h1>Gym App</h1>
        <Register />
        <Login />
      </div>
    );
  }

  const role = profile?.role;

  return (
    <BrowserRouter>
      <h1>Dobrodošli, {profile?.name}</h1>
      <button onClick={() => signOut(auth)}>Odjava</button>

      <nav style={{ marginBottom: 20 }}>
        {role === "client" && (
          <>
            <Link to="/">Rezervacije</Link>{" | "}
            <Link to={`/profil/${user.uid}`}>Moj profil</Link>{" | "}
          </>
        )}

        {role === "admin" && (
          <>
            <Link to="/raspored">Raspored</Link>{" | "}
            <Link to="/klijenti">Lista klijenata</Link>{" | "}
            <Link to="/paketi">Paketi</Link>{" | "}
            <Link to="/naplate">Naplate</Link>{" | "}
          </>
        )}

        {/* ALWAYS LAST */}
        <Link to="/forum">📢 Forum</Link>
      </nav>

      <Routes>
        {/* FORUM — accessible to all */}
        <Route path="/forum" element={<Forum />} />

        {/* CLIENT ONLY ROUTES */}
        {role === "client" && (
          <>
            <Route path="/" element={<Bookings />} />
            <Route path="/moje-pretplate" element={<MySubscriptions />} />
          </>
        )}

        {/* PROFILE ROUTE — accessible to both */}
        <Route path="/profil/:uid" element={<ClientProfile />} />

        {/* ADMIN ONLY ROUTES */}
        {role === "admin" && (
          <>
            <Route path="/raspored" element={<AdminSlots />} />
            <Route path="/klijenti" element={<AdminClients />} />
            <Route path="/paketi" element={<AdminPackages />} />
            <Route path="/naplate" element={<AdminBilling />} />

            <Route path="/" element={<Navigate to="/raspored" />} />
            <Route path="/moje-pretplate" element={<Navigate to="/raspored" />} />
          </>
        )}

        <Route
          path="*"
          element={<Navigate to={role === "client" ? "/" : "/raspored"} />}
        />
      </Routes>
    </BrowserRouter>
  );
}
