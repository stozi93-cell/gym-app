import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";

/**
 * Returns total unread messages count
 * - client: sum of clientUnread
 * - admin/coach: sum of coachUnread
 */
export function useUnreadCount() {
  const { user, profile } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user || !profile?.role) {
      setCount(0);
      return;
    }

    let q;

    if (profile.role === "client") {
      // Client: only their conversation
      q = query(
        collection(db, "conversations"),
        where("clientId", "==", user.uid)
      );
    } else {
      // Admin / coach: conversations assigned to them
      q = query(
        collection(db, "conversations"),
        where("coachId", "==", user.uid)
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      let total = 0;

      snap.docs.forEach((d) => {
        const data = d.data();

        if (profile.role === "client") {
          total += data.clientUnread || 0;
        } else {
          total += data.coachUnread || 0;
        }
      });

      setCount(total);
    });

    return () => unsub();
  }, [user?.uid, profile?.role]);

  return count;
}
