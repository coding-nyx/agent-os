'use client';

import { useData } from '@/lib/data-provider';
import { Certification, TrainerProfile } from '@/lib/types';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Award, User } from 'lucide-react';
import { useTrainerSlug } from '@/components/TrainerContext';

export function About() {
  const { getProfile, getCertifications } = useData();
  const slug = useTrainerSlug();
  const [profile, setProfile] = useState<TrainerProfile | null>(null);
  const [certs, setCerts] = useState<Certification[]>([]);

  useEffect(() => {
    if (slug) {
      getProfile(slug).then(setProfile);
      getCertifications(slug).then(setCerts);
    }
  }, [getProfile, getCertifications, slug]);

  if (!profile) return null;

  const getExperienceValue = () => {
      const years = profile.experienceYears || 0;
      if (years > 0) return `${years}+`;
      return "0";
  };

  const getClientsValue = () => {
      let count = profile.clientsHandled || 0;
      if (profile.clientsHandledRounded) {
          count = Math.floor(count / 10) * 10;
          return `${count}+`;
      }
      return `${count}`;
  };

  return (
    <section id="about" className="py-24 bg-background">
      <div className="container px-4 mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Left: Bio & Image */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center space-x-4 mb-6">
                {profile.profileImageUrl ? (
                    <img src={profile.profileImageUrl} alt={profile.name} className="w-20 h-20 rounded-full object-cover border-2 border-primary shadow-lg" />
                ) : (
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
                        <User className="text-primary h-10 w-10" />
                    </div>
                )}
                <div>
                    <span className="text-primary font-bold uppercase tracking-widest block text-sm">About Me</span>
                    <h2 className="text-4xl font-bold">{profile.name}</h2>
                </div>
            </div>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              {profile.bio}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card p-4 rounded-xl border border-border/50 text-center">
                <span className="block text-3xl font-black text-primary">{getExperienceValue()}</span>
                <span className="text-sm text-muted-foreground uppercase">Years Exp.</span>
              </div>
              <div className="bg-card p-4 rounded-xl border border-border/50 text-center">
                <span className="block text-3xl font-black text-primary">{getClientsValue()}</span>
                <span className="text-sm text-muted-foreground uppercase">Clients</span>
              </div>
            </div>
          </motion.div>

          {/* Right: Certifications */}
          {certs.length > 0 && (
            <motion.div
               initial={{ opacity: 0, x: 50 }}
               whileInView={{ opacity: 1, x: 0 }}
               viewport={{ once: true }}
               transition={{ duration: 0.5 }}
            >
               <h3 className="text-2xl font-bold mb-6 flex items-center gap-2">
                 <Award className="h-6 w-6 text-primary" /> Certifications & Expertise
               </h3>
               <div className="space-y-4">
                 {certs.map((cert) => (
                   <Card key={cert.id} className="bg-card border-border/50 hover:border-primary transition-colors">
                     <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                       <CardTitle className="text-base font-semibold">{cert.title}</CardTitle>
                       <Badge variant="outline">{cert.issuer}</Badge>
                     </CardHeader>
                     <CardContent>
                       <p className="text-sm text-muted-foreground">Issued: {cert.date}</p>
                       {(cert.url || cert.imageUrl) && (
                           <div className="mt-2 flex gap-2 text-xs">
                               {cert.url && <a href={cert.url} target="_blank" className="text-primary hover:underline">Verify</a>}
                               {cert.imageUrl && <a href={cert.imageUrl} target="_blank" className="text-primary hover:underline">View</a>}
                           </div>
                       )}
                     </CardContent>
                   </Card>
                 ))}
               </div>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
