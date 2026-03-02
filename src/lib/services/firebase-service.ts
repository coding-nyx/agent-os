import { DataProviderType, TrainerProfile, Certification, Transformation, GymClass, Testimonial, BrandIdentity, TrainerSummary, LandingPageContent, PlatformTestimonial, Booking } from '../types';
import { getFirebase } from '../firebase';
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, updateDoc, Firestore, getDoc, query, where, Timestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { DEFAULT_BRAND_IDENTITY } from '../constants';

const FIREBASE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const FIREBASE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY;
const FIRESTORE_REST_BASE = FIREBASE_PROJECT_ID
  ? `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`
  : null;

type FirestoreValue = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  bytesValue?: string;
  referenceValue?: string;
  geoPointValue?: { latitude: number; longitude: number };
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

type FirestoreDocumentResponse = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

type RestDocument = {
  id: string;
  data: Record<string, any>;
};

const decodeFirestoreValue = (value?: FirestoreValue): any => {
  if (!value) return null;
  if (value.nullValue !== undefined) return null;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.bytesValue !== undefined) return value.bytesValue;
  if (value.referenceValue !== undefined) return value.referenceValue;
  if (value.geoPointValue !== undefined) return value.geoPointValue;
  if (value.arrayValue?.values) {
    return value.arrayValue.values.map((entry) => decodeFirestoreValue(entry));
  }
  if (value.mapValue?.fields) {
    return Object.entries(value.mapValue.fields).reduce<Record<string, any>>((acc, [key, val]) => {
      acc[key] = decodeFirestoreValue(val);
      return acc;
    }, {});
  }
  return null;
};

const toRestDocument = (doc: FirestoreDocumentResponse | undefined): RestDocument | null => {
  if (!doc?.fields || !doc.name) {
    return null;
  }
  const id = doc.name.split('/').pop() || '';
  const data = Object.entries(doc.fields).reduce<Record<string, any>>((acc, [key, value]) => {
    acc[key] = decodeFirestoreValue(value);
    return acc;
  }, {});
  return { id, data };
};

const fetchFirestoreDocument = async (path: string): Promise<RestDocument | null> => {
  if (!FIRESTORE_REST_BASE || !FIREBASE_API_KEY) return null;
  try {
    const url = new URL(`${FIRESTORE_REST_BASE}/${path}`);
    url.searchParams.set('key', FIREBASE_API_KEY);
    const response = await fetch(url.toString());
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      console.warn(`Firestore REST document fetch failed for ${path}`, await response.text());
      return null;
    }
    const json: FirestoreDocumentResponse = await response.json();
    return toRestDocument(json);
  } catch (e) {
    console.warn('Error fetching Firestore document via REST', e);
    return null;
  }
};

const fetchFirestoreCollection = async (path: string): Promise<RestDocument[]> => {
  if (!FIRESTORE_REST_BASE || !FIREBASE_API_KEY) return [];
  const documents: RestDocument[] = [];
  let pageToken: string | undefined = undefined;

  try {
    while (true) {
      const url = new URL(`${FIRESTORE_REST_BASE}/${path}`);
      url.searchParams.set('key', FIREBASE_API_KEY);
      url.searchParams.set('pageSize', '100');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        console.warn(`Firestore REST collection fetch failed for ${path}`, await response.text());
        break;
      }
      const json = (await response.json()) as {
        documents?: FirestoreDocumentResponse[];
        nextPageToken?: string;
      };
      if (Array.isArray(json.documents)) {
        for (const doc of json.documents) {
          const parsed = toRestDocument(doc);
          if (parsed) {
            documents.push(parsed);
          }
        }
      }
      if (!json.nextPageToken) {
        break;
      }
      pageToken = json.nextPageToken;
    }
  } catch (e) {
    console.warn('Error fetching Firestore collection via REST', e);
  }

  return documents;
};

export const fetchTrainerSlugs = async (): Promise<string[]> => {
  const docs = await fetchFirestoreCollection(ROOT_COLLECTION);
  if (!docs.length) {
    return [];
  }
  return docs.map((doc) => doc.id).filter(Boolean);
};

const ROOT_COLLECTION = 'trainers';
const PLATFORM_COLLECTION = 'platform_settings';

