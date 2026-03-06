import { DocumentReference, DocumentSnapshot, onSnapshot } from 'firebase/firestore';

export function readDocOnce<T>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  return new Promise((resolve, reject) => {
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        unsubscribe();
        resolve(snap);
      },
      (error) => {
        unsubscribe();
        reject(error);
      }
    );
  });
}
