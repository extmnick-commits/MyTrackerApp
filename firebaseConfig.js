import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBlFtO4evfY70FINL-sCS1biePPtZ22AO0",
  authDomain: "clientworktracker-f78fe.firebaseapp.com",
  databaseURL: "https://clientworktracker-f78fe-default-rtdb.firebaseio.com",
  projectId: "clientworktracker-f78fe",
  storageBucket: "clientworktracker-f78fe.firebasestorage.app",
  messagingSenderId: "483745166375",
  appId: "1:483745166375:web:e30e2052d69d237ed00a02"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export for use in your screens
export const db = getFirestore(app);
export const auth = getAuth(app);