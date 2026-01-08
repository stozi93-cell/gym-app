import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  Timestamp
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

function ClientProfile() {
  const { uid } = useParams();
  const { profile } = useAuth();
  const role = profile?.role;

  const [user, setUser] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [lastVisit, setLastVisit] = useState(null);
  const [showAllSubs, setShowAllSubs] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [editingSubId, setEditingSubId] = useState(null);

  useEffect(() => {
    load();
  }, [uid]);

  async function load() {
    const userSnap = await getDoc(doc(db, "users", uid));
    const userData = userSnap.data();

    const dobString = userData.dob
      ? userData.dob.toDate
        ? userData.dob.toDate().toISOString().slice(0, 10)
        : new Date(userData.dob).toISOString().slice(0, 10)
      : "";

    setUser({ ...userData, dob: dobString });
    setFormData({ ...userData, dob: dobString });

    // --- LAST VISIT ---
    const bookingSnap = await getDocs(
      query(collection(db, "bookings"), where("userId", "==", uid))
    );

    if (!bookingSnap.empty) {
      const visits = bookingSnap.docs
        .map(d => d.data())
        .filter(b => b.checkedInAt)
        .sort((a, b) => b.checkedInAt.toDate() - a.checkedInAt.toDate());

      setLastVisit(visits.length ? visits[0].checkedInAt.toDate() : null);
    } else {
      setLastVisit(null);
    }

    // --- SUBSCRIPTIONS ---
    const csSnap = await getDocs(
      query(collection(db, "clientSubscriptions"), where("userId", "==", uid))
    );

    const subs = [];
    for (const d of csSnap.docs) {
      const cs = d.data();
      const subSnap = await getDoc(doc(db, "subscriptions", cs.subscriptionId));
      const pkg = subSnap.data();
      if (!pkg) continue;

      // --- Safe defaults ---
      const checkInsArray = Array.isArray(cs.checkInsArray) ? cs.checkInsArray : [];
      let weeklyCheckIns = cs.weeklyCheckIns;
      if (!weeklyCheckIns || weeklyCheckIns === "default") {
        weeklyCheckIns = pkg.defaultCheckIns || "unlimited";
      }

      let startDate = cs.startDate?.toDate ? cs.startDate.toDate() : new Date(cs.startDate);
      let endDate = cs.endDate?.toDate ? cs.endDate.toDate() : new Date(cs.endDate);
      if (isNaN(startDate.getTime())) startDate = new Date();
      if (isNaN(endDate.getTime())) endDate = new Date();

      subs.push({
        id: d.id,
        ...pkg,
        startDate,
        endDate,
        active: cs.active,
        checkInsArray,
        weeklyCheckIns
      });
    }

    subs.sort((a, b) => b.startDate - a.startDate);
    setSubscriptions(subs);
  }

  if (!user) return <div>Učitavanje...</div>;

  const formatDate = (d) => {
    if (!d) return "—";
    const dateObj = d?.toDate ? d.toDate() : new Date(d);
    return dateObj.toLocaleDateString("sr-Latn-RS", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const renderText = (value) => {
    if (!value) return "—";
    if (value instanceof Timestamp) return formatDate(value);
    if (typeof value === "object") return "—";
    return value;
  };

  const handleChange = (field, value) => setFormData({ ...formData, [field]: value });

  const getLastVisitInfo = (date) => {
    if (!date) return { text: "—", color: "black" };
    const today = new Date();
    const daysAgo = Math.floor((today - date) / (1000 * 60 * 60 * 24));
    let color = "black";
    if (daysAgo < 7) color = "green";
    else if (daysAgo <= 30) color = "orange";
    else color = "red";
    return { text: `${formatDate(date)} (${daysAgo} ${daysAgo === 1 ? "dan" : "dana"} unazad)`, color };
  };

  async function saveProfile() {
    await updateDoc(doc(db, "users", uid), formData);
    setUser(formData);
    setEditMode(false);
    alert("Profil sačuvan");
  }

  const visibleSubs = showAllSubs ? subscriptions : subscriptions.slice(0, 1);

  const startEditingSub = (subId) => setEditingSubId(subId);
  const stopEditingSub = () => setEditingSubId(null);

  const updateSubField = async (subId, field, value) => {
    await updateDoc(doc(db, "clientSubscriptions", subId), { [field]: value });
    load();
  };

  const changeCheckIn = async (subId, weekIndex, delta) => {
    const sub = subscriptions.find(s => s.id === subId);
    if (!sub) return;
    const arr = [...sub.checkInsArray];
    arr[weekIndex] = (arr[weekIndex] === "unlimited" ? 0 : arr[weekIndex] || 0) + delta;
    if (arr[weekIndex] < 0) arr[weekIndex] = 0;
    await updateDoc(doc(db, "clientSubscriptions", subId), { checkInsArray: arr });
    load();
  };

  const deactivateSub = async (subId) => {
    await updateDoc(doc(db, "clientSubscriptions", subId), { active: false });
    load();
  };

  const reactivateSub = async (subId) => {
    await updateDoc(doc(db, "clientSubscriptions", subId), { active: true });
    load();
  };

  return (
    <div>
      <h2>Profil klijenta</h2>

      {/* Edit button for admin or client */}
      {!editMode && (role === "admin" || role === "client") && (
        <button onClick={() => setEditMode(true)}>Uredi profil</button>
      )}

      {editMode && (
        <>
          <button onClick={saveProfile}>Sačuvaj</button>
          <button onClick={() => { setEditMode(false); setFormData(user); }}>Otkaži</button>
        </>
      )}

      <p><b>Ime:</b> {editMode ? (<input value={formData.name || ""} onChange={e => handleChange("name", e.target.value)} disabled={!(role === "admin" || role === "client")} />) : renderText(user.name)}</p>
      <p><b>Prezime:</b> {editMode ? (<input value={formData.surname || ""} onChange={e => handleChange("surname", e.target.value)} disabled={!(role === "admin" || role === "client")} />) : renderText(user.surname)}</p>
      <p><b>Email:</b> {editMode ? (<input value={formData.email || ""} onChange={e => handleChange("email", e.target.value)} disabled={!(role === "admin" || role === "client")} />) : renderText(user.email)}</p>
      <p><b>Telefon:</b> {editMode ? (<input value={formData.phone || ""} onChange={e => handleChange("phone", e.target.value)} disabled={!(role === "admin" || role === "client")} />) : renderText(user.phone)}</p>
      <p><b>Datum rođenja:</b> {editMode ? (<input type="date" value={formData.dob || ""} onChange={e => handleChange("dob", e.target.value)} disabled={!(role === "admin" || role === "client")} />) : formatDate(user.dob)}</p>
      <p><b>Poslednja poseta:</b>{" "}<span style={{ color: getLastVisitInfo(lastVisit).color }}>{getLastVisitInfo(lastVisit).text}</span></p>

      <hr />

      <h3>Pretplate</h3>
      {visibleSubs.length === 0 && <p>Nema pretplata.</p>}
      {visibleSubs.map((s, idx) => {
        const active = s.active && s.endDate >= new Date();
        const editing = editingSubId === s.id;
        const isLatest = idx === 0;

        return (
          <div key={s.id} style={{ border: "1px solid #ccc", padding: 10, marginBottom: 10, borderRadius: 6, backgroundColor: active ? "#eaffea" : "#ffeaea" }}>
            {editing ? (
              <>
                <p><b>Paket:</b> {s.name}</p>
                <p>
                  <b>Start:</b>{" "}
                  <input type="date" value={s.startDate.toISOString().slice(0,10)} onChange={e => updateSubField(s.id, "startDate", new Date(e.target.value))} />
                </p>
                <p>
                  <b>End:</b>{" "}
                  <input type="date" value={s.endDate.toISOString().slice(0,10)} onChange={e => updateSubField(s.id, "endDate", new Date(e.target.value))} />
                </p>
                <p>
                  <b>Cena:</b>{" "}
                  <input type="number" value={s.price || 0} onChange={e => updateSubField(s.id, "price", Number(e.target.value))} />
                </p>
                <p>
                  <b>Broj dolazaka nedeljno:</b>{" "}
                  <select value={s.weeklyCheckIns} onChange={e => updateSubField(s.id, "weeklyCheckIns", e.target.value)}>
                    <option value="default">Koristi podrazumevano iz paketa</option>
                    <option value="1">Jednom nedeljno</option>
                    <option value="2">Dva puta nedeljno</option>
                    <option value="3">Tri puta nedeljno</option>
                    <option value="4">Četiri puta nedeljno</option>
                    <option value="5">Pet puta nedeljno</option>
                    <option value="unlimited">Neograničeno</option>
                  </select>
                </p>
                <button onClick={stopEditingSub}>Gotovo</button>
              </>
            ) : (
              <>
                <p><b>Paket:</b> {s.name}</p>
                <p><b>Period:</b> {formatDate(s.startDate)} – {formatDate(s.endDate)}</p>
                <p><b>Cena:</b> {s.price ?? "—"} RSD</p>
                <p><b>Status:</b> <span style={{ color: active ? "green" : "red" }}>{active ? "Aktivna" : "Neaktivna"}</span></p>
                <p><b>Broj dolazaka nedeljno:</b> {s.weeklyCheckIns === "unlimited" ? "Neograničeno" : s.weeklyCheckIns}</p>

                <div>
                  <b>Dolasci po nedeljama:</b>
                  <ul>
                    {s.checkInsArray.map((c, i) => {
                      const weekStart = new Date(s.startDate);
                      weekStart.setDate(weekStart.getDate() + i * 7);
                      const weekEnd = new Date(weekStart);
                      weekEnd.setDate(weekStart.getDate() + 6);
                      const startStr = weekStart.toLocaleDateString("sr-Latn-RS", { day:"2-digit", month:"long", year:"numeric" });
                      const endStr = weekEnd.toLocaleDateString("sr-Latn-RS", { day:"2-digit", month:"long", year:"numeric" });
                      const attended = typeof c === "number" ? c : 0;

                      return (
                        <li key={i}>
                          Nedelja {i + 1} ({startStr} – {endStr}): {attended}
                          {role === "admin" && (
                            <>
                              {s.weeklyCheckIns !== "unlimited" && <> / {s.weeklyCheckIns} </>}
                              <button onClick={() => changeCheckIn(s.id, i, 1)}>+</button>
                              <button onClick={() => changeCheckIn(s.id, i, -1)}>-</button>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {role === "admin" && (
                  <>
                    {active && <button style={{ marginRight: 5 }} onClick={() => startEditingSub(s.id)}>Uredi pretplatu</button>}
                    {active && <button style={{ marginRight: 5 }} onClick={() => deactivateSub(s.id)}>Deaktiviraj</button>}
                    {!active && isLatest && <button onClick={() => reactivateSub(s.id)}>Reaktiviraj</button>}
                  </>
                )}
              </>
            )}
          </div>
        );
      })}

      {subscriptions.length > 1 && (
        <button onClick={() => setShowAllSubs(!showAllSubs)}>
          {showAllSubs ? "Sakrij starije pretplate" : "Prikaži starije pretplate"}
        </button>
      )}

      <hr />

      <h3>Opšte napomene</h3>
      <p><b>Opšti ciljevi:</b><br />{editMode ? (<textarea rows={3} value={formData.goals || ""} onChange={e => handleChange("goals", e.target.value)} disabled={!(role === "admin" || role === "client")} />) : renderText(user.goals)}</p>
      <p><b>Zdravstvene napomene:</b><br />{editMode ? (<textarea rows={3} value={formData.healthNotes || ""} onChange={e => handleChange("healthNotes", e.target.value)} disabled={!(role === "admin" || role === "client")} />) : renderText(user.healthNotes)}</p>
      <p><b>Trenažne napomene:</b><br />{editMode && role === "admin" ? (<textarea rows={3} value={formData.trainingNotes || ""} onChange={e => handleChange("trainingNotes", e.target.value)} />) : renderText(user.trainingNotes)}</p>
    </div>
  );
}

export default ClientProfile;
