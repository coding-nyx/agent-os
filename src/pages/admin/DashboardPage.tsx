'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-provider';
import { TrainerProfile, GymClass, Certification, Transformation, BrandIdentity, LandingPageContent, PlatformTestimonial, SocialLink } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Link } from 'react-router-dom';
import { Trash2, Plus, Save, Upload, ExternalLink, Globe, Loader2, Sun, Moon, Pencil, X, User, Image as ImageIcon, Calendar, Clock, Users, DollarSign, Eye } from 'lucide-react';
import { getFirebase } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAlert } from '@/components/ui/custom-alert';
import { BootLoader } from '@/components/ui/boot-loader';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '@/components/ThemeContext';
import { THEME_PRESETS } from '@/lib/theme-presets';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

// New Reusable Image Upload Component with Progress
function ImageUpload({ 
    value, 
    onChange, 
    onUpload, 
    onDelete,
    className = "", 
    previewClass = "w-full h-full object-cover",
    placeholder = <Upload className="h-5 w-5 text-muted-foreground/30" />
}: { 
    value?: string; 
    onChange: (url: string) => void; 
    onUpload: (file: File) => Promise<string>;
    onDelete?: () => void;
    className?: string;
    previewClass?: string;
    placeholder?: React.ReactNode;
}) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    const handleUpload = async (file: File) => {
        setUploading(true);
        setProgress(0);
        
        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 90) return prev;
                return prev + 10;
            });
        }, 100);

        try {
            const url = await onUpload(file);
            clearInterval(timer);
            setProgress(100);
            onChange(url);
        } catch (error) {
            console.error("Upload failed", error);
        } finally {
            setTimeout(() => {
                setUploading(false);
                setProgress(0);
            }, 500);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleUpload(file);
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            handleUpload(file);
        }
    };

    return (
        <div 
            className={`relative group transition-all duration-200 ${className} ${isDragging ? 'scale-[1.02]' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            <div className={`w-full h-full overflow-hidden border-2 bg-muted/50 flex items-center justify-center relative transition-colors ${isDragging ? 'border-primary border-solid bg-primary/5' : 'border-dashed border-border/60'} ${previewClass.includes('rounded') ? '' : 'rounded-md'}`}>
                {value ? (
                    <img src={value} alt="Preview" className={`${previewClass} transition-opacity ${isDragging ? 'opacity-20' : 'opacity-100'}`} />
                ) : (
                    <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                        {uploading ? (
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                <span className="text-xs font-medium text-muted-foreground">{progress}%</span>
                            </div>
                        ) : (
                            <div className={`flex flex-col items-center transition-transform ${isDragging ? 'scale-110' : ''}`}>
                                {placeholder}
                                {isDragging && <span className="text-xs font-bold text-primary mt-2">Drop to upload</span>}
                            </div>
                        )}
                    </div>
                )}
                
                {/* Overlay for uploading state */}
                {uploading && (
                    <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10">
                        <div className="w-16 h-16 relative flex items-center justify-center">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                <path className="text-muted-foreground/20" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                                <path className="text-primary transition-all duration-300 ease-out" strokeDasharray={`${progress}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                            </svg>
                            <Loader2 className="h-5 w-5 animate-spin text-primary absolute" />
                        </div>
                    </div>
                )}

                {/* Drop Zone Overlay */}
                {isDragging && !uploading && (
                    <div className="absolute inset-0 bg-primary/10 border-2 border-primary border-solid flex items-center justify-center z-20 pointer-events-none animate-in fade-in zoom-in-95">
                        <Upload className="h-10 w-10 text-primary animate-bounce" />
                    </div>
                )}

                {/* Actions Overlay (When Image Exists) */}
                {!uploading && !isDragging && value && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3 z-30">
                        <label className="flex items-center justify-center bg-background/90 hover:bg-background text-foreground px-3 py-1.5 rounded-lg cursor-pointer transition-all border border-border shadow-lg hover:scale-105 active:scale-95">
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            <span className="text-[11px] font-bold uppercase tracking-wider">Edit</span>
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                        </label>
                        {onDelete && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                className="flex items-center justify-center bg-destructive/90 hover:bg-destructive text-destructive-foreground px-3 py-1.5 rounded-lg transition-all border border-destructive/20 shadow-lg hover:scale-105 active:scale-95"
                            >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                <span className="text-[11px] font-bold uppercase tracking-wider">Delete</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Simple Click-to-Upload (When No Image) */}
                {!uploading && !isDragging && !value && (
                    <label className="absolute inset-0 cursor-pointer z-20">
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                )}
            </div>
        </div>
    );
}

function NavbarPreview({ logoUrl, brandName, logoScale = 'fit' }: { logoUrl?: string; brandName: string; logoScale?: 'fit' | 'fill' }) {
    const initial = brandName.trim().charAt(0).toUpperCase() || 'P';
    const objectClass = logoScale === 'fill' ? 'object-cover' : 'object-contain';

    return (
        <div className="w-full border rounded-lg bg-background/95 backdrop-blur p-4 mb-4">
            <Label className="mb-2 block">Navbar Preview</Label>
            <div className="flex items-center space-x-3 font-bold text-xl uppercase tracking-tighter">
                {logoUrl ? (
                    <div className="h-10 w-10 flex items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-background shadow-sm">
                        <img src={logoUrl} alt={brandName} className={`h-full w-full ${objectClass} p-0.5`} />
                    </div>
                ) : (
                    <div className="relative h-10 w-10 flex items-center justify-center">
                        <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 44 44">
                            <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted-foreground/20" />
                            <circle
                                cx="22" cy="22" r="18"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                className="text-primary"
                                style={{ strokeDasharray: 2 * Math.PI * 18, strokeDashoffset: 2 * Math.PI * 18 * 0.25 }}
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xl font-black italic -rotate-6 text-foreground select-none">
                                {initial}
                            </span>
                        </div>
                    </div>
                )}
                <span className="transition-colors text-primary">
                    {brandName || 'Brand Name'}
                </span>
            </div>
        </div>
    );
}

function ProfileImageSettings({ profile, setProfile, uploadImage }: { profile: TrainerProfile, setProfile: (p: TrainerProfile) => void, uploadImage: (file: File, path: string) => Promise<string> }) {
    const { showConfirm } = useAlert();
    return (
        <div className="space-y-6 mb-8 p-6 pb-10 border rounded-xl bg-muted/30 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 border-b border-border/50 pb-3">
                <ImageIcon className="h-5 w-5 text-primary" /> Image Assets
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-3">
                    <Label className="text-sm font-semibold">Portfolio Portrait</Label>
                    <ImageUpload 
                        value={profile.profileImageUrl} 
                        onChange={(url) => setProfile({...profile, profileImageUrl: url})}
                        onUpload={(file) => uploadImage(file, `profiles/main_${Date.now()}`)}
                        onDelete={() => showConfirm('Delete Portrait', 'Are you sure you want to remove your portfolio portrait?', () => setProfile({...profile, profileImageUrl: ''}))}
                        className="w-full aspect-[4/3] lg:aspect-square max-h-[300px]"
                        previewClass="w-full h-full object-cover rounded-lg"
                        placeholder={<div className="flex flex-col items-center"><Upload className="h-8 w-8 text-muted-foreground/50 mb-2" /><span className="text-xs text-muted-foreground">Upload Portrait</span></div>}
                    />
                </div>
                <div className="space-y-3">
                    <Label className="text-sm font-semibold">Directory Spotlight</Label>
                    <ImageUpload 
                        value={profile.listImageUrl} 
                        onChange={(url) => setProfile({...profile, listImageUrl: url})}
                        onUpload={(file) => uploadImage(file, `profiles/list_${Date.now()}`)}
                        onDelete={() => showConfirm('Delete Spotlight', 'Are you sure you want to remove your directory spotlight image?', () => setProfile({...profile, listImageUrl: ''}))}
                        className="w-full aspect-[4/3] lg:aspect-square max-h-[300px]"
                        previewClass="w-full h-full object-cover rounded-lg"
                        placeholder={<div className="flex flex-col items-center"><Upload className="h-8 w-8 text-muted-foreground/50 mb-2" /><span className="text-xs text-muted-foreground">Upload Spotlight Image</span></div>}
                    />
                </div>
            </div>
        </div>
    );
}

