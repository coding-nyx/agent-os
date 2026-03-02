'use client';

import { useParams } from 'next/navigation';
import { LandingPage } from '@/components/LandingPage';
import { TrainerPage } from '@/components/TrainerPage';
import { useEffect, useState } from 'react';

export function ClientRouter() {
  const params = useParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null; // Avoid hydration mismatch
  }

  // params.slug is an array of strings
  // If we are at root /, params is {} or { slug: undefined } (depending on router state)
  // If we are at /foo, params is { slug: ['foo'] }

  const slugParts = params?.slug as string[] | undefined;

  // Root path -> Landing Page
  if (!slugParts || slugParts.length === 0) {
    return <LandingPage />;
  }

  // For admin routes, we might need to let them pass through if they are handled by other Next.js pages.
  // But strictly speaking, if we are here, it means the catch-all matched.
  // If /admin/login is a separate static page, Next.js router should have matched it.

  const trainerSlug = slugParts[0];

  return <TrainerPage slug={trainerSlug} />;
}
