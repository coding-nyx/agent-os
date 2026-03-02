'use client';

import React, { createContext, useContext } from 'react';
import { BrandIdentity } from '@/lib/types';

type BrandIdentityContextValue = {
  identity: BrandIdentity | null;
  loading: boolean;
};

export const TrainerContext = createContext<string>("");
export const BrandIdentityContext = createContext<BrandIdentityContextValue>({
  identity: null,
  loading: true,
});

export const useTrainerSlug = () => useContext(TrainerContext);
export const useBrandIdentity = () => useContext(BrandIdentityContext);
