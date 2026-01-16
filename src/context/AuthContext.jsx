import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  const unsub = onAuthStateChanged(auth, async (u) => {
    console.log("[Auth] state change:", u?.uid);

    setUser(u);

    if (u) {
  const ref = doc(db, "users", u.uid);

  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};

  const patch = {};

  // enforce required fields ONLY if missing
  if (data.active === undefined) patch.active = true;
  if (!data.role) patch.role = "client";
  if (!data.email) patch.email = u.email || "";

  if (!data.createdAt) patch.createdAt = serverTimestamp();

  if (!data.name) patch.name = "";
  if (!data.surname) patch.surname = "";
  if (!data.phone) patch.phone = "";
  if (!("dob" in data)) patch.dob = null;

  if (!("goals" in data)) patch.goals = "";
  if (!("healthNotes" in data)) patch.healthNotes = "";

  if (Object.keys(patch).length > 0) {
    await setDoc(ref, patch, { merge: true });
  }

  const freshSnap = await getDoc(ref);
  setProfile(freshSnap.data());
} else {
  setProfile(null);
}

    setLoading(false);
  });

  return () => unsub();
}, []);


  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
