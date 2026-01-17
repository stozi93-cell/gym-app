import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { profile, logout } = useAuth();

  return (
    <>
      <nav style={{ padding: 10, borderBottom: "1px solid #ccc" }}>
        {profile?.role === "admin" && (
          <>
            <Link to="/klijenti">Lista klijenata</Link>{" | "}
            <Link to="/raspored">Raspored</Link>{" | "}
            <Link to="/paketi">Paketi</Link>
          </>
        )}

        {profile?.role === "client" && (
          <>
            <Link to="/profil/me">Profil</Link>{" | "}
            <Link to="/moje-pretplate">Moje pretplate</Link>{" | "}
            <Link to="/rezervacije">Rezervacije</Link>
          </>
        )}

        <button onClick={logout} style={{ marginLeft: 20 }}>
          Logout
        </button>
      </nav>

      <div style={{ padding: 20 }}>
        <Outlet />
      </div>
    </>
  );
}
