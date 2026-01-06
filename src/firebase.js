import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCzIFe3t8HT8QXJSrwaZhB0aLlUsn3HpPk",
  authDomain: "gym-booking-a75f8.firebaseapp.com",
  projectId: "gym-booking-a75f8",
  storageBucket: "gym-booking-a75f8.firebasestorage.app",
  messagingSenderId: "489815738954",
  appId: "1:489815738954:web:3a8fa96e3cfe65f5dbb4b3"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
