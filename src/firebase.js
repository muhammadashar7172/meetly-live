import {initializeApp} from 'firebase/app';
import {
  getDatabase,ref,child,onChildAdded,onChildChanged,onChildRemoved,onValue,
  set,update,remove,push,onDisconnect
} from 'firebase/database';

/* Firebase web config — public by design; security is enforced by RTDB security rules. */
const firebaseConfig={
  apiKey:'AIzaSyAoe4O3_DhORnHba7MusTsDiNqRfkEK1oo',
  authDomain:'meetly-599b2.firebaseapp.com',
  databaseURL:'https://meetly-599b2-default-rtdb.firebaseio.com',
  projectId:'meetly-599b2',
  storageBucket:'meetly-599b2.firebasestorage.app',
  messagingSenderId:'782965548169',
  appId:'1:782965548169:web:cb6674ce61b6af450e9258',
  measurementId:'G-SVHJ5HD150'
};

const app=initializeApp(firebaseConfig);
const db=getDatabase(app);

/* One single place that touches firebase/database, so every consumer shares
   the same module instance (avoids "db._checkNotDeleted is not a function"). */
export {
  db,
  ref,child,onChildAdded,onChildChanged,onChildRemoved,onValue,
  set,update,remove,push,onDisconnect
};
