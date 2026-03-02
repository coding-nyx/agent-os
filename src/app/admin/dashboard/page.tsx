'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useData } from '@/lib/data-provider';
import { TrainerProfile, GymClass, Certification, Transformation, BrandIdentity, LandingPageContent, PlatformTestimonial, SocialLink } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import Link from 'next/link';
import { Trash2, Plus, Save, Upload, ExternalLink, Globe, Loader2 } from 'lucide-react';
import { getFirebase } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Image from 'next/image';
import { useAlert } from '@/components/ui/custom-alert';

export default function DashboardPage() {
  const { isAuthenticated, logout, trainerSlug, user, isSuperAdmin } = useAuth();
  const router = useRouter();
  const {
    getProfile, updateProfile,
    getBrandIdentity, updateBrandIdentity,
    getClasses, addClass, removeClass,
    getCertifications, addCertification, removeCertification,
    getTransformations, addTransformation, removeTransformation,
    getLandingPageContent, updateLandingPageContent,
    getPlatformTestimonials, addPlatformTestimonial, removePlatformTestimonial
  } = useData();

  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [identity, setIdentity] = useState<BrandIdentity | null>(null);
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [certs, setCerts] = useState<Certification[]>([]);
  const [trans, setTrans] = useState<Transformation[]>([]);
  const [landing, setLanding] = useState<LandingPageContent | null>(null);
  const [testimonials, setTestimonials] = useState<PlatformTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showAlert } = useAlert();

  // Track active tab to update page title logic
  const [activeTab, setActiveTab] = useState<string>('landing');
  const [trainerActiveTab, setTrainerActiveTab] = useState<string>('profile');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/admin/login/');
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
  }, [isAuthenticated, router, isSuperAdmin, trainerSlug, user, getProfile, getBrandIdentity, getClasses, getCertifications, getTransformations, getLandingPageContent, getPlatformTestimonials]);

  // Update Document Title based on identity and active tab
  useEffect(() => {
      const baseTitle = identity?.brandName || 'Admin';
      if (isSuperAdmin) {
          let section = 'Dashboard';
          if (activeTab === 'landing') section = 'Landing Page';
          if (activeTab === 'testimonials') section = 'Testimonials';
          if (activeTab === 'identity') section = 'Identity';
          document.title = `${baseTitle} - ${section}`;
      } else {
          document.title = `${baseTitle} - Trainer Dashboard`;
      }
  }, [identity, activeTab, isSuperAdmin]);

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
    const formData = new FormData(e.currentTarget);
    await addClass({
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      time: formData.get('time') as string,
      durationMinutes: parseInt(formData.get('duration') as string),
      maxSpots: parseInt(formData.get('spots') as string),
      enrolledSpots: 0,
      imageUrl: formData.get('imageUrl') as string || undefined
    });
    setClasses(await getClasses(trainerSlug || undefined));
    (e.target as HTMLFormElement).reset();
  };

  const handleAddCert = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await addCertification({
      title: formData.get('title') as string,
      issuer: formData.get('issuer') as string,
      date: formData.get('date') as string,
      url: formData.get('url') as string || undefined,
      imageUrl: formData.get('imageUrl') as string || undefined,
    });
    setCerts(await getCertifications(trainerSlug || undefined));
    (e.target as HTMLFormElement).reset();
  };

  const handleAddTrans = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await addTransformation({
      clientName: formData.get('clientName') as string,
      description: formData.get('description') as string,
      beforeImage: formData.get('beforeImage') as string,
      afterImage: formData.get('afterImage') as string,
    });
    setTrans(await getTransformations(trainerSlug || undefined));
    (e.target as HTMLFormElement).reset();
  };

  const handleAddTestimonial = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      await addPlatformTestimonial({
          name: formData.get('name') as string,
          testimonial: formData.get('testimonial') as string,
          imageUrl: formData.get('imageUrl') as string
      });
      setTestimonials(await getPlatformTestimonials());
      (e.target as HTMLFormElement).reset();
  };

  if (loading) return <div className="p-8">Loading Dashboard...</div>;

  const getPageTitle = () => {
      if (isSuperAdmin) {
          switch(activeTab) {
              case 'landing': return 'Platform Admin - Landing Page';
              case 'testimonials': return 'Platform Admin - Testimonials';
              case 'identity': return 'Platform Admin - Identity';
              default: return 'Platform Admin';
          }
      }
      return 'Trainer Dashboard';
  };

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
               {getPageTitle()}
           </h1>
           {!isSuperAdmin && trainerSlug && (
             <Button variant="ghost" size="sm" asChild>
               <Link href={`/${trainerSlug}`} target="_blank">
                 View My Page <ExternalLink className="ml-2 h-4 w-4" />
               </Link>
             </Button>
           )}
           {isSuperAdmin && (
             <Button variant="ghost" size="sm" asChild>
               <Link href="/" target="_blank">
                 View Platform <Globe className="ml-2 h-4 w-4" />
               </Link>
             </Button>
           )}
        </div>
        <div className="flex items-center gap-4">
           <span className="text-sm text-muted-foreground hidden md:inline-block">Logged in as {user?.email}</span>
           <Button variant="outline" onClick={() => { logout(); router.push('/'); }}>Logout</Button>
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
                                        <div className="flex gap-2">
                                            <Input value={landing.heroImageUrl} onChange={e => setLanding({...landing, heroImageUrl: e.target.value})} />
                                            <Label htmlFor="upload-hero" className="cursor-pointer bg-secondary px-4 py-2 rounded flex items-center justify-center">
                                                <Upload className="h-4 w-4" />
                                            </Label>
                                            <Input id="upload-hero" type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const url = await uploadImage(file, `platform/hero_${Date.now()}`);
                                                    setLanding({...landing, heroImageUrl: url});
                                                }
                                            }} />
                                        </div>
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
                                       <div className="flex gap-2 items-center">
                                          <Input name="imageUrl" placeholder="Image URL" required />
                                          <Label htmlFor="upload-test-img" className="cursor-pointer bg-secondary px-4 py-2 rounded flex items-center justify-center">
                                             <Upload className="h-4 w-4" />
                                          </Label>
                                          <Input id="upload-test-img" type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                              const file = e.target.files?.[0];
                                              if (file) {
                                                  const url = await uploadImage(file, `platform/testimonial_${Date.now()}`);
                                                  const input = document.getElementsByName('imageUrl')[0] as HTMLInputElement;
                                                  if (input) input.value = url;
                                              }
                                          }} />
                                       </div>
                                    </div>
                                    <Button type="submit" className="w-full"><Plus className="mr-2 h-4 w-4" /> Add Testimonial</Button>
                                </form>
                            </CardContent>
                        </Card>

                        <div className="md:col-span-2 space-y-4">
                            {testimonials.map(t => (
                                <Card key={t.id} className="flex flex-row items-center justify-between p-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-secondary overflow-hidden">
                                            {t.imageUrl && <Image src={t.imageUrl} alt={t.name} width={48} height={48} className="object-cover w-full h-full" />}
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
                                <div className="space-y-2">
                                    <Label>Brand Name</Label>
                                    <Input value={identity.brandName} onChange={e => setIdentity({...identity, brandName: e.target.value})} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Logo</Label>
                                    <div className="flex gap-4 items-center">
                                        {identity.logoUrl && <Image src={identity.logoUrl} alt="Logo" width={64} height={64} className="object-contain border p-1 rounded" />}
                                        <Input type="file" accept="image/*" onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const url = await uploadImage(file, `platform/logo_${Date.now()}`);
                                                setIdentity({...identity, logoUrl: url});
                                            }
                                        }} />
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
                <Tabs defaultValue="profile" onValueChange={setTrainerActiveTab}>
                  <TabsList className="mb-8 flex flex-wrap h-auto gap-2">
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
                            <div className="space-y-2">
                                <Label>Brand Name</Label>
                                <Input value={identity.brandName} onChange={e => setIdentity({...identity, brandName: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label>Logo</Label>
                                <div className="flex gap-4 items-center">
                                    {identity.logoUrl && <Image src={identity.logoUrl} alt="Logo" width={64} height={64} className="object-contain border p-1 rounded" />}
                                    <Input type="file" accept="image/*" onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const url = await uploadImage(file, `brand/logo_${Date.now()}`);
                                            setIdentity({...identity, logoUrl: url});
                                        }
                                    }} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Primary Color</Label>
                                    <div className="flex gap-2">
                                        <Input type="color" className="w-12 p-1 h-10" value={identity.primaryColor} onChange={e => setIdentity({...identity, primaryColor: e.target.value})} />
                                        <Input value={identity.primaryColor} onChange={e => setIdentity({...identity, primaryColor: e.target.value})} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Secondary Color</Label>
                                     <div className="flex gap-2">
                                        <Input type="color" className="w-12 p-1 h-10" value={identity.secondaryColor} onChange={e => setIdentity({...identity, secondaryColor: e.target.value})} />
                                        <Input value={identity.secondaryColor} onChange={e => setIdentity({...identity, secondaryColor: e.target.value})} />
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

                  {/* Profile Editor */}
                  <TabsContent value="profile">
                    <Card>
                      <CardHeader>
                        <CardTitle>Edit Profile</CardTitle>
                        <CardDescription>Update your main website content here.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <form onSubmit={handleProfileSave} className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                             <Label>Social Links</Label>
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
                            <Input name="time" placeholder="Time (e.g. Mon 10:00 AM)" required />
                            <div className="grid grid-cols-2 gap-2">
                               <Input name="duration" type="number" placeholder="Mins" required />
                               <Input name="spots" type="number" placeholder="Max Spots" required />
                            </div>

                            <div className="space-y-2">
                               <Label>Class Image</Label>
                               <div className="flex gap-2 items-center">
                                  <Input name="imageUrl" placeholder="Image URL" />
                                  <Label htmlFor="upload-class" className="cursor-pointer bg-secondary px-4 py-2 rounded flex items-center justify-center">
                                     <Upload className="h-4 w-4" />
                                  </Label>
                                  <Input id="upload-class" type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                          const url = await uploadImage(file, `classes/img_${Date.now()}`);
                                          const input = document.getElementsByName('imageUrl')[0] as HTMLInputElement;
                                          if (input) input.value = url;
                                      }
                                  }} />
                               </div>
                            </div>

                            <Button type="submit" className="w-full"><Plus className="mr-2 h-4 w-4" /> Add Class</Button>
                          </form>
                        </CardContent>
                      </Card>

                      {/* Class List */}
                      <div className="md:col-span-2 space-y-4">
                        {classes.map(c => (
                          <Card key={c.id} className="flex flex-row items-center justify-between p-4">
                            <div>
                              <h3 className="font-bold">{c.title}</h3>
                              <p className="text-sm text-muted-foreground">{c.time} • {c.maxSpots} spots</p>
                              {c.imageUrl && <p className="text-xs text-muted-foreground mt-1">Image attached</p>}
                            </div>
                            <Button variant="destructive" size="icon" onClick={async () => {
                              await removeClass(c.id);
                              setClasses(await getClasses(trainerSlug || undefined));
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </Card>
                        ))}
                      </div>
                    </div>
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
                               <div className="flex gap-2 items-center">
                                  <Input name="imageUrl" placeholder="Image URL" />
                                  <Label htmlFor="upload-cert" className="cursor-pointer bg-secondary px-4 py-2 rounded flex items-center justify-center">
                                     <Upload className="h-4 w-4" />
                                  </Label>
                                  <Input id="upload-cert" type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                          const url = await uploadImage(file, `certs/img_${Date.now()}`);
                                          const input = document.getElementsByName('imageUrl')[0] as HTMLInputElement;
                                          if (input) input.value = url;
                                      }
                                  }} />
                                </div>
                             </div>

                             <Button type="submit" className="w-full"><Plus className="mr-2 h-4 w-4" /> Add Cert</Button>
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
                             <Button variant="destructive" size="icon" onClick={async () => {
                               await removeCertification(c.id);
                               setCerts(await getCertifications(trainerSlug || undefined));
                             }}>
                               <Trash2 className="h-4 w-4" />
                             </Button>
                           </Card>
                         ))}
                       </div>
                     </div>
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

                             <div className="space-y-2">
                               <Label>Before Image</Label>
                               <div className="flex gap-2 items-center">
                                  <Input name="beforeImage" placeholder="Image URL" required />
                                  <Label htmlFor="upload-before" className="cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2 rounded inline-flex items-center justify-center">
                                     <Upload className="h-4 w-4" />
                                  </Label>
                                  <Input id="upload-before" type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                          const url = await uploadImage(file, `transformations/before_${Date.now()}`);
                                          const input = document.getElementsByName('beforeImage')[0] as HTMLInputElement;
                                          if (input) input.value = url;
                                      }
                                  }} />
                               </div>
                             </div>

                             <div className="space-y-2">
                               <Label>After Image</Label>
                               <div className="flex gap-2 items-center">
                                  <Input name="afterImage" placeholder="Image URL" required />
                                  <Label htmlFor="upload-after" className="cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2 rounded inline-flex items-center justify-center">
                                     <Upload className="h-4 w-4" />
                                  </Label>
                                  <Input id="upload-after" type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                          const url = await uploadImage(file, `transformations/after_${Date.now()}`);
                                          const input = document.getElementsByName('afterImage')[0] as HTMLInputElement;
                                          if (input) input.value = url;
                                      }
                                  }} />
                               </div>
                             </div>

                             <Button type="submit" className="w-full"><Plus className="mr-2 h-4 w-4" /> Add Transformation</Button>
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
                             <Button variant="destructive" size="icon" onClick={async () => {
                               await removeTransformation(t.id);
                               setTrans(await getTransformations(trainerSlug || undefined));
                             }}>
                               <Trash2 className="h-4 w-4" />
                             </Button>
                           </Card>
                         ))}
                       </div>
                     </div>
                  </TabsContent>
                </Tabs>
            )
        )}
      </main>
    </div>
  );
}
