export interface TrainerProfile {
  slug?: string;
  name: string;
  bio: string;
  heroTitle: string;
  heroSubtitle: string;
  contactEmail: string;
  contactPhone: string;
  // Deprecated single strings, keeping for compatibility if needed, but moving to socialLinks
  instagramUrl?: string;
  youtubeUrl?: string;
  socialLinks?: SocialLink[];
  profileImageUrl?: string;
  listImageUrl?: string;
  experienceYears?: number;
  experienceMonths?: number;
  clientsHandled?: number;
  clientsHandledRounded?: boolean;
}

export interface SocialLink {
    platform: 'instagram' | 'youtube' | 'facebook' | 'twitter' | 'other';
    url: string;
}

export interface TrainerSummary {
  slug: string;
  name: string;
  heroTitle: string;
  profileImage?: string;
  listImage?: string;
}

export interface Certification {
  id: string;
  title: string;
  issuer: string;
  date: string;
  imageUrl?: string;
  url?: string;
}

export interface Transformation {
  id: string;
  clientName: string;
  description: string;
  beforeImage: string;
  afterImage: string;
  // Enhanced fields
  duration?: string;
  weightLost?: string;
  muscleGained?: string;
  keyChallenges?: string;
  trainerNote?: string;
}

export interface GymClass {
  id: string;
  title: string;
  description: string;
  time: string;
  dateIso?: string; // For countdown
  price?: number; // 0 for free
  durationMinutes: number;
  maxSpots: number;
  enrolledSpots: number;
  imageUrl?: string;
}

export interface Testimonial {
  id: string;
  clientName: string;
  text: string;
  rating: number;
}

export interface PlatformTestimonial {
    id: string;
    name: string;
    testimonial: string;
    imageUrl: string;
}

export interface BrandIdentity {
  brandName: string;
  logoUrl: string;
  primaryColor: string; // Now acts as Base Color
  secondaryColor: string; // Deprecated but kept for compatibility, ignored if using auto-palette
  // New fields
  baseColor?: string; // Preferred over primaryColor if present
  themePresetId?: string;
  logoScale?: 'fit' | 'fill';
}

export interface LandingPageContent {
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string;
}

export interface DataProviderType {
  // Read
  getTrainers: () => Promise<TrainerSummary[]>;
  getProfile: (slug?: string) => Promise<TrainerProfile>;
  getBrandIdentity: (slug?: string) => Promise<BrandIdentity>;
  getCertifications: (slug?: string) => Promise<Certification[]>;
  getTransformations: (slug?: string) => Promise<Transformation[]>;
  getClasses: (slug?: string) => Promise<GymClass[]>;
  getTestimonials: (slug?: string) => Promise<Testimonial[]>;
  getLandingPageContent: () => Promise<LandingPageContent>;
  getPlatformTestimonials: () => Promise<PlatformTestimonial[]>;

  // Write (Admin)
  updateProfile: (profile: TrainerProfile) => Promise<void>;
  updateBrandIdentity: (identity: BrandIdentity) => Promise<void>;
  addCertification: (cert: Omit<Certification, 'id'>) => Promise<void>;
  updateCertification: (id: string, cert: Partial<Certification>) => Promise<void>;
  removeCertification: (id: string) => Promise<void>;
  addTransformation: (trans: Omit<Transformation, 'id'>) => Promise<void>;
  updateTransformation: (id: string, trans: Partial<Transformation>) => Promise<void>;
  removeTransformation: (id: string) => Promise<void>;
  addClass: (gymClass: Omit<GymClass, 'id'>) => Promise<void>;
  removeClass: (id: string) => Promise<void>;
  updateClass: (id: string, gymClass: Partial<GymClass>) => Promise<void>;
  updateLandingPageContent: (content: LandingPageContent) => Promise<void>;
  addPlatformTestimonial: (t: Omit<PlatformTestimonial, 'id'>) => Promise<void>;
  removePlatformTestimonial: (id: string) => Promise<void>;

  // Public/Client Actions
  addBooking: (trainerSlug: string, booking: Omit<Booking, 'id'>) => Promise<string>;
}

export interface Booking {
    id: string;
    classId: string;
    classTitle: string;
    classDate?: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    status: 'pending' | 'confirmed' | 'cancelled';
    paymentId?: string;
    userId?: string;
    createdAt: string; // ISO String
}

export interface Supplement {
  id: string;
  name: string;
  category: string;
  brand?: string;
  dosage?: string;
  frequency?: string;
  isConsistent?: boolean;
}

export interface PhysicalInsight {
  date: string;
  type: 'pr' | 'injury' | 'recovery' | 'physiology' | 'identity';
  content: string;
  source: 'conversation' | 'metric';
}

export interface IdentityContext {
  genderIdentity: string;
  assignedAtBirth?: 'female' | 'male';
  preferredCoachingStyle: 'aggressive' | 'clinical' | 'empathetic';
  identityNotes?: string;
  lastUpdated: string;
}

export interface PhysicalSoul {
  insights: PhysicalInsight[];
  biometricTrends: {
    weightTrend: 'up' | 'down' | 'stable';
    avgSleep: number;
    intensityBias: number; // 1-10 (how hard they usually push)
  };
  identity: IdentityContext;
  lastCompactionDate?: string;
}

export interface AITrainerProfile {
  name: string;
  gender: 'female' | 'male' | 'non-binary' | string;
  assignedAtBirth?: 'female' | 'male';
  traits: string[];
  goals: string[];
  baselineWeight?: number;
  baselineHeight?: number;
  supplements?: Supplement[];
  onboardingComplete?: boolean;
  trackingLevel?: 'standard' | 'indepth';
  soul?: PhysicalSoul; // The "Titan Engine" Soul
}

export interface HealthDataLog {
  date: string; // YYYY-MM-DD
  weight?: number;
  sleepHours?: number;
  waterIntakeLiters?: number;
  dietQuality?: number; // 1-10
  trainingIntensity?: number; // 1-10
  stressLevel?: number; // 1-10
  sexFactors?: boolean;
  // Biological
  testosteroneLevel?: number; // ng/dL
  estrogenLevel?: number; // pg/mL
  menstrualCycleDay?: number; // 1-28
  menstrualPhase?: 'follicular' | 'ovulation' | 'luteal' | 'menstrual';
  // Psychological & Performance
  moodScore?: number; // 1-10
  moodNotes?: string;
  strengthTrend?: 'up' | 'down' | 'stable';
  cnsFatigueScore?: number; // 1-10
  // Intimate
  sexualActivityCount?: number; // in last 24h
  masturbationCount?: number; // in last 24h
  // Supplements
  supplementsTakenToday?: string[]; // array of Supplement IDs
}

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  rpe?: number;
  intensity?: string;
  notes?: string;
}

export interface Routine {
  id: string;
  timeframe: 'daily' | 'weekly';
  status: 'proposed' | 'active';
  rationale: string;
  date: string; // YYYY-MM-DD
  exercises: Exercise[];
}

// Keeping for legacy compatibility if needed, but transitioning to Routine
export interface WorkoutPlan {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  exercises: Exercise[];
  completed: boolean;
}