function TrainerSidebar({ profile }: { profile: TrainerProfile }) {
    return (
        <Card className="h-fit sticky top-24">
            <CardContent className="pt-6 flex flex-col items-center text-center">
                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-primary/10 mb-4 shadow-lg">
                    {profile.profileImageUrl ? (
                        <img src={profile.profileImageUrl} alt={profile.name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                            <User className="h-12 w-12 text-muted-foreground/50" />
                        </div>
                    )}
                </div>
                <h2 className="text-xl font-bold mb-1">{profile.name || "Your Name"}</h2>
                <p className="text-sm text-primary font-medium uppercase tracking-widest mb-4">{profile.heroTitle || "Title"}</p>
                
                <div className="w-full space-y-2 text-sm text-muted-foreground text-left mt-4 pt-4 border-t border-border/50">
                    <div className="flex justify-between">
                        <span>Experience</span>
                        <span className="font-semibold text-foreground">{profile.experienceYears || 0} Years</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Clients</span>
                        <span className="font-semibold text-foreground">{profile.clientsHandled || 0}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function PublicClassPreview({ gymClass }: { gymClass: GymClass }) {
    return (
        <div className="p-4 bg-muted/10 rounded-xl border border-dashed border-border flex items-center justify-center">
            <div className="w-full max-w-[350px]">
                <Card className="h-full flex flex-col bg-background border border-border shadow-md">
                    <CardHeader className="pb-4">
                        <div className="flex justify-between items-start mb-2">
                            <Badge variant="secondary" className="bg-muted text-foreground/80 font-semibold">{gymClass.time.split(' ')[0]}</Badge>
                            <Badge variant="outline">
                                {gymClass.maxSpots} Spots Left
                            </Badge>
                        </div>
                        <CardTitle className="text-xl">{gymClass.title}</CardTitle>
                        <CardDescription className="line-clamp-2">{gymClass.description}</CardDescription>
                    </CardHeader>
                    {gymClass.imageUrl && (
                        <div className="px-6 pb-4">
                            <img src={gymClass.imageUrl} alt={gymClass.title} className="w-full h-32 object-cover rounded-md border" />
                        </div>
                    )}
                    <CardContent className="flex-grow space-y-3 pb-6">
                        <div className="flex items-center text-xs font-medium text-muted-foreground">
                            <Clock className="mr-2 h-3.5 w-3.5 text-primary" />
                            {gymClass.time} ({gymClass.durationMinutes} mins)
                        </div>
                        <div className="flex items-center text-xs font-medium text-muted-foreground">
                            <Users className="mr-2 h-3.5 w-3.5 text-primary" />
                            Capacity: {gymClass.maxSpots}
                        </div>
                        <div className="flex items-center text-xs font-bold text-foreground">
                            <DollarSign className="mr-2 h-3.5 w-3.5 text-primary" />
                            {gymClass.price ? `$${gymClass.price}` : 'Free'}
                        </div>
                    </CardContent>
                    <CardFooter className="pt-0">
                        <Button className="w-full" size="sm">Book Class</Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}

export default function DashboardPage() {
  const { isAuthenticated, logout, trainerSlug, user, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const {
    getProfile, updateProfile,
    getBrandIdentity, updateBrandIdentity,
    getClasses, addClass, removeClass, updateClass,
    getCertifications, addCertification, updateCertification, removeCertification,
    getTransformations, addTransformation, updateTransformation, removeTransformation,
    getLandingPageContent, updateLandingPageContent,
    getPlatformTestimonials, addPlatformTestimonial, removePlatformTestimonial
  } = useData();

  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [identity, setIdentity] = useState<BrandIdentity | null>(null);
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [editingClass, setEditingClass] = useState<GymClass | null>(null);
  const [editingCert, setEditingCert] = useState<Certification | null>(null);
  const [editingTrans, setEditingTrans] = useState<Transformation | null>(null);
  const [isPaidAdd, setIsPaidAdd] = useState(false);
  const [isPaidEdit, setIsPaidEdit] = useState(false);
  
  // Loading states
  const [isAddingClass, setIsAddingClass] = useState(false);
  const [isAddingCert, setIsAddingCert] = useState(false);
  const [isAddingTrans, setIsAddingTrans] = useState(false);
  const [isAddingTestimonial, setIsAddingTestimonial] = useState(false);

  useEffect(() => {
    if (editingClass) {
        setIsPaidEdit(!!editingClass.price && editingClass.price > 0);
    }
  }, [editingClass]);

  const [certs, setCerts] = useState<Certification[]>([]);
  const [trans, setTrans] = useState<Transformation[]>([]);
  const [landing, setLanding] = useState<LandingPageContent | null>(null);
  const [testimonials, setTestimonials] = useState<PlatformTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showAlert, showConfirm } = useAlert();

  // Track active tab to update page title logic
  const [activeTab, setActiveTab] = useState<string>('landing');
  const [trainerActiveTab, setTrainerActiveTab] = useState<string>('profile');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin/login');
      return;
    }

    if (!trainerSlug && !user) return; // Wait for auth

    const loadData = async () => {
      if (isSuperAdmin) {
          const [l, i, t] = await Promise.all([
              getLandingPageContent(),
              getBrandIdentity('platform'),
              getPlatformTestimonials()
          ]);
          setLanding(l);
          setIdentity(i);
          setTestimonials(t);
      } else {
        const targetSlug = trainerSlug || undefined;

        const [p, i, c, cer, t] = await Promise.all([
            getProfile(targetSlug),
            getBrandIdentity(targetSlug),
            getClasses(targetSlug),
            getCertifications(targetSlug),
            getTransformations(targetSlug)
        ]);
        setProfile(p);
        setIdentity(i);
        setClasses(c);
        setCerts(cer);
        setTrans(t);
      }
      setLoading(false);
    };
    loadData();
  }, [isAuthenticated, navigate, isSuperAdmin, trainerSlug, user, getProfile, getBrandIdentity, getClasses, getCertifications, getTransformations, getLandingPageContent, getPlatformTestimonials]);

  // Update Document Title based on identity and active tab
  useEffect(() => {
      // Prioritize identity.brandName, fallback to profile.name only if it's set and not default,
      // otherwise use generic fallback.
      const brandName = identity?.brandName || 'MyBrand';

      if (isSuperAdmin) {
          let section = 'Dashboard';
          if (activeTab === 'landing') section = 'Landing Page';
          if (activeTab === 'testimonials') section = 'Testimonials';
          if (activeTab === 'identity') section = 'Identity';
          document.title = `${brandName} - ${section}`;
      } else {
          // Explicitly handle "New Trainer" or undefined profile
          const trainerName = profile?.name && profile.name !== "New Trainer"
              ? profile.name
              : 'Trainer Portal';

          document.title = `${brandName} | ${trainerName}`;
      }
  }, [identity, profile, activeTab, isSuperAdmin]);

  const isNewProfile = profile?.name === "New Trainer";

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
        if (profile) {
          await updateProfile(profile);
          showAlert('Success', 'Profile updated!');
        }
    } catch (e) {
        showAlert('Error', 'Failed to update profile.');
    } finally {
        setSaving(false);
    }
  };

  const handleIdentitySave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
        if (identity) {
          await updateBrandIdentity(identity);
          if (profile && !isSuperAdmin) {
             await updateProfile(profile);
          }
          showAlert('Success', 'Brand Identity updated!');
        }
    } catch (e) {
        showAlert('Error', 'Failed to update identity.');
    } finally {
        setSaving(false);
    }
  };

  const handleLandingSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
        if (landing) {
            await updateLandingPageContent(landing);
            showAlert('Success', 'Landing Page updated!');
        }
    } catch (e) {
        showAlert('Error', 'Failed to update landing page.');
    } finally {
        setSaving(false);
    }
  };

  const uploadImage = async (file: File, path: string): Promise<string> => {
    const { storage } = getFirebase();
    if (!storage) {
        console.warn("Firebase Storage not available. Using fake URL.");
        return URL.createObjectURL(file);
    }
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  const handleAddClass = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsAddingClass(true);
    const form = e.currentTarget;
    try {
        const formData = new FormData(form);
        const dateValue = formData.get('time') as string;
        const date = new Date(dateValue);

        // Format for display: e.g. "Mon 10:00 AM"
        const displayTime = date.toLocaleDateString('en-US', {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }).replace(',', '');

        const isPaid = formData.get('isPaid') === 'on';
        const price = isPaid ? parseFloat(formData.get('price') as string || '0') : 0;

        await addClass({
          title: formData.get('title') as string,
          description: formData.get('description') as string,
          time: displayTime,
          dateIso: date.toISOString(),
          price: price,
          durationMinutes: parseInt(formData.get('duration') as string),
          maxSpots: parseInt(formData.get('spots') as string),
          enrolledSpots: 0,
          imageUrl: formData.get('imageUrl') as string || undefined
        });
        setClasses(await getClasses(trainerSlug || undefined));
        form.reset();
        setIsPaidAdd(false);
    } catch (error) {
        console.error("Failed to add class", error);
        showAlert('Error', 'Failed to add class. Please try again.');
    } finally {
        setIsAddingClass(false);
    }
  };

  const handleUpdateClass = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingClass) return;

    const formData = new FormData(e.currentTarget);
    const dateValue = formData.get('time') as string;
    const date = new Date(dateValue);
    
    // Format for display: e.g. "Mon 10:00 AM"
    const displayTime = date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
    }).replace(',', '');

    const isPaid = formData.get('isPaid') === 'on';
    const price = isPaid ? parseFloat(formData.get('price') as string || '0') : 0;

    await updateClass(editingClass.id, {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      time: displayTime,
      dateIso: date.toISOString(),
      price: price,
      durationMinutes: parseInt(formData.get('duration') as string),
      maxSpots: parseInt(formData.get('spots') as string),
      imageUrl: formData.get('imageUrl') as string || undefined
    });
    
    setClasses(await getClasses(trainerSlug || undefined));
    setEditingClass(null);
  };

  const handleUpdateCert = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCert) return;
    setSaving(true);
    try {
        const formData = new FormData(e.currentTarget);
        await updateCertification(editingCert.id, {
            title: formData.get('title') as string,
            issuer: formData.get('issuer') as string,
            date: formData.get('date') as string,
            url: formData.get('url') as string || undefined,
            imageUrl: formData.get('imageUrl') as string || undefined,
        });
        setCerts(await getCertifications(trainerSlug || undefined));
        setEditingCert(null);
    } catch (error) {
        console.error("Failed to update cert", error);
        showAlert('Error', 'Failed to update certification. Please try again.');
    } finally {
        setSaving(false);
    }
  };

  const handleAddCert = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsAddingCert(true);
    const form = e.currentTarget;
    try {
        const formData = new FormData(form);
        await addCertification({
          title: formData.get('title') as string,
          issuer: formData.get('issuer') as string,
          date: formData.get('date') as string,
          url: formData.get('url') as string || undefined,
          imageUrl: formData.get('imageUrl') as string || undefined,
        });
        setCerts(await getCertifications(trainerSlug || undefined));
        form.reset();
    } catch (error) {
        console.error("Failed to add cert", error);
        showAlert('Error', 'Failed to add certification. Please try again.');
    } finally {
        setIsAddingCert(false);
    }
  };

  const handleUpdateTrans = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTrans) return;
    setSaving(true);
    try {
        const formData = new FormData(e.currentTarget);
        await updateTransformation(editingTrans.id, {
            clientName: formData.get('clientName') as string,
            description: formData.get('description') as string,
            beforeImage: formData.get('beforeImage') as string,
            afterImage: formData.get('afterImage') as string,
            duration: formData.get('duration') as string || undefined,
            weightLost: formData.get('weightLost') as string || undefined,
            muscleGained: formData.get('muscleGained') as string || undefined,
            keyChallenges: formData.get('keyChallenges') as string || undefined,
            trainerNote: formData.get('trainerNote') as string || undefined,
        });
        setTrans(await getTransformations(trainerSlug || undefined));
        setEditingTrans(null);
    } catch (error) {
        console.error("Failed to update transformation", error);
        showAlert('Error', 'Failed to update transformation. Please try again.');
    } finally {
        setSaving(false);
    }
  };

  const handleAddTrans = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsAddingTrans(true);
    const form = e.currentTarget;
    try {
        const formData = new FormData(form);
        await addTransformation({
          clientName: formData.get('clientName') as string,
          description: formData.get('description') as string,
          beforeImage: formData.get('beforeImage') as string,
          afterImage: formData.get('afterImage') as string,
          duration: formData.get('duration') as string || undefined,
          weightLost: formData.get('weightLost') as string || undefined,
          muscleGained: formData.get('muscleGained') as string || undefined,
          keyChallenges: formData.get('keyChallenges') as string || undefined,
          trainerNote: formData.get('trainerNote') as string || undefined,
        });
        setTrans(await getTransformations(trainerSlug || undefined));
        form.reset();
    } catch (error) {
        console.error("Failed to add transformation", error);
        showAlert('Error', 'Failed to add transformation. Please try again.');
    } finally {
        setIsAddingTrans(false);
    }
  };

  const handleAddTestimonial = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setIsAddingTestimonial(true);
      const form = e.currentTarget;
      try {
          const formData = new FormData(form);
          await addPlatformTestimonial({
              name: formData.get('name') as string,
              testimonial: formData.get('testimonial') as string,
              imageUrl: formData.get('imageUrl') as string
          });
          setTestimonials(await getPlatformTestimonials());
          form.reset();
      } catch (error) {
        console.error("Failed to add testimonial", error);
        showAlert('Error', 'Failed to add testimonial. Please try again.');
      } finally {
        setIsAddingTestimonial(false);
      }
  };

    if (loading) return (
      <AnimatePresence>
        <BootLoader />
      </AnimatePresence>
    );

  // Helper to count social links
  const countLinks = (platform: SocialLink['platform']) => {
      return profile?.socialLinks?.filter(l => l.platform === platform).length || 0;
  };

  return (
    <div className="min-h-screen bg-muted/10">
      {/* Header */}
      <header className="bg-background border-b border-border/50 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
           <h1 className="text-2xl font-bold">
               {isSuperAdmin ? 'Platform Admin' : 'Trainer Dashboard'}
           </h1>
           {!isSuperAdmin && trainerSlug && (
             <Button variant="ghost" size="sm" asChild>
               <Link to={`/t/${trainerSlug}`} target="_blank">
                 View My Page <ExternalLink className="ml-2 h-4 w-4" />
               </Link>
             </Button>
           )}
           {isSuperAdmin && (
             <Button variant="ghost" size="sm" asChild>
               <Link to="/" target="_blank">
                 View Platform <Globe className="ml-2 h-4 w-4" />
               </Link>
             </Button>
           )}
        </div>
        <div className="flex items-center gap-4">
           <span className="text-sm text-muted-foreground hidden md:inline-block">Logged in as {user?.email}</span>
           <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
           </Button>
           <Button variant="outline" onClick={() => { logout(); navigate('/admin/login'); }}>Logout</Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">

        {isSuperAdmin ? (
            // SUPER ADMIN VIEW
            <Tabs defaultValue="landing" onValueChange={setActiveTab}>
                <TabsList className="mb-8">
                    <TabsTrigger value="landing">Landing Page</TabsTrigger>
                    <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
                    <TabsTrigger value="identity">Global Identity</TabsTrigger>
                </TabsList>

                <TabsContent value="landing">
                    <Card>
                        <CardHeader>
                            <CardTitle>Landing Page Content</CardTitle>
                            <CardDescription>Edit the main hero section of the home page.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {landing && (
                                <form onSubmit={handleLandingSave} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Hero Title</Label>
                                        <Input value={landing.heroTitle} onChange={e => setLanding({...landing, heroTitle: e.target.value})} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Hero Subtitle</Label>
                                        <Input value={landing.heroSubtitle} onChange={e => setLanding({...landing, heroSubtitle: e.target.value})} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Hero Image URL</Label>
                                        <ImageUpload 
                                            value={landing.heroImageUrl} 
                                            onChange={(url) => setLanding({...landing, heroImageUrl: url})}
                                            onUpload={(file) => uploadImage(file, `platform/hero_${Date.now()}`)}
                                            className="w-full h-[300px]"
                                            previewClass="w-full h-full object-cover rounded-lg"
                                            placeholder={<div className="flex flex-col items-center"><Upload className="h-10 w-10 text-muted-foreground/50 mb-2" /><span className="text-sm text-muted-foreground">Upload Hero Banner</span></div>}
                                        />
                                    </div>
                                    <Button type="submit" className="w-full" disabled={saving}>
                                        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Landing Page</>}
                                    </Button>
                                </form>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="testimonials">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <Card className="md:col-span-1 h-fit">
                            <CardHeader>
                                <CardTitle>Add Testimonial</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleAddTestimonial} className="space-y-4">
                                    <Input name="name" placeholder="Client Name" required />
                                    <Textarea name="testimonial" placeholder="Testimonial text" required />
                                    <div className="space-y-2">
                                       <Label>Client Image</Label>
                                       <ImageUpload 
                                            onChange={(url) => {
                                                const input = document.getElementsByName('imageUrl')[0] as HTMLInputElement;
                                                if (input) input.value = url;
                                            }}
                                            onUpload={(file) => uploadImage(file, `platform/testimonial_${Date.now()}`)}
                                            className="w-full h-[150px]"
                                            previewClass="w-full h-full object-cover rounded-lg"
                                            placeholder={<div className="flex flex-col items-center"><Upload className="h-8 w-8 text-muted-foreground/50 mb-2" /><span className="text-xs text-muted-foreground">Upload Photo</span></div>}
                                       />
                                       <Input name="imageUrl" type="hidden" required />
                                    </div>
                                    <Button type="submit" className="w-full" disabled={isAddingTestimonial}>
                                        {isAddingTestimonial ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</> : <><Plus className="mr-2 h-4 w-4" /> Add Testimonial</>}
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>

                        <div className="md:col-span-2 space-y-4">
                            {testimonials.map(t => (
                                <Card key={t.id} className="flex flex-row items-center justify-between p-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-secondary overflow-hidden">
                                            {t.imageUrl && <img src={t.imageUrl} alt={t.name} className="object-cover w-full h-full" />}
                                        </div>
                                        <div>
                                            <h3 className="font-bold">{t.name}</h3>
                                            <p className="text-sm text-muted-foreground line-clamp-1">{t.testimonial}</p>
                                        </div>
                                    </div>
                                    <Button variant="destructive" size="icon" onClick={async () => {
                                        await removePlatformTestimonial(t.id);
                                        setTestimonials(await getPlatformTestimonials());
                                    }}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </Card>
                            ))}
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="identity">
                     <Card>
                        <CardHeader>
                            <CardTitle>Platform Brand Identity</CardTitle>
                            <CardDescription>Default branding for the platform.</CardDescription>
                        </CardHeader>
                         <CardContent>
                            {identity && (
                              <form onSubmit={handleIdentitySave} className="space-y-4">
                                <NavbarPreview 
                                    logoUrl={identity.logoUrl} 
                                    brandName={identity.brandName} 
                                    logoScale={identity.logoScale as any} 
                                />
                                <div className="space-y-2">
                                    <Label>Brand Name</Label>
                                    <Input value={identity.brandName} onChange={e => setIdentity({...identity, brandName: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Brand Logo</Label>
                                    <div className="flex gap-6 items-center p-4 border rounded-lg bg-muted/10">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase text-muted-foreground">30x30 Preview</Label>
                                            <div className="w-[30px] h-[30px] shrink-0">
                                                <ImageUpload 
                                                    value={identity.logoUrl} 
                                                    onChange={(url) => setIdentity({...identity, logoUrl: url})}
                                                    onUpload={(file) => uploadImage(file, `platform/logo_${Date.now()}`)}
                                                    onDelete={() => showConfirm('Delete Logo', 'Are you sure you want to remove the brand logo?', () => setIdentity({...identity, logoUrl: ''}))}
                                                    className="w-full h-full"
                                                    previewClass="w-full h-full object-contain p-0.5"
                                                    placeholder={<Plus className="h-3 w-3 text-muted-foreground/50" />}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex-1 flex flex-col gap-3">
                                            <div className="flex items-center gap-3">
                                                <Label className="text-xs whitespace-nowrap">Display Style</Label>
                                                <Select value={identity.logoScale || 'fit'} onValueChange={(val: any) => setIdentity({...identity, logoScale: val})}>
                                                    <SelectTrigger className="w-[100px] h-8 text-xs">
                                                        <SelectValue placeholder="Scale" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="fit">Fit</SelectItem>
                                                        <SelectItem value="fill">Fill</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground italic">Drag and drop or click the preview to update.</p>
                                        </div>
                                    </div>
                                </div>
                                <Button type="submit" className="w-full" disabled={saving}>
                                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Identity</>}
                                </Button>
                              </form>
                            )}
                          </CardContent>
                     </Card>
                </TabsContent>
            </Tabs>
        ) : (
            // TRAINER VIEW
            !profile ? (
                <div className="text-center py-12">
                     <h2 className="text-xl font-bold text-destructive mb-2">Profile Not Found</h2>
                     <p className="text-muted-foreground">We couldn't load your profile data. Please refresh or contact support.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Left Sidebar */}
                    <div className="lg:col-span-1">
                        <TrainerSidebar profile={profile} />
                    </div>

                    {/* Main Content */}
                    <div className="lg:col-span-3">
                        <Tabs defaultValue="profile" onValueChange={setTrainerActiveTab}>
                          <TabsList className="mb-8 flex flex-wrap h-auto gap-2 w-full justify-start">
                            <TabsTrigger value="identity">Identity</TabsTrigger>
                            <TabsTrigger value="profile">Profile & Hero</TabsTrigger>
                            <TabsTrigger value="classes">Classes</TabsTrigger>
                            <TabsTrigger value="certs">Certifications</TabsTrigger>
                            <TabsTrigger value="trans">Transformations</TabsTrigger>
                          </TabsList>

                          {/* Identity Editor */}
                          <TabsContent value="identity">
                            <Card>
                              <CardHeader>
                                <CardTitle>Brand Identity</CardTitle>
                                <CardDescription>Manage your brand&apos;s look and feel.</CardDescription>
                              </CardHeader>
                              <CardContent>
                                {identity && (
                                  <form onSubmit={handleIdentitySave} className="space-y-4">
                                    <NavbarPreview 
                                        logoUrl={identity.logoUrl} 
                                        brandName={identity.brandName} 
                                        logoScale={identity.logoScale as any} 
                                    />

                                    <ProfileImageSettings 
                                        profile={profile} 
                                        setProfile={setProfile} 
                                        uploadImage={uploadImage} 
                                    />

                                    <div className="space-y-2">
                                        <Label>Brand Name</Label>
                                        <Input value={identity.brandName} onChange={e => setIdentity({...identity, brandName: e.target.value})} />
                                    </div>
                                                                <div className="space-y-2">
                                                                    <Label>Brand Logo</Label>
                                                                    <div className="flex gap-6 items-center p-4 border rounded-lg bg-muted/10">
                                                                        <div className="space-y-1">
                                                                            <Label className="text-[10px] uppercase text-muted-foreground">30x30 Preview</Label>
                                                                            <div className="w-[30px] h-[30px] shrink-0">
                                                                                <ImageUpload 
                                                                                    value={identity.logoUrl} 
                                                                                    onChange={(url) => setIdentity({...identity, logoUrl: url})}
                                                                                    onUpload={(file) => uploadImage(file, `brand/logo_${Date.now()}`)}
                                                                                    onDelete={() => showConfirm('Delete Logo', 'Are you sure you want to remove the brand logo?', () => setIdentity({...identity, logoUrl: ''}))}
                                                                                    className="w-full h-full"
                                                                                    previewClass="w-full h-full object-contain p-0.5"
                                                                                    placeholder={<Plus className="h-3 w-3 text-muted-foreground/50" />}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex-1 flex flex-col gap-3">
                                                                            <div className="flex items-center gap-3">
                                                                                <Label className="text-xs whitespace-nowrap">Display Style</Label>
                                                                                <Select value={identity.logoScale || 'fit'} onValueChange={(val: any) => setIdentity({...identity, logoScale: val})}>
                                                                                    <SelectTrigger className="w-[100px] h-8 text-xs">
                                                                                        <SelectValue placeholder="Scale" />
                                                                                    </SelectTrigger>
                                                                                    <SelectContent>
                                                                                        <SelectItem value="fit">Fit</SelectItem>
                                                                                        <SelectItem value="fill">Fill</SelectItem>
                                                                                    </SelectContent>
                                                                                </Select>
                                                                            </div>
                                                                            <p className="text-[10px] text-muted-foreground italic">Drag and drop or click the preview to update.</p>
                                                                        </div>
                                                                    </div>
                                                                </div>                                    
                                    <div className="space-y-4">
                                        <Label>Color Theme</Label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {THEME_PRESETS.map((preset) => (
                                                <div 
                                                    key={preset.id}
                                                    onClick={() => setIdentity({
                                                        ...identity, 
                                                        themePresetId: preset.id,
                                                        primaryColor: preset.primary,
                                                        secondaryColor: preset.secondary,
                                                        baseColor: preset.primary 
                                                    })}
                                                    className={`
                                                        cursor-pointer rounded-lg border-2 p-2 flex flex-col gap-2 transition-all hover:scale-105
                                                        ${identity.themePresetId === preset.id ? 'border-primary ring-2 ring-primary/20' : 'border-border'}
                                                    `}
                                                >
                                                    <div className="flex h-12 w-full rounded overflow-hidden shadow-sm">
                                                        <div className="h-full w-1/2" style={{ backgroundColor: preset.primary }} />
                                                        <div className="h-full w-1/2" style={{ backgroundColor: preset.secondary }} />
                                                    </div>
                                                    <div className="text-center">
                                                        <span className="text-sm font-medium">{preset.name}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <Button type="submit" className="w-full" disabled={saving}>
                                        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Identity</>}
                                    </Button>
                                  </form>
                                )}
                              </CardContent>
                            </Card>
                          </TabsContent>

                          {/* Profile Editor */}
                          <TabsContent value="profile">
                            <Card>
                              <CardHeader>
                                <CardTitle>Edit Profile</CardTitle>
                                <CardDescription>Update your main website content here.</CardDescription>
                              </CardHeader>
                              <CardContent>
                                <form onSubmit={handleProfileSave} className="space-y-4">
                                  <ProfileImageSettings 
                                    profile={profile} 
                                    setProfile={setProfile} 
                                    uploadImage={uploadImage} 
                                  />

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <Label>Trainer ID (URL Slug)</Label>
                                      <Input 
                                        value={profile.slug || ''} 
                                        onChange={e => setProfile({...profile, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')})} 
                                        disabled={!isNewProfile}
                                        placeholder="my-custom-url"
                                      />
                                      {isNewProfile && <p className="text-[10px] text-muted-foreground italic">Choose your unique ID. This can only be set on first login.</p>}
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Hero Title</Label>
                                      <Input value={profile.heroTitle} onChange={e => setProfile({...profile, heroTitle: e.target.value})} />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Hero Subtitle</Label>
                                      <Input value={profile.heroSubtitle} onChange={e => setProfile({...profile, heroSubtitle: e.target.value})} />
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                      <Label>Trainer Name</Label>
                                      <Input value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} />
                                  </div>

                                  <div className="space-y-2">
                                    <Label>Bio</Label>
                                    <Textarea value={profile.bio} onChange={e => setProfile({...profile, bio: e.target.value})} className="h-32" />
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <Label>Contact Email</Label>
                                      <Input value={profile.contactEmail} onChange={e => setProfile({...profile, contactEmail: e.target.value})} />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Contact Phone</Label>
                                      <Input value={profile.contactPhone} onChange={e => setProfile({...profile, contactPhone: e.target.value})} />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
                                      <div className="space-y-2">
                                          <Label>Experience (Years)</Label>
                                          <Input type="number" value={profile.experienceYears || 0} onChange={e => setProfile({...profile, experienceYears: parseInt(e.target.value)})} />
                                      </div>
                                      <div className="space-y-2">
                                          <Label>Experience (Months)</Label>
                                          <Input type="number" max={11} value={profile.experienceMonths || 0} onChange={e => setProfile({...profile, experienceMonths: parseInt(e.target.value)})} />
                                      </div>
                                      <div className="space-y-2">
                                          <Label>Clients Handled</Label>
                                          <Input type="number" value={profile.clientsHandled || 0} onChange={e => setProfile({...profile, clientsHandled: parseInt(e.target.value)})} />
                                      </div>
                                  </div>

                                  <div className="space-y-4 pt-4 border-t">
                                     <Label className="text-lg">Social Profiles</Label>
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Instagram Profile URL</Label>
                                            <Input 
                                                placeholder="https://instagram.com/yourhandle" 
                                                value={profile.instagramUrl || ''} 
                                                onChange={e => setProfile({...profile, instagramUrl: e.target.value})} 
                                            />
                                            <p className="text-xs text-muted-foreground">Main link for the 'Connect' section button.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>YouTube Channel URL</Label>
                                            <Input 
                                                placeholder="https://youtube.com/@yourchannel" 
                                                value={profile.youtubeUrl || ''} 
                                                onChange={e => setProfile({...profile, youtubeUrl: e.target.value})} 
                                            />
                                            <p className="text-xs text-muted-foreground">Main link for the 'Connect' section button.</p>
                                        </div>
                                     </div>

                                     <Label className="pt-4 block">Feed Posts (Embedded)</Label>
                                     <p className="text-xs text-muted-foreground mb-2">Add individual post URLs here to display them in your feed grid.</p>
                                     <div className="space-y-2">
                                        {profile.socialLinks?.map((link, idx) => (
                                            <div key={idx} className="flex gap-2">
                                                <Select value={link.platform} onValueChange={(val) => {
                                                    const newLinks = [...(profile.socialLinks || [])];
                                                    newLinks[idx].platform = val as any;
                                                    setProfile({...profile, socialLinks: newLinks});
                                                }}>
                                                    <SelectTrigger className="w-[140px]">
                                                        <SelectValue placeholder="Platform" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="instagram">Instagram</SelectItem>
                                                        <SelectItem value="youtube">YouTube</SelectItem>
                                                        <SelectItem value="facebook">Facebook</SelectItem>
                                                        <SelectItem value="twitter">Twitter</SelectItem>
                                                        <SelectItem value="other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Input value={link.url} placeholder="URL" onChange={(e) => {
                                                     const newLinks = [...(profile.socialLinks || [])];
                                                     newLinks[idx].url = e.target.value;
                                                     setProfile({...profile, socialLinks: newLinks});
                                                }} />
                                                <Button type="button" variant="destructive" size="icon" onClick={() => {
                                                     const newLinks = profile.socialLinks?.filter((_, i) => i !== idx);
                                                     setProfile({...profile, socialLinks: newLinks});
                                                }}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}

                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={countLinks('instagram') >= 4}
                                                onClick={() => {
                                                    setProfile({
                                                        ...profile,
                                                        socialLinks: [...(profile.socialLinks || []), { platform: 'instagram', url: '' }]
                                                    });
                                                }}
                                            >
                                                <Plus className="mr-2 h-4 w-4" /> Add Instagram
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={countLinks('youtube') >= 2}
                                                onClick={() => {
                                                    setProfile({
                                                        ...profile,
                                                        socialLinks: [...(profile.socialLinks || []), { platform: 'youtube', url: '' }]
                                                    });
                                                }}
                                            >
                                                <Plus className="mr-2 h-4 w-4" /> Add YouTube
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    setProfile({
                                                        ...profile,
                                                        socialLinks: [...(profile.socialLinks || []), { platform: 'facebook', url: '' }]
                                                    });
                                                }}
                                            >
                                                <Plus className="mr-2 h-4 w-4" /> Add Other
                                            </Button>
                                        </div>
                                     </div>
                                  </div>

                                  <Button type="submit" className="w-full mt-4" disabled={saving}>
                                      {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Changes</>}
                                  </Button>
                                </form>
                              </CardContent>
                            </Card>
                          </TabsContent>

                          {/* Classes Editor */}
                          <TabsContent value="classes">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                              {/* Add Class Form */}
                              <Card className="md:col-span-1 h-fit">
                                <CardHeader>
                                  <CardTitle>Add New Class</CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <form onSubmit={handleAddClass} className="space-y-4">
                                    <Input name="title" placeholder="Class Title" required />
                                    <Input name="description" placeholder="Description" required />
                                    <div className="space-y-2">
                                        <Label>Date & Time</Label>
                                        <Input 
                                            name="time" 
                                            type="datetime-local" 
                                            defaultValue={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)}
                                            required 
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                       <Input name="duration" type="number" placeholder="Mins" required />
                                       <Input name="spots" type="number" placeholder="Max Spots" required />
                                    </div>

                                    <div className="flex items-center justify-between p-2 border rounded-md bg-muted/20">
                                        <div className="space-y-0.5">
                                            <Label>Paid Class</Label>
                                            <p className="text-xs text-muted-foreground">Is there a fee to join?</p>
                                        </div>
                                        <Switch 
                                            name="isPaid" 
                                            checked={isPaidAdd} 
                                            onCheckedChange={setIsPaidAdd} 
                                        />
                                    </div>

                                    {isPaidAdd && (
                                        <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                                            <Label>Price ($)</Label>
                                            <Input name="price" type="number" step="0.01" placeholder="0.00" required />
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                       <Label>Class Image</Label>
                                       <ImageUpload 
                                            onChange={(url) => {
                                                const input = document.getElementsByName('imageUrl')[0] as HTMLInputElement;
                                                if (input) input.value = url;
                                            }}
                                            onUpload={(file) => uploadImage(file, `classes/img_${Date.now()}`)}
                                            className="w-full h-[150px]"
                                            previewClass="w-full h-full object-cover rounded-lg"
                                            placeholder={<div className="flex flex-col items-center"><Upload className="h-8 w-8 text-muted-foreground/50 mb-2" /><span className="text-xs text-muted-foreground">Upload Image</span></div>}
                                       />
                                       <Input name="imageUrl" type="hidden" />
                                    </div>

                                    <Button type="submit" className="w-full" disabled={isAddingClass}>
                                        {isAddingClass ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</> : <><Plus className="mr-2 h-4 w-4" /> Add Class</>}
                                    </Button>
                                  </form>
                                </CardContent>
                              </Card>

                              {/* Class List */}
                              <div className="md:col-span-2 space-y-4">
                                {classes.length === 0 ? (
                                    <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/10">
                                        <Calendar className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                                        <p className="text-muted-foreground font-medium">No classes scheduled yet.</p>
                                    </div>
                                ) : (
                                    classes.map(c => {
                                        if (!c.imageUrl) {
                                            return (
                                                <Card key={c.id} className="flex flex-row items-center justify-between p-4 hover:border-primary/30 transition-all border-border/50">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-10 w-10 rounded-lg bg-primary/5 flex items-center justify-center text-primary/40 shrink-0 border border-primary/10">
                                                            <Calendar className="h-5 w-5" />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold leading-tight">{c.title}</h3>
                                                            <p className="text-sm text-muted-foreground font-medium">
                                                                {c.time} • {c.maxSpots} spots • {c.price && c.price > 0 ? `$${c.price}` : "Free"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1 shrink-0">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setEditingClass(c)}>
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={async () => {
                                                            showConfirm('Delete Class', `Are you sure you want to remove "${c.title}"?`, async () => {
                                                                await removeClass(c.id);
                                                                setClasses(await getClasses(trainerSlug || undefined));
                                                            });
                                                        }}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </Card>
                                            );
                                        }

                                        return (
                                            <Card key={c.id} className="group overflow-hidden border-border/50 hover:border-primary/30 transition-all shadow-sm p-0 flex-row">
                                                <div className="flex flex-col sm:flex-row w-full">
                                                    {/* Class Thumbnail - Full Height Left */}
                                                    <div className="w-full sm:w-40 h-32 sm:h-auto bg-muted shrink-0 relative">
                                                        <img src={c.imageUrl} alt={c.title} className="w-full h-full object-cover" />
                                                        <div className="absolute top-2 left-2">
                                                            <Badge className={c.price && c.price > 0 ? "bg-primary text-primary-foreground" : "bg-green-500/10 text-green-600 border-green-500/20"}>
                                                                {c.price && c.price > 0 ? `$${c.price}` : "FREE"}
                                                            </Badge>
                                                        </div>
                                                    </div>

                                                    {/* Class Info */}
                                                    <div className="flex-1 p-5 flex flex-col justify-between bg-background">
                                                        <div>
                                                            <div className="flex justify-between items-start mb-1">
                                                                <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">{c.title}</h3>
                                                                <div className="flex gap-1 shrink-0">
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setEditingClass(c)}>
                                                                        <Pencil className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={async () => {
                                                                        showConfirm('Delete Class', `Are you sure you want to remove "${c.title}"?`, async () => {
                                                                            await removeClass(c.id);
                                                                            setClasses(await getClasses(trainerSlug || undefined));
                                                                        });
                                                                    }}>
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{c.description}</p>
                                                        </div>

                                                        <div className="flex flex-wrap gap-4 text-xs font-medium text-muted-foreground mt-auto pt-2">
                                                            <div className="flex items-center gap-1.5">
                                                                <Clock className="h-3.5 w-3.5 text-primary" />
                                                                {c.time}
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <Users className="h-3.5 w-3.5 text-primary" />
                                                                {c.maxSpots} spots total
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </Card>
                                        );
                                    })
                                )}
                              </div>
                            </div>
                            
                            <Dialog open={!!editingClass} onOpenChange={(open) => !open && setEditingClass(null)}>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Edit Class</DialogTitle>
                                        <DialogDescription>Update class details.</DialogDescription>
                                    </DialogHeader>
                                    {editingClass && (
                                        <form onSubmit={handleUpdateClass} className="space-y-4">
                                            <Input name="title" placeholder="Class Title" defaultValue={editingClass.title} required />
                                            <Input name="description" placeholder="Description" defaultValue={editingClass.description} required />
                                            <div className="space-y-2">
                                                <Label>Date & Time</Label>
                                                <Input 
                                                    name="time" 
                                                    type="datetime-local" 
                                                    defaultValue={(editingClass as any).dateIso ? new Date((editingClass as any).dateIso).toISOString().slice(0, 16) : ''} 
                                                    required 
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Input name="duration" type="number" placeholder="Mins" defaultValue={editingClass.durationMinutes} required />
                                                <Input name="spots" type="number" placeholder="Max Spots" defaultValue={editingClass.maxSpots} required />
                                            </div>
                                            
                                            <div className="flex items-center justify-between p-2 border rounded-md bg-muted/20">
                                                <div className="space-y-0.5">
                                                    <Label>Paid Class</Label>
                                                    <p className="text-xs text-muted-foreground">Is there a fee to join?</p>
                                                </div>
                                                <Switch 
                                                    name="isPaid" 
                                                    checked={isPaidEdit} 
                                                    onCheckedChange={setIsPaidEdit} 
                                                />
                                            </div>

                                            {isPaidEdit && (
                                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                                                    <Label>Price ($)</Label>
                                                    <Input name="price" type="number" step="0.01" placeholder="0.00" defaultValue={editingClass.price} required />
                                                </div>
                                            )}

                                            <div className="space-y-2">
                                                <Label>Class Image</Label>
                                                <ImageUpload 
                                                    value={editingClass.imageUrl}
                                                    onChange={(url) => {
                                                        setEditingClass({...editingClass, imageUrl: url});
                                                    }}
                                                    onUpload={(file) => uploadImage(file, `classes/img_${Date.now()}`)}
                                                    className="w-full h-[150px]"
                                                    previewClass="w-full h-full object-cover rounded-lg"
                                                    placeholder={<div className="flex flex-col items-center"><Upload className="h-8 w-8 text-muted-foreground/50 mb-2" /><span className="text-xs text-muted-foreground">Upload Image</span></div>}
                                                />
                                                <Input name="imageUrl" type="hidden" value={editingClass.imageUrl || ''} />
                                            </div>
                                            <Button type="submit" className="w-full">Save Changes</Button>
                                        </form>
                                    )}
                                </DialogContent>
                            </Dialog>
                          </TabsContent>

                          {/* Certs Editor */}
                          <TabsContent value="certs">
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                               <Card className="md:col-span-1 h-fit">
                                 <CardHeader>
                                   <CardTitle>Add Certification</CardTitle>
                                 </CardHeader>
                                 <CardContent>
                                   <form onSubmit={handleAddCert} className="space-y-4">
                                     <Input name="title" placeholder="Certificate Title" required />
                                     <Input name="issuer" placeholder="Issuer (e.g. NASM)" required />
                                     <Input name="date" type="date" required />

                                     <div className="space-y-2">
                                        <Label>Verify URL (Optional)</Label>
                                        <Input name="url" placeholder="https://..." />
                                     </div>

                                     <div className="space-y-2">
                                       <Label>Certificate Image (Optional)</Label>
                                       <ImageUpload 
                                            onChange={(url) => {
                                                const input = document.getElementsByName('imageUrl')[0] as HTMLInputElement;
                                                if (input) input.value = url;
                                            }}
                                            onUpload={(file) => uploadImage(file, `certs/img_${Date.now()}`)}
                                            className="w-full h-[150px]"
                                            previewClass="w-full h-full object-contain bg-white rounded-lg p-2"
                                            placeholder={<div className="flex flex-col items-center"><Upload className="h-8 w-8 text-muted-foreground/50 mb-2" /><span className="text-xs text-muted-foreground">Upload Cert</span></div>}
                                       />
                                       <Input name="imageUrl" type="hidden" />
                                     </div>

                                     <Button type="submit" className="w-full" disabled={isAddingCert}>
                                        {isAddingCert ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</> : <><Plus className="mr-2 h-4 w-4" /> Add Cert</>}
                                     </Button>
                                   </form>
                                 </CardContent>
                               </Card>

                               <div className="md:col-span-2 space-y-4">
                                 {certs.map(c => (
                                   <Card key={c.id} className="flex flex-row items-center justify-between p-4">
                                     <div>
                                       <h3 className="font-bold">{c.title}</h3>
                                       <p className="text-sm text-muted-foreground">{c.issuer} • {c.date}</p>
                                       {(c.url || c.imageUrl) && <div className="text-xs mt-1 space-x-2">
                                           {c.url && <a href={c.url} target="_blank" className="text-primary hover:underline">Verify</a>}
                                           {c.imageUrl && <a href={c.imageUrl} target="_blank" className="text-primary hover:underline">View Image</a>}
                                       </div>}
                                     </div>
                                     <div className="flex gap-2">
                                         <Button variant="ghost" size="icon" onClick={() => setEditingCert(c)}>
                                            <Pencil className="h-4 w-4" />
                                         </Button>
                                         <Button variant="destructive" size="icon" onClick={async () => {
                                           await removeCertification(c.id);
                                           setCerts(await getCertifications(trainerSlug || undefined));
                                         }}>
                                           <Trash2 className="h-4 w-4" />
                                         </Button>
                                     </div>
                                   </Card>
                                 ))}
                               </div>
                             </div>

                            <Dialog open={!!editingCert} onOpenChange={(open) => !open && setEditingCert(null)}>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Edit Certification</DialogTitle>
                                    </DialogHeader>
                                    {editingCert && (
                                        <form onSubmit={handleUpdateCert} className="space-y-4">
                                            <Input name="title" placeholder="Certificate Title" defaultValue={editingCert.title} required />
                                            <Input name="issuer" placeholder="Issuer (e.g. NASM)" defaultValue={editingCert.issuer} required />
                                            <Input name="date" type="date" defaultValue={editingCert.date} required />

                                            <div className="space-y-2">
                                                <Label>Verify URL (Optional)</Label>
                                                <Input name="url" placeholder="https://..." defaultValue={editingCert.url} />
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Certificate Image (Optional)</Label>
                                                <ImageUpload
                                                    value={editingCert.imageUrl}
                                                    onChange={(url) => setEditingCert({...editingCert, imageUrl: url})}
                                                    onUpload={(file) => uploadImage(file, `certs/img_${Date.now()}`)}
                                                    className="w-full h-[150px]"
                                                    previewClass="w-full h-full object-contain bg-white rounded-lg p-2"
                                                    placeholder={<div className="flex flex-col items-center"><Upload className="h-8 w-8 text-muted-foreground/50 mb-2" /><span className="text-xs text-muted-foreground">Upload Cert</span></div>}
                                                />
                                                <Input name="imageUrl" type="hidden" value={editingCert.imageUrl || ''} />
                                            </div>

                                            <Button type="submit" className="w-full" disabled={saving}>
                                                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
                                            </Button>
                                        </form>
                                    )}
                                </DialogContent>
                            </Dialog>
                          </TabsContent>

                          {/* Transformations Editor */}
                          <TabsContent value="trans">
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                               <Card className="md:col-span-1 h-fit">
                                 <CardHeader>
                                   <CardTitle>Add Transformation</CardTitle>
                                 </CardHeader>
                                 <CardContent>
                                   <form onSubmit={handleAddTrans} className="space-y-4">
                                     <Input name="clientName" placeholder="Client Name" required />
                                     <Input name="description" placeholder="Description (e.g. Lost 30lbs)" required />

                                     <div className="grid grid-cols-2 gap-4">
                                         <div className="space-y-2">
                                           <Label>Duration (e.g. 12 Weeks)</Label>
                                           <Input name="duration" placeholder="Duration" />
                                         </div>
                                         <div className="space-y-2">
                                           <Label>Weight Lost</Label>
                                           <Input name="weightLost" placeholder="e.g. 20lbs" />
                                         </div>
                                         <div className="space-y-2">
                                           <Label>Muscle Gained</Label>
                                           <Input name="muscleGained" placeholder="e.g. 5lbs" />
                                         </div>
                                         <div className="space-y-2">
                                           <Label>Key Challenges</Label>
                                           <Input name="keyChallenges" placeholder="e.g. Injury recovery" />
                                         </div>
                                     </div>

                                     <div className="space-y-2">
                                         <Label>Trainer Note</Label>
                                         <Textarea name="trainerNote" placeholder="Notes on the journey..." className="h-20" />
                                     </div>

                                     <div className="grid grid-cols-2 gap-4">
                                         <div className="space-y-2">
                                           <Label>Before Image</Label>
                                           <ImageUpload 
                                                onChange={(url) => {
                                                    const input = document.getElementsByName('beforeImage')[0] as HTMLInputElement;
                                                    if (input) input.value = url;
                                                }}
                                                onUpload={(file) => uploadImage(file, `transformations/before_${Date.now()}`)}
                                                className="w-full h-[120px]"
                                                previewClass="w-full h-full object-cover rounded-lg"
                                                placeholder={<div className="flex flex-col items-center"><Upload className="h-6 w-6 text-muted-foreground/50 mb-1" /><span className="text-[10px] text-muted-foreground">Before</span></div>}
                                           />
                                           <Input name="beforeImage" type="hidden" required />
                                         </div>

                                         <div className="space-y-2">
                                           <Label>After Image</Label>
                                           <ImageUpload 
                                                onChange={(url) => {
                                                    const input = document.getElementsByName('afterImage')[0] as HTMLInputElement;
                                                    if (input) input.value = url;
                                                }}
                                                onUpload={(file) => uploadImage(file, `transformations/after_${Date.now()}`)}
                                                className="w-full h-[120px]"
                                                previewClass="w-full h-full object-cover rounded-lg"
                                                placeholder={<div className="flex flex-col items-center"><Upload className="h-6 w-6 text-muted-foreground/50 mb-1" /><span className="text-[10px] text-muted-foreground">After</span></div>}
                                           />
                                           <Input name="afterImage" type="hidden" required />
                                         </div>
                                     </div>

                                     <Button type="submit" className="w-full" disabled={isAddingTrans}>
                                        {isAddingTrans ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</> : <><Plus className="mr-2 h-4 w-4" /> Add Transformation</>}
                                     </Button>
                                   </form>
                                 </CardContent>
                               </Card>

                               <div className="md:col-span-2 space-y-4">
                                 {trans.map(t => (
                                   <Card key={t.id} className="flex flex-row items-center justify-between p-4">
                                     <div>
                                       <h3 className="font-bold">{t.clientName}</h3>
                                       <p className="text-sm text-muted-foreground">{t.description}</p>
                                     </div>
                                     <div className="flex gap-2">
                                         <Button variant="ghost" size="icon" onClick={() => setEditingTrans(t)}>
                                            <Pencil className="h-4 w-4" />
                                         </Button>
                                         <Button variant="destructive" size="icon" onClick={async () => {
                                           await removeTransformation(t.id);
                                           setTrans(await getTransformations(trainerSlug || undefined));
                                         }}>
                                           <Trash2 className="h-4 w-4" />
                                         </Button>
                                     </div>
                                   </Card>
                                 ))}
                               </div>
                             </div>

                             <Dialog open={!!editingTrans} onOpenChange={(open) => !open && setEditingTrans(null)}>
                                <DialogContent className="max-h-[90vh] overflow-y-auto">
                                    <DialogHeader>
                                        <DialogTitle>Edit Transformation</DialogTitle>
                                    </DialogHeader>
                                    {editingTrans && (
                                        <form onSubmit={handleUpdateTrans} className="space-y-4">
                                            <Input name="clientName" placeholder="Client Name" defaultValue={editingTrans.clientName} required />
                                            <Input name="description" placeholder="Description (e.g. Lost 30lbs)" defaultValue={editingTrans.description} required />

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>Duration</Label>
                                                    <Input name="duration" placeholder="e.g. 12 Weeks" defaultValue={editingTrans.duration} />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Weight Lost</Label>
                                                    <Input name="weightLost" placeholder="e.g. 20lbs" defaultValue={editingTrans.weightLost} />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Muscle Gained</Label>
                                                    <Input name="muscleGained" placeholder="e.g. 5lbs" defaultValue={editingTrans.muscleGained} />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Key Challenges</Label>
                                                    <Input name="keyChallenges" placeholder="e.g. Injury recovery" defaultValue={editingTrans.keyChallenges} />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label>Trainer Note</Label>
                                                <Textarea name="trainerNote" placeholder="Notes on the journey..." className="h-20" defaultValue={editingTrans.trainerNote} />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>Before Image</Label>
                                                    <ImageUpload
                                                        value={editingTrans.beforeImage}
                                                        onChange={(url) => setEditingTrans({...editingTrans, beforeImage: url})}
                                                        onUpload={(file) => uploadImage(file, `transformations/before_${Date.now()}`)}
                                                        className="w-full h-[120px]"
                                                        previewClass="w-full h-full object-cover rounded-lg"
                                                        placeholder={<div className="flex flex-col items-center"><Upload className="h-6 w-6 text-muted-foreground/50 mb-1" /><span className="text-[10px] text-muted-foreground">Before</span></div>}
                                                    />
                                                    <Input name="beforeImage" type="hidden" value={editingTrans.beforeImage} required />
                                                </div>

                                                <div className="space-y-2">
                                                    <Label>After Image</Label>
                                                    <ImageUpload
                                                        value={editingTrans.afterImage}
                                                        onChange={(url) => setEditingTrans({...editingTrans, afterImage: url})}
                                                        onUpload={(file) => uploadImage(file, `transformations/after_${Date.now()}`)}
                                                        className="w-full h-[120px]"
                                                        previewClass="w-full h-full object-cover rounded-lg"
                                                        placeholder={<div className="flex flex-col items-center"><Upload className="h-6 w-6 text-muted-foreground/50 mb-1" /><span className="text-[10px] text-muted-foreground">After</span></div>}
                                                    />
                                                    <Input name="afterImage" type="hidden" value={editingTrans.afterImage} required />
                                                </div>
                                            </div>

                                            <Button type="submit" className="w-full" disabled={saving}>
                                                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
                                            </Button>
                                        </form>
                                    )}
                                </DialogContent>
                             </Dialog>
                          </TabsContent>
                        </Tabs>
                    </div>
                </div>
            )
        )}
      </main>
    </div>
  );
}