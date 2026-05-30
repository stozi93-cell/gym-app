import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const callCheckInBooking = httpsCallable(functions, "checkInBooking");

export async function checkInBooking(bookingId) {
  const result = await callCheckInBooking({ bookingId });
  return result.data;
}

