'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '@/components/layout/navbar';
import { Hero } from '@/components/sections/hero';
import { About } from '@/components/sections/about';
import { Transformations } from '@/components/sections/transformations';
import { Classes } from '@/components/sections/classes';
import { SocialFeed } from '@/components/sections/social-feed';
import { Contact } from '@/components/sections/contact';
import { useData } from '@/lib/data-provider';
import { BrandIdentity } from '@/lib/types';
import { DEFAULT_BRAND_NAME } from '@/lib/constants';
import { TrainerContext, BrandIdentityContext } from '@/components/TrainerContext';

export function TrainerPage({ slug }: { slug: string }) {
  const { getBrandIdentity } = useData();
  const [brand, setBrand] = useState<BrandIdentity | null>(null);
  const [brandLoading, setBrandLoading] = useState(true);

  useEffect(() => {
    let isActive = true;
    setBrandLoading(true);
    getBrandIdentity(slug)
      .then((identity) => {
        if (!isActive) return;
        setBrand(identity);
        setBrandLoading(false);
      })
      .catch(() => {
        if (!isActive) return;
        setBrand(null);
        setBrandLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [getBrandIdentity, slug]);

  useEffect(() => {
    if (!brandLoading && brand?.brandName) {
      document.title = `${brand.brandName} | ${slug}`;
    } else if (!brandLoading) {
      document.title = `${DEFAULT_BRAND_NAME} | ${slug}`;
    }
  }, [brand, brandLoading, slug]);

  const brandName = brand?.brandName || (brandLoading ? '' : DEFAULT_BRAND_NAME);

  return (
    <TrainerContext.Provider value={slug}>
      <BrandIdentityContext.Provider value={{ identity: brand, loading: brandLoading }}>
        <Navbar />
        <Hero />
        <About />
        <Transformations />
        <Classes />
        <SocialFeed />
        <Contact />

        <footer className="py-8 bg-background border-t border-border/50 text-center text-muted-foreground text-sm">
          <p>&copy; {new Date().getFullYear()} {brandName}. All rights reserved.</p>
        </footer>
      </BrandIdentityContext.Provider>
    </TrainerContext.Provider>
  );
}
