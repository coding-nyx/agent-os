'use client';

import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useData } from '@/lib/data-provider';
import { TrainerSummary, LandingPageContent, BrandIdentity, PlatformTestimonial } from '@/lib/types';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { DEFAULT_BRAND_NAME } from '@/lib/constants';
import { BootLoader } from '@/components/ui/boot-loader';
import { AnimatePresence } from 'framer-motion';

export function LandingPage() {
  const { getTrainers, getLandingPageContent, getBrandIdentity, getPlatformTestimonials } = useData();
  const [trainers, setTrainers] = useState<TrainerSummary[]>([]);
  const [landing, setLanding] = useState<LandingPageContent | null>(null);
  const [brand, setBrand] = useState<BrandIdentity | null>(null);
  const [testimonials, setTestimonials] = useState<PlatformTestimonial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
        try {
            const [tData, lData, bData, testData] = await Promise.all([
                getTrainers(),
                getLandingPageContent(),
                getBrandIdentity('platform'),
                getPlatformTestimonials()
            ]);
            setTrainers(tData);
            setLanding(lData);
            setBrand(bData);
            setTestimonials(testData);
        } catch (e) {
            console.error("Error loading home page data", e);
        } finally {
            setLoading(false);
        }
    };
    fetchData();
  }, [getTrainers, getLandingPageContent, getBrandIdentity, getPlatformTestimonials]);

  useEffect(() => {
    if (brand?.brandName) {
      document.title = `${brand.brandName} | Unleash Your Potential`;
    } else if (!loading) {
      document.title = `${DEFAULT_BRAND_NAME} | Unleash Your Potential`;
    }
  }, [brand, loading]);

  const heroTitle = landing?.heroTitle || "FIND YOUR TITAN";
  const heroSubtitle = landing?.heroSubtitle || "Elite personal trainers ready to help you shatter your limits. Choose your coach and start your journey today.";
  const heroImage = landing?.heroImageUrl || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2070&auto=format&fit=crop';
  const brandName = brand?.brandName || DEFAULT_BRAND_NAME;

  // Replaced spinner with BootLoader
    if (loading) {
      return (
        <AnimatePresence>
          <BootLoader />
        </AnimatePresence>
      );
    }
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative h-[80vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-black/60 z-10" />
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${heroImage})` }}
        />

        <div className="relative z-20 container mx-auto px-4 text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">
            {heroTitle}
          </h1>
          <p className="text-xl md:text-2xl text-gray-200 mb-10 max-w-2xl mx-auto">
            {heroSubtitle}
          </p>
          <a href="#trainers" className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-4 rounded-full text-lg font-semibold transition-all">
            Browse Trainers
          </a>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-24 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
            <div className="p-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-4">Elite Expertise</h3>
              <p className="text-muted-foreground">Train with coaches who have proven track records and top-tier certifications.</p>
            </div>
            <div className="p-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-4">Proven Results</h3>
              <p className="text-muted-foreground">Our data-driven approach ensures you see real, measurable progress every step of the way.</p>
            </div>
            <div className="p-6">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-4">Community Focused</h3>
              <p className="text-muted-foreground">Join a supportive community of like-minded individuals pushing for greatness.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trainers Grid */}
      <section id="trainers" className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Our Elite Coaches</h2>
            <div className="w-24 h-1 bg-primary mx-auto" />
          </div>

          <div className="flex flex-wrap justify-center gap-8">
              {trainers.length === 0 ? (
                  <p className="text-center w-full col-span-3 text-muted-foreground">No trainers available yet.</p>
              ) : (
                  trainers.map((trainer) => (
                    <Link key={trainer.slug} to={`/trainer?slug=${trainer.slug}`} className="group relative block overflow-hidden rounded-2xl aspect-[3/4] w-full max-w-[350px]">
                      <div className="absolute inset-0 bg-gray-900" />
                      {/* Placeholder image logic if no image provided */}
                      <div
                        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110 opacity-70 group-hover:opacity-100"
                        style={{ backgroundImage: `url(${trainer.profileImage ? trainer.profileImage : 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=2070&auto=format&fit=crop'})` }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-90" />

                      <div className="absolute bottom-0 left-0 p-8 w-full">
                        <h3 className="text-3xl font-bold text-white mb-2">{trainer.name}</h3>
                        <p className="text-primary font-medium tracking-widest uppercase text-sm">{trainer.heroTitle}</p>
                      </div>
                    </Link>
                  ))
              )}
            </div>
        </div>
      </section>

      {/* Mental Wellness Section */}
      <section className="py-24 bg-gradient-to-r from-slate-900 to-indigo-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1544367563-12123d8966bf?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
        <div className="container mx-auto px-4 relative z-10 text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Train Your Mind</h2>
            <p className="text-xl text-indigo-100 max-w-2xl mx-auto mb-10">
                Mental resilience is the foundation of physical performance. 
                Connect with our AI-powered therapy vault—secure, private, and always available.
            </p>
            <Link to="/therapy" className="inline-flex items-center gap-2 bg-white text-indigo-900 hover:bg-indigo-50 px-8 py-4 rounded-full text-lg font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-1">
                Explore MindVault
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
            </Link>
        </div>
      </section>

      {/* Success Stories Preview (Testimonials) */}
      <section className="py-24 bg-black text-white">
        <div className="container mx-auto px-4">
           <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Real Transformations</h2>
            <p className="text-gray-400">See what's possible when you commit to the process.</p>
          </div>

          <div className="flex justify-center">
             {testimonials.length > 0 ? (
                 <Carousel
                    opts={{
                        align: "start",
                    }}
                    className="w-full max-w-5xl mx-auto"
                 >
                    <CarouselContent className="-ml-2 md:-ml-4">
                        {testimonials.map((t) => (
                            <CarouselItem key={t.id} className="pl-2 md:pl-4 md:basis-1/2 lg:basis-1/2 p-2">
                                <div className="bg-gray-900 rounded-xl p-8 border border-white/10 h-full">
                                    <div className="flex gap-4 items-center mb-4">
                                       {t.imageUrl ? (
                                           <img src={t.imageUrl} alt={t.name} className="rounded-full w-12 h-12 object-cover" />
                                       ) : (
                                           <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center font-bold text-black">
                                               {t.name.substring(0,2).toUpperCase()}
                                           </div>
                                       )}
                                       <div>
                                          <h4 className="font-bold text-lg">{t.name}</h4>
                                          <p className="text-sm text-gray-400">Client</p>
                                       </div>
                                    </div>
                                    <p className="text-gray-300">&quot;{t.testimonial}&quot;</p>
                                </div>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    <CarouselPrevious className="hidden md:flex bg-gray-800 text-white border-white/20 hover:bg-gray-700" />
                    <CarouselNext className="hidden md:flex bg-gray-800 text-white border-white/20 hover:bg-gray-700" />
                 </Carousel>
             ) : (
                <>
                 {/* Fallback if no testimonials created yet */}
                 <div className="bg-gray-900 rounded-xl p-8 border border-white/10 opacity-50 w-full max-w-md text-center">
                    <p>Success stories coming soon.</p>
                 </div>
                </>
             )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-black border-t border-white/10 text-center text-gray-400 text-sm">
        <p>&copy; {new Date().getFullYear()} {brandName}. All rights reserved.</p>
      </footer>
    </main>
  );
}
