import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your NEW Firebase configuration for estevanmytrackerapp
const firebaseConfig = {
  apiKey: "AIzaSyBIYsTWO-GGmkNlpALCaoCTAE_TDkoHoYI",
  authDomain: "estevanmytrackerapp.firebaseapp.com",
  projectId: "estevanmytrackerapp",
  storageBucket: "estevanmytrackerapp.firebasestorage.app",
  messagingSenderId: "578894218502",
  appId: "1:578894218502:web:15ee3a1cef18bf96ff0a87"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// EXPORT these so they can be used in your screens
export const db = getFirestore(app);
export const auth = getAuth(app);