import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";
import { db } from "../firebase";

export default function ClientProfile() {
  const { uid } = useParams();
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    load();
  }, [uid]);

  async function load() {
    // Load user
    const userSnap = await getDoc(doc(db, "users", uid));
    setUser(userSnap.data());

    // Load active client subscription
    const csSnap = await getDocs(
      query(
        collection(db, "clientSubscriptions"),
        where("userId", "==", uid),
        where("active", "==", true)
      )
    );

    if (csSnap.empty) {
      setSubscription(null);
      return;
    }

    const cs = csSnap.docs[0].data();

    // Load package
    const subSnap = await getDoc(
      doc(db, "subscriptions", cs.subscriptionId)
    );

    setSubscription({
      ...subSnap.data(),
      startDate: cs.startDate.toDate ? cs.startDate.toDate() : new Date(cs.startDate),
      endDate: cs.endDate.toDate ? cs.endDate.toDate() : new Date(cs.endDate),
    });
  }

  if (!user) return <div>Učitavanje...</div>;

  const today = new Date();
  const isActive = subscription
    ? subscription.endDate >= today
    : false;

  return (
    <div>
      <h2>Profil klijenta</h2>

      <p><b>Ime:</b> {user.name}</p>
      <p><b>Prezime:</b> {user.surname}</p>
      <p><b>Email:</b> {user.email}</p>
      <p><b>Telefon:</b> {user.phone}</p>
      <p><b>Datum rođenja:</b> {user.dob}</p>

      <hr />

      <h3>Pretplata</h3>

      {subscription ? (
        <>
          <p><b>Paket:</b> {subscription.name}</p>
          <p>
            <b>Trajanje:</b>{" "}
            {subscription.startDate.toLocaleDateString("sr-RS", { day: "2-digit", month: "long", year: "numeric" })} –{" "}
{subscription.endDate.toLocaleDateString("sr-RS", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
          <p><b>Cena:</b> {subscription.price} RSD</p>
          <p>
            <b>Status:</b>{" "}
            <span style={{ color: isActive ? "green" : "red" }}>
              {isActive ? "Aktivna" : "Istekla"}
            </span>
          </p>
        </>
      ) : (
        <p>Nema aktivne pretplate</p>
      )}

      <hr />

      <h3>Opšte napomene</h3>
      <p><b>Opšti ciljevi:</b> {user.goals || "—"}</p>
      <p><b>Zdravstvene napomene:</b> {user.healthNotes || "—"}</p>
      <p><b>Trenažne napomene:</b> {user.trainingNotes || "—"}</p>
    </div>
  );
}