const COLLECTIONS = {
  PROFILE: 'profile',
  IDENTITY: 'brand_identity',
  CERTS: 'certifications',
  TRANS: 'transformations',
  CLASSES: 'classes',
  TESTIMONIALS: 'testimonials',
};

const IDENTITY_DOC_ID = 'main';

// Default values to use when data is missing or service is uninitialized
const DEFAULT_IDENTITY: BrandIdentity = DEFAULT_BRAND_IDENTITY;

const DEFAULT_PROFILE: TrainerProfile = {
    name: "New Trainer",
    bio: "",
    heroTitle: "Welcome",
    heroSubtitle: "Start your journey",
    contactEmail: "",
    contactPhone: "",
    socialLinks: [],
};

const DEFAULT_LANDING: LandingPageContent = {
    heroTitle: "UNLEASH YOUR POTENTIAL",
    heroSubtitle: "Elite personal training.",
    heroImageUrl: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2070&auto=format&fit=crop"
};

export class FirebaseDataService implements DataProviderType {
  private db: Firestore | undefined;
  private currentUser: User | null;

  constructor(user: User | null) {
    const { db } = getFirebase();
    if (!db) {
       console.warn("Firebase Firestore not available. Service is in limited mode.");
    }
    this.db = db || undefined;
    this.currentUser = user;
  }

  // Helper to ensure DB is available
  private ensureDb(): Firestore {
      if (!this.db) {
          throw new Error("Firebase Firestore is not initialized. Please check your environment variables and configuration.");
      }
      return this.db;
  }

  // Helper to determine slug for read/write
  private async getMySlug(): Promise<string> {
    if (!this.currentUser) throw new Error("Not authenticated");
    const db = this.ensureDb();

    // Super Admin Check
    if (this.currentUser.uid === 'super-admin-uid') {
        return 'platform';
    }

    // Try finding by Doc ID (UID) first for efficiency
    const docRef = doc(db, ROOT_COLLECTION, this.currentUser.uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.id;
    }

    // CREATE NEW TRAINER DOC AUTOMATICALLY using UID as Doc ID
    console.log("No trainer profile found for user. Creating one...");
    const initialSlug = `trainer-${Date.now()}`;

    // Create the document with UID as the key
    await setDoc(doc(db, ROOT_COLLECTION, this.currentUser.uid), {
        ...DEFAULT_PROFILE,
        slug: initialSlug,
        contactEmail: this.currentUser.email || "",
        ownerUid: this.currentUser.uid,
        createdAt: Timestamp.now()
    });

    // Create default identity subcollection
    await setDoc(doc(db, ROOT_COLLECTION, this.currentUser.uid, COLLECTIONS.IDENTITY, IDENTITY_DOC_ID), DEFAULT_IDENTITY);

    return this.currentUser.uid;
  }

  // --- Read ---
  getTrainers = async (): Promise<TrainerSummary[]> => {
    const restFallback = async () => {
      const docs = await fetchFirestoreCollection(ROOT_COLLECTION);
      return docs.map(({ id, data }) => ({
        slug: data.slug || id,
        name: data.name || 'Unnamed Trainer',
        heroTitle: data.heroTitle || 'Personal Trainer',
        profileImage: data.profileImageUrl,
        listImage: data.listImageUrl,
      }));
    };

    if (this.db) {
      try {
        const trainersRef = collection(this.db, ROOT_COLLECTION);
        const snapshot = await getDocs(trainersRef);

        const summaries: TrainerSummary[] = [];
        for (const docSnap of snapshot.docs) {
           const data = docSnap.data();
           summaries.push({
               slug: data.slug || docSnap.id,
               name: data.name || 'Unnamed Trainer',
               heroTitle: data.heroTitle || 'Personal Trainer',
               profileImage: data.profileImageUrl,
               listImage: data.listImageUrl
           });
        }
        return summaries;
      } catch (e) {
        console.warn("Firestore getTrainers failed, falling back to REST", e);
        return restFallback();
      }
    }

    return restFallback();
  }

