'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Instagram, Youtube, Facebook, Twitter, Globe, Play, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useData } from '@/lib/data-provider';
import { useEffect, useState } from 'react';
import { TrainerProfile, SocialLink } from '@/lib/types';
import { useTrainerSlug } from '@/components/TrainerContext';
import ReactPlayer from 'react-player';

// Switch to main import to avoid build resolution issues

export function SocialFeed() {
  const { getProfile } = useData();
  const slug = useTrainerSlug();
  const [profile, setProfile] = useState<TrainerProfile | null>(null);

  useEffect(() => {
    if (slug) {
      getProfile(slug).then(setProfile);
    }
  }, [getProfile, slug]);

  const getIcon = (platform: SocialLink['platform']) => {
      switch(platform) {
          case 'instagram': return <Instagram className="h-4 w-4" />;
          case 'youtube': return <Youtube className="h-4 w-4" />;
          case 'facebook': return <Facebook className="h-4 w-4" />;
          case 'twitter': return <Twitter className="h-4 w-4" />;
          default: return <Globe className="h-4 w-4" />;
      }
  };

  const getLabel = (platform: SocialLink['platform']) => {
      return platform.charAt(0).toUpperCase() + platform.slice(1);
  };

  const getLinksByPlatform = (platform: SocialLink['platform']) => {
      if (!profile) return [];
      const links = profile.socialLinks?.filter(link => link.platform === platform) || [];

      // Legacy Fallback
      if (links.length === 0) {
          if (platform === 'instagram' && profile.instagramUrl) return [{ platform: 'instagram', url: profile.instagramUrl }];
          if (platform === 'youtube' && profile.youtubeUrl) return [{ platform: 'youtube', url: profile.youtubeUrl }];
      }
      return links;
  };

  const instagramLinks = getLinksByPlatform('instagram');
  const youtubeLinks = getLinksByPlatform('youtube');

  // Use profile specific URLs for the profile buttons if available, otherwise fallback to the first link found
  // However, usually "instagramUrl" on profile is the profile link, and socialLinks are posts.
  // We will assume profile.instagramUrl is the profile link.
  const instagramProfileLink = profile?.instagramUrl || (instagramLinks.length > 0 ? instagramLinks[0].url : '');
  const youtubeProfileLink = profile?.youtubeUrl || (youtubeLinks.length > 0 ? youtubeLinks[0].url : '');

  useEffect(() => {
    if (instagramLinks.length === 0) return;
    if (typeof window === 'undefined') return;

    const processEmbeds = () => {
      if (typeof window !== 'undefined' && (window as any).instgrm?.Embeds?.process) {
        (window as any).instgrm.Embeds.process();
      }
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.instagram.com/embed.js"]');
    if (existing) {
      processEmbeds();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.instagram.com/embed.js';
    script.async = true;
    script.onload = processEmbeds;
    document.body.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [instagramLinks]);

  return (
    <section className="py-24 bg-primary/5 dark:bg-white/5 overflow-hidden border-y border-border/5">
      <div className="container px-4 mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
           <div>
             <h2 className="text-4xl font-black uppercase mb-2">Connect</h2>
             <p className="text-muted-foreground">Follow the journey</p>
           </div>
           <div className="flex flex-wrap gap-4">
             {instagramProfileLink && (
               <Button variant="outline" className="gap-2 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all duration-300" asChild>
                 <a href={instagramProfileLink} target="_blank" rel="noopener noreferrer">
                   <Instagram className="h-4 w-4" /> Instagram
                 </a>
               </Button>
             )}
             {youtubeProfileLink && (
               <Button variant="outline" className="gap-2 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all duration-300" asChild>
                 <a href={youtubeProfileLink} target="_blank" rel="noopener noreferrer">
                   <Youtube className="h-4 w-4" /> YouTube
                 </a>
               </Button>
             )}
           </div>
        </div>

        {/* Instagram Grid - Dynamic to # of links */}
        {instagramLinks.length > 0 && (
            <div className="mb-12 flex flex-col items-center text-center">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2 self-start">
                 <Instagram className="text-primary" /> Latest Posts
              </h3>
              <div className="flex flex-wrap justify-start gap-4 w-full">
                {instagramLinks.map((link, idx) => {
                  return (
                    <Card 
                      key={idx}
                      className="group relative w-full max-w-[280px] aspect-square flex flex-col items-center justify-center gap-4 bg-muted/20 border-border/50 hover:border-primary/50 transition-all hover:bg-muted/40 cursor-pointer overflow-hidden"
                      onClick={() => window.open(link.url, '_blank')}
                    >
                        <div className="absolute inset-0 bg-linear-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        
                        <div className="h-16 w-16 rounded-full bg-background flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform duration-300 z-10">
                            <Instagram className="h-8 w-8 text-primary" />
                        </div>
                        
                        <div className="text-center z-10 space-y-1">
                            <p className="font-bold text-foreground">Instagram Post</p>
                            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 group-hover:text-primary transition-colors">
                                View on Instagram <ExternalLink className="h-3 w-3" />
                            </p>
                        </div>
                    </Card>
                  );
                })}
              </div>
            </div>
        )}

        {/* YouTube Grid - Dynamic to # of links */}
        {youtubeLinks.length > 0 && (
            <div className="flex flex-col text-left">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                 <Youtube className="text-primary" /> Recent Training Videos
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                {youtubeLinks.map((link, idx) => {
                  const embedUrl = link.url.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/");
                  return (
                    <Card key={idx} className="w-full aspect-video bg-black rounded-xl overflow-hidden relative border-none shadow-lg">
                       <iframe
                          src={embedUrl}
                          className="w-full h-full"
                          title={`YouTube video player ${idx}`}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                       ></iframe>
                    </Card>
                  );
                })}
              </div>
            </div>
        )}
      </div>
    </section>
  );
}
