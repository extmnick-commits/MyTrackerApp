import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your NEW Firebase configuration for estevandata
const firebaseConfig = {
  apiKey: "AIzaSyBlFtO4evfY70FINL-sCS1biePPtZ22AO0", 
  authDomain: "estevandata.firebaseapp.com",
  projectId: "estevandata", // Must be all lowercase
  storageBucket: "estevandata.firebasestorage.app",
  messagingSenderId: "483745166375", 
  appId: "1:483745166375:web:e30e2052d69d237ed00a02" 
};

const app = initializeApp(firebaseConfig);

// EXPORT these so they can be used in your screens
export const db = getFirestore(app);
export const auth = getAuth(app);