  getProfile = async (slug?: string): Promise<TrainerProfile> => {
    if (!slug) return DEFAULT_PROFILE;

    const restFallback = async () => {
      // First try by ID
      const restDoc = await fetchFirestoreDocument(`${ROOT_COLLECTION}/${slug}`);
      if (restDoc?.data) {
        return { ...DEFAULT_PROFILE, ...restDoc.data, slug: restDoc.data.slug || restDoc.id } as TrainerProfile;
      }
      // Then try by slug field if needed (REST query is complex, simpler to return default for now or implement if needed)
      return DEFAULT_PROFILE;
    };

    if (this.db) {
      try {
        // Try direct ID lookup (UID or legacy slug)
        const docRef = doc(this.db, ROOT_COLLECTION, slug);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
           const data = docSnap.data();
           return { ...data, slug: data.slug || docSnap.id } as TrainerProfile;
        }

        // Try lookup by slug field
        const q = query(collection(this.db, ROOT_COLLECTION), where('slug', '==', slug));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            return { ...data, slug: data.slug || snapshot.docs[0].id } as TrainerProfile;
        }
      } catch (e) {
        console.warn("Error fetching profile via Firestore, trying REST", e);
        return restFallback();
      }
      return DEFAULT_PROFILE;
    }

    return restFallback();
  }

  getBrandIdentity = async (slug?: string): Promise<BrandIdentity> => {
    if (!slug) return DEFAULT_IDENTITY;

    const restPath = slug === 'platform'
      ? `${PLATFORM_COLLECTION}/identity`
      : `${ROOT_COLLECTION}/${slug}/${COLLECTIONS.IDENTITY}/${IDENTITY_DOC_ID}`;

    const restFallback = async () => {
      const restDoc = await fetchFirestoreDocument(restPath);
      if (restDoc?.data) {
        return { ...DEFAULT_IDENTITY, ...restDoc.data } as BrandIdentity;
      }
      return DEFAULT_IDENTITY;
    };

    if (this.db) {
      try {
        let docRef;
        if (slug === 'platform') {
          docRef = doc(this.db, PLATFORM_COLLECTION, 'identity');
        } else {
          // Resolve actual doc ID if slug is provided
          let actualId = slug;
          const q = query(collection(this.db, ROOT_COLLECTION), where('slug', '==', slug));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
              actualId = snapshot.docs[0].id;
          }
          docRef = doc(this.db, ROOT_COLLECTION, actualId, COLLECTIONS.IDENTITY, IDENTITY_DOC_ID);
        }
        const identityDoc = await getDoc(docRef);
        if (identityDoc.exists()) {
          return identityDoc.data() as BrandIdentity;
        }
      } catch (e) {
        console.warn("Error fetching identity via Firestore, trying REST", e);
        return restFallback();
      }
      return DEFAULT_IDENTITY;
    }

    return restFallback();
  }

  getLandingPageContent = async (): Promise<LandingPageContent> => {
      const restFallback = async () => {
          const restDoc = await fetchFirestoreDocument(`${PLATFORM_COLLECTION}/landing`);
          if (restDoc?.data) {
            return restDoc.data as LandingPageContent;
          }
          return DEFAULT_LANDING;
      };

      if (this.db) {
        try {
            const docRef = doc(this.db, PLATFORM_COLLECTION, 'landing');
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                return snap.data() as LandingPageContent;
            }
        } catch (e) {
            console.warn("Error fetching landing content via Firestore, trying REST", e);
            return restFallback();
        }
        return DEFAULT_LANDING;
      }
      return restFallback();
  }

  getPlatformTestimonials = async (): Promise<PlatformTestimonial[]> => {
      const restFallback = async () => {
        const docs = await fetchFirestoreCollection(`${PLATFORM_COLLECTION}/testimonials/items`);
        return docs.map(({ id, data }) => ({ id, ...data })) as PlatformTestimonial[];
      };

      if (this.db) {
        try {
            const snapshot = await getDocs(collection(this.db, PLATFORM_COLLECTION, 'testimonials', 'items'));
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlatformTestimonial));
        } catch (e) {
            console.warn("Error fetching platform testimonials via Firestore, trying REST", e);
            return restFallback();
        }
      }
      return restFallback();
  }

  getCertifications = async (slug?: string): Promise<Certification[]> => {
    if (!slug) return [];
    const restFallback = async () => {
      const docs = await fetchFirestoreCollection(`${ROOT_COLLECTION}/${slug}/${COLLECTIONS.CERTS}`);
      return docs.map(({ id, data }) => ({ id, ...data })) as Certification[];
    };

    if (this.db) {
      try {
          const snapshot = await getDocs(collection(this.db, ROOT_COLLECTION, slug, COLLECTIONS.CERTS));
          return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Certification));
      } catch (e) {
          console.warn("Error fetching certifications via Firestore, trying REST", e);
          return restFallback();
      }
    }
    return restFallback();
  }

  getTransformations = async (slug?: string): Promise<Transformation[]> => {
    if (!slug) return [];
    const restFallback = async () => {
      const docs = await fetchFirestoreCollection(`${ROOT_COLLECTION}/${slug}/${COLLECTIONS.TRANS}`);
      return docs.map(({ id, data }) => ({ id, ...data })) as Transformation[];
    };

    if (this.db) {
      try {
          const snapshot = await getDocs(collection(this.db, ROOT_COLLECTION, slug, COLLECTIONS.TRANS));
          return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transformation));
      } catch (e) {
          console.warn("Error fetching transformations via Firestore, trying REST", e);
          return restFallback();
      }
    }
    return restFallback();
  }

  getClasses = async (slug?: string): Promise<GymClass[]> => {
    if (!slug) return [];
    const restFallback = async () => {
      const docs = await fetchFirestoreCollection(`${ROOT_COLLECTION}/${slug}/${COLLECTIONS.CLASSES}`);
      return docs.map(({ id, data }) => ({ id, ...data })) as GymClass[];
    };

    if (this.db) {
      try {
          const snapshot = await getDocs(collection(this.db, ROOT_COLLECTION, slug, COLLECTIONS.CLASSES));
          return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GymClass));
      } catch (e) {
          console.warn("Error fetching classes via Firestore, trying REST", e);
          return restFallback();
      }
    }
    return restFallback();
  }

  getTestimonials = async (slug?: string): Promise<Testimonial[]> => {
    if (!slug) return [];
    const restFallback = async () => {
      const docs = await fetchFirestoreCollection(`${ROOT_COLLECTION}/${slug}/${COLLECTIONS.TESTIMONIALS}`);
      return docs.map(({ id, data }) => ({ id, ...data })) as Testimonial[];
    };

    if (this.db) {
      try {
          const snapshot = await getDocs(collection(this.db, ROOT_COLLECTION, slug, COLLECTIONS.TESTIMONIALS));
          return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Testimonial));
      } catch (e) {
          console.warn("Error fetching testimonials via Firestore, trying REST", e);
          return restFallback();
      }
    }
    return restFallback();
  }

  // --- Write (Scoped to Authenticated User) ---

  updateProfile = async (profile: TrainerProfile): Promise<void> => {
    const slug = await this.getMySlug();
    if (slug === 'platform') return;
    const db = this.ensureDb();
    await setDoc(doc(db, ROOT_COLLECTION, slug), profile, { merge: true });
  }

  updateBrandIdentity = async (identity: BrandIdentity): Promise<void> => {
    const slug = await this.getMySlug();
    const db = this.ensureDb();
    if (slug === 'platform') {
         await setDoc(doc(db, PLATFORM_COLLECTION, 'identity'), identity, { merge: true });
         return;
    }
    await setDoc(doc(db, ROOT_COLLECTION, slug, COLLECTIONS.IDENTITY, IDENTITY_DOC_ID), identity, { merge: true });
  }

  updateLandingPageContent = async (content: LandingPageContent): Promise<void> => {
      const slug = await this.getMySlug();
      const db = this.ensureDb();
      if (slug !== 'platform') throw new Error("Unauthorized");

      await setDoc(doc(db, PLATFORM_COLLECTION, 'landing'), content, { merge: true });
  }

  addPlatformTestimonial = async (t: Omit<PlatformTestimonial, 'id'>): Promise<void> => {
       const slug = await this.getMySlug();
       const db = this.ensureDb();
       if (slug !== 'platform') throw new Error("Unauthorized");
       await addDoc(collection(db, PLATFORM_COLLECTION, 'testimonials', 'items'), t);
  }

  removePlatformTestimonial = async (id: string): Promise<void> => {
      const slug = await this.getMySlug();
      const db = this.ensureDb();
      if (slug !== 'platform') throw new Error("Unauthorized");
      await deleteDoc(doc(db, PLATFORM_COLLECTION, 'testimonials', 'items', id));
  }

  addCertification = async (cert: Omit<Certification, 'id'>): Promise<void> => {
    const slug = await this.getMySlug();
    if (slug === 'platform') return;
    const db = this.ensureDb();
    await addDoc(collection(db, ROOT_COLLECTION, slug, COLLECTIONS.CERTS), cert);
  }

  updateCertification = async (id: string, updates: Partial<Certification>): Promise<void> => {
    const slug = await this.getMySlug();
    if (slug === 'platform') return;
    const db = this.ensureDb();
    await updateDoc(doc(db, ROOT_COLLECTION, slug, COLLECTIONS.CERTS, id), updates);
  }

  removeCertification = async (id: string): Promise<void> => {
    const slug = await this.getMySlug();
    if (slug === 'platform') return;
    const db = this.ensureDb();
    await deleteDoc(doc(db, ROOT_COLLECTION, slug, COLLECTIONS.CERTS, id));
  }

  addTransformation = async (trans: Omit<Transformation, 'id'>): Promise<void> => {
    const slug = await this.getMySlug();
    if (slug === 'platform') return;
    const db = this.ensureDb();
    await addDoc(collection(db, ROOT_COLLECTION, slug, COLLECTIONS.TRANS), trans);
  }

  updateTransformation = async (id: string, updates: Partial<Transformation>): Promise<void> => {
    const slug = await this.getMySlug();
    if (slug === 'platform') return;
    const db = this.ensureDb();
    await updateDoc(doc(db, ROOT_COLLECTION, slug, COLLECTIONS.TRANS, id), updates);
  }

  removeTransformation = async (id: string): Promise<void> => {
    const slug = await this.getMySlug();
    if (slug === 'platform') return;
    const db = this.ensureDb();
    await deleteDoc(doc(db, ROOT_COLLECTION, slug, COLLECTIONS.TRANS, id));
  }

  addClass = async (gymClass: Omit<GymClass, 'id'>): Promise<void> => {
    const slug = await this.getMySlug();
    if (slug === 'platform') return;
    const db = this.ensureDb();
    await addDoc(collection(db, ROOT_COLLECTION, slug, COLLECTIONS.CLASSES), gymClass);
  }

  removeClass = async (id: string): Promise<void> => {
    const slug = await this.getMySlug();
    if (slug === 'platform') return;
    const db = this.ensureDb();
    await deleteDoc(doc(db, ROOT_COLLECTION, slug, COLLECTIONS.CLASSES, id));
  }

  updateClass = async (id: string, updates: Partial<GymClass>): Promise<void> => {
    const slug = await this.getMySlug();
    if (slug === 'platform') return;
    const db = this.ensureDb();
    await updateDoc(doc(db, ROOT_COLLECTION, slug, COLLECTIONS.CLASSES, id), updates);
  }

  // Public/Client Actions
  addBooking = async (trainerSlug: string, booking: Omit<Booking, 'id'>): Promise<string> => {
      const db = this.ensureDb();
      const docRef = await addDoc(collection(db, ROOT_COLLECTION, trainerSlug, 'bookings'), booking);
      return docRef.id;
  }

  // --- AI Trainer Actions (Encrypted Storage & Guest Shadowing) ---
  getAITrainerData = async (uid: string, isShadow = false): Promise<any> => {
    const db = this.ensureDb();
    const collectionName = isShadow ? 'guest_shadows' : 'ai_trainers';
    const docRef = doc(db, collectionName, uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  }

  saveAITrainerData = async (uid: string, data: any, isShadow = false): Promise<void> => {
    const db = this.ensureDb();
    const collectionName = isShadow ? 'guest_shadows' : 'ai_trainers';
    await setDoc(doc(db, collectionName, uid), data, { merge: true });
  }

  deleteAITrainerData = async (uid: string, isShadow = false): Promise<void> => {
    const db = this.ensureDb();
    const collectionName = isShadow ? 'guest_shadows' : 'ai_trainers';
    await deleteDoc(doc(db, collectionName, uid));
  }
}
