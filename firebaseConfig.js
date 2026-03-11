import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBIYsTWO-GGmkNlpALCaoCTAE_TDkoHoYI",
  authDomain: "estevanmytrackerapp.firebaseapp.com",
  projectId: "estevanmytrackerapp",
  storageBucket: "estevanmytrackerapp.firebasestorage.app",
  messagingSenderId: "578894218502",
  appId: "1:578894218502:web:15ee3a1cef18bf96ff0a87"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Use initializeAuth with persistence to fix the session error
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});