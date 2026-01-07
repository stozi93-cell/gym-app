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

export default function ClientProfile() {
  const { uid } = useParams();
  const { profile } = useAuth();
  const role = profile?.role;

  const [user, setUser] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [showAllSubs, setShowAllSubs] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});

  const [editSubId, setEditSubId] = useState(null);
  const [subFormData, setSubFormData] = useState({});

  useEffect(() => {
    load();
  }, [uid]);

  async function load() {
    const userSnap = await getDoc(doc(db, "users", uid));
    const userData = userSnap.data();
    setUser(userData);
    setFormData(userData);

    const csSnap = await getDocs(
      query(
        collection(db, "clientSubscriptions"),
        where("userId", "==", uid)
      )
    );

    const subs = [];

    for (const d of csSnap.docs) {
      const cs = d.data();
      const pkgSnap = await getDoc(
        doc(db, "subscriptions", cs.subscriptionId)
      );

      subs.push({
        id: d.id,
        ...pkgSnap.data(),
        startDate: cs.startDate?.toDate
          ? cs.startDate.toDate()
          : new Date(cs.startDate),
        endDate: cs.endDate?.toDate
          ? cs.endDate.toDate()
          : new Date(cs.endDate),
        active: cs.active,
      });
    }

    subs.sort((a, b) => b.startDate - a.startDate);
    setSubscriptions(subs);
  }

  if (!user) return <div>Učitavanje...</div>;

  const today = new Date();
  const latestSub = subscriptions.find((s) => s.active) || subscriptions[0];

  const formatDate = (value) => {
    if (!value) return "—";

    if (value instanceof Timestamp) {
      return value.toDate().toLocaleDateString("sr-Latn-RS", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    }

    if (value instanceof Date) {
      return value.toLocaleDateString("sr-Latn-RS", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    }

    if (typeof value === "string") return value;

    return "—";
  };

  const renderText = (value) => {
    if (!value) return "—";
    if (value instanceof Timestamp) return formatDate(value);
    if (typeof value === "object") return "—";
    return value;
  };

  const handleChange = (field, value) =>
    setFormData({ ...formData, [field]: value });

  async function saveProfile() {
    await updateDoc(doc(db, "users", uid), formData);
    setUser(formData);
    setEditMode(false);
    alert("Profil sačuvan");
  }

  const handleSubChange = (field, value) =>
    setSubFormData({ ...subFormData, [field]: value });

  const editSubscription = (sub) => {
    setEditSubId(sub.id);
    setSubFormData({ ...sub });
  };

  const saveSubscription = async (subId) => {
    if (!subId) return;
    const subRef = doc(db, "clientSubscriptions", subId);

    // Convert startDate/endDate to Firestore Timestamp if needed
    const start = subFormData.startDate instanceof Date ? subFormData.startDate : new Date(subFormData.startDate);
    const end = subFormData.endDate instanceof Date ? subFormData.endDate : new Date(subFormData.endDate);

    await updateDoc(subRef, {
      startDate: start,
      endDate: end,
      price: subFormData.price,
    });

    setEditSubId(null);
    load();
    alert("Pretplata sačuvana");
  };

  const deactivateSubscription = async (subId) => {
    const subRef = doc(db, "clientSubscriptions", subId);
    await updateDoc(subRef, { active: false });
    load();
  };

  const reactivateSubscription = async (subId) => {
    const subRef = doc(db, "clientSubscriptions", subId);
    await updateDoc(subRef, { active: true });
    load();
  };

  const extendSubscription = async (subId) => {
    const subRef = doc(db, "clientSubscriptions", subId);
    const subSnap = await getDoc(subRef);
    const subData = subSnap.data();
    const currentEnd = subData.endDate?.toDate ? subData.endDate.toDate() : new Date(subData.endDate);
    const newEnd = new Date(currentEnd);
    newEnd.setDate(newEnd.getDate() + 7); // extend 7 days
    await updateDoc(subRef, { endDate: newEnd });
    load();
  };

  const visibleSubs = showAllSubs ? subscriptions : subscriptions.slice(0, 1);

  return (
    <div>
      <h2>Profil klijenta</h2>

      {role === "admin" && !editMode && (
        <button onClick={() => setEditMode(true)}>Uredi profil</button>
      )}

      {editMode && (
        <>
          <button onClick={saveProfile}>Sačuvaj</button>
          <button
            onClick={() => {
              setEditMode(false);
              setFormData(user);
            }}
          >
            Otkaži
          </button>
        </>
      )}

      <p><b>Ime:</b> {editMode ? (
        <input value={formData.name || ""} onChange={e => handleChange("name", e.target.value)} />
      ) : renderText(user.name)}</p>

      <p><b>Prezime:</b> {editMode ? (
        <input value={formData.surname || ""} onChange={e => handleChange("surname", e.target.value)} />
      ) : renderText(user.surname)}</p>

      <p><b>Email:</b> {editMode ? (
        <input value={formData.email || ""} onChange={e => handleChange("email", e.target.value)} />
      ) : renderText(user.email)}</p>

      <p>
        <b>Telefon:</b>{" "}
        {editMode ? (
          <input value={formData.phone || ""} onChange={e => handleChange("phone", e.target.value)} />
        ) : (
          renderText(user.phone)
        )}
      </p>

      <p><b>Datum rođenja:</b> {editMode ? (
        <input type="date" value={formData.dob || ""} onChange={e => handleChange("dob", e.target.value)} />
      ) : formatDate(user.dob)}</p>

      <hr />

      <h3>Pretplate</h3>

      {visibleSubs.length === 0 && <p>Nema pretplata.</p>}

      {visibleSubs.map((s) => {
        const active = s.active && s.endDate >= new Date();

        return (
          <div
            key={s.id}
            style={{
              border: "1px solid #ccc",
              padding: 10,
              marginBottom: 10,
              borderRadius: 6,
              backgroundColor: active ? "#eaffea" : "#ffeaea",
            }}
          >
            {editSubId === s.id ? (
              <>
                <p><b>Paket:</b> {s.name}</p>
                <p>
                  <b>Period:</b>{" "}
                  <input type="date" value={subFormData.startDate.toISOString().split("T")[0]} 
                    onChange={e => handleSubChange("startDate", new Date(e.target.value))} /> –{" "}
                  <input type="date" value={subFormData.endDate.toISOString().split("T")[0]}
                    onChange={e => handleSubChange("endDate", new Date(e.target.value))} />
                </p>
                <p><b>Cena:</b>{" "}
                  <input type="number" value={subFormData.price || 0} onChange={e => handleSubChange("price", Number(e.target.value))} />
                </p>
                <button onClick={() => saveSubscription(s.id)}>Sačuvaj</button>
                <button onClick={() => setEditSubId(null)}>Otkaži</button>
              </>
            ) : (
              <>
                <p><b>Paket:</b> {renderText(s.name)}</p>
                <p><b>Period:</b> {formatDate(s.startDate)} – {formatDate(s.endDate)}</p>
                <p><b>Cena:</b> {s.price ?? "—"} RSD</p>
                <p>
                  <b>Status:</b>{" "}
                  <span style={{ color: active ? "green" : "red" }}>
                    {active ? "Aktivna" : "Neaktivna"}
                  </span>
                </p>

                {role === "admin" && (
                  <>
                    {active && <button style={{ marginRight: 5 }} onClick={() => editSubscription(s)}>Uredi</button>}
                    {active && <button style={{ marginRight: 5 }} onClick={() => deactivateSubscription(s.id)}>Deaktiviraj</button>}
                    {!active && latestSub && <button style={{ marginRight: 5 }} onClick={() => reactivateSubscription(s.id)}>Reaktiviraj</button>}
                    {active && latestSub && <button onClick={() => extendSubscription(s.id)}>Produži</button>}
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

      <p>
        <b>Opšti ciljevi:</b><br />
        {editMode ? (
          <textarea rows={3} value={formData.goals || ""} onChange={e => handleChange("goals", e.target.value)} />
        ) : (
          renderText(user.goals)
        )}
      </p>

      <p>
        <b>Zdravstvene napomene:</b><br />
        {editMode ? (
          <textarea rows={3} value={formData.healthNotes || ""} onChange={e => handleChange("healthNotes", e.target.value)} />
        ) : (
          renderText(user.healthNotes)
        )}
      </p>

      <p>
        <b>Trenažne napomene:</b><br />
        {editMode ? (
          <textarea rows={3} value={formData.trainingNotes || ""} onChange={e => handleChange("trainingNotes", e.target.value)} />
        ) : (
          renderText(user.trainingNotes)
        )}
      </p>
    </div>
  );
}
