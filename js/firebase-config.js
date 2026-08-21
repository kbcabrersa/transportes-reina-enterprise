import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

const firebaseConfig = {
  projectId: "transportes-reina",
  appId: "1:741001866026:web:64cb75142d1d2d50054c53",
  storageBucket: "transportes-reina.firebasestorage.app",
  apiKey: "AIzaSyAJ9dZMMe6MTVRe_2UWkpK6ZlRkuo0epY4",
  authDomain: "transportes-reina.firebaseapp.com",
  messagingSenderId: "741001866026",
  measurementId: "G-W14JYGXVY3"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, "default");
export const auth = getAuth(app);
export const storage = getStorage(app);

export default app;
