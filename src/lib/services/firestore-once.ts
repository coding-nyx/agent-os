import { DocumentReference, DocumentSnapshot, getDoc } from 'firebase/firestore';

export function readDocOnce<T>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  return getDoc(ref);
}
