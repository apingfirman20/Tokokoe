import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useStore } from '../store/useStore';

export const initFirebaseSync = () => {
  // Hanya jalankan jika di browser dan db terinisialisasi
  if (!db) return;

  const collections = ['branches', 'users', 'products', 'transactions', 'shifts', 'stockMovements', 'stockTransfers', 'activityLogs'];

  const unsubscribes = collections.map(col => {
    return onSnapshot(collection(db, col), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Update state di Zustand sesuai koleksi
      useStore.setState((state) => ({
        ...state,
        [col]: data
      }));
    });
  });

  return () => {
    unsubscribes.forEach(unsub => unsub());
  };
};

// Generic Helpers
export const firestoreService = {
  add: async (col: string, data: any, id?: string) => {
    try {
      const docRef = id ? doc(db, col, id) : doc(collection(db, col));
      const finalData = id ? data : { ...data, id: docRef.id };
      await setDoc(docRef, finalData);
      return docRef.id;
    } catch (error) {
      console.error(`Error adding to ${col}:`, error);
      throw error;
    }
  },
  
  update: async (col: string, id: string, data: any) => {
    try {
      await updateDoc(doc(db, col, id), data);
    } catch (error) {
      console.error(`Error updating ${col}:`, error);
      throw error;
    }
  },
  
  delete: async (col: string, id: string) => {
    try {
      await deleteDoc(doc(db, col, id));
    } catch (error) {
      console.error(`Error deleting from ${col}:`, error);
      throw error;
    }
  }
};
