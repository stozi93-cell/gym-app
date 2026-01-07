import { BrowserRouter, Routes, Route, Link } from "react-router-dom"; 
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
import AssignSubscription from "./pages/AssignSubscription";
import MySubscriptions from "./pages/MySubscriptions";

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
        <Link to="/">Rezervacije</Link>

        {" | "}
        <Link to={`/profil/${user.uid}`}>Moj profil</Link>

        {" | "}
        <Link to="/moje-pretplate">Moja pretplata</Link>

        {role === "admin" && (
          <>
            {" | "}
            <Link to="/raspored">Raspored</Link>

            {" | "}
            <Link to="/klijenti">Lista klijenata</Link>

            {" | "}
            <Link to="/paketi">Paketi</Link>

            {" | "}
            <Link to="/dodela-pretplate">Dodela pretplate</Link>
          </>
        )}
      </nav>

      <Routes>
        {/* Client */}
        <Route path="/" element={<Bookings />} />
        <Route path="/profil/:uid" element={<ClientProfile />} />
        <Route path="/moje-pretplate" element={<MySubscriptions />} />

        {/* Admin */}
        {role === "admin" && (
          <>
            <Route path="/raspored" element={<AdminSlots />} />
            <Route path="/klijenti" element={<AdminClients />} />
            <Route path="/paketi" element={<AdminPackages />} />

            {/* Support both /dodela-pretplate and /assign-subscription/:uid */}
            <Route path="/dodela-pretplate" element={<AssignSubscription />} />
            <Route path="/assign-subscription/:uid?" element={<AssignSubscription />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}
