import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";

export async function saveFcmToken(uid, token) {
  if (!uid || !token) return;

  await updateDoc(doc(db, "users", uid), {
    fcmTokens: arrayUnion(token),
  });
}
