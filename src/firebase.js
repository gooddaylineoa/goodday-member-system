import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBewLVeVkpe8Bh5Gm0RuOVAp27aHFkPgQ8",
  authDomain: "goodday-members.firebaseapp.com",
  projectId: "goodday-members",
  storageBucket: "goodday-members.firebasestorage.app",
  messagingSenderId: "30572263082",
  appId: "1:30572263082:web:4a77979e77c3b4f49c82d3",
  measurementId: "G-HDR86BDFL3"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
