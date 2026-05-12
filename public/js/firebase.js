import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  addDoc,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBg1vWNwtLXbXHxpSUecCs0yCRdhlG1lhY',
  authDomain: 'cata-vinos-e3c60.firebaseapp.com',
  projectId: 'cata-vinos-e3c60',
  storageBucket: 'cata-vinos-e3c60.firebasestorage.app',
  messagingSenderId: '784884806257',
  appId: '1:784884806257:web:d956063f95ff1b9d36e1d0',
};

const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);

export { doc, setDoc, getDoc, onSnapshot, collection, addDoc, getDocs };
