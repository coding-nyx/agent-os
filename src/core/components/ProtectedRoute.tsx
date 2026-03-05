import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { BootLoader } from './BootLoader';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOnboarding?: boolean;
}

export function ProtectedRoute({ children, requireOnboarding = true }: ProtectedRouteProps) {
  const { isAuthenticated, isGuest, profile, loading: authLoading } = useAuth();
  const { isLoading: vaultLoading } = useVault();
  const { isLoading: soulLoading } = useGlobalSoul();
  
  const navigate = useNavigate();
  const location = useLocation();

  const isEverythingLoading = authLoading || (isAuthenticated && !isGuest && (vaultLoading || soulLoading));

  useEffect(() => {
    if (isEverythingLoading) return;

    if (!isAuthenticated && !isGuest) {
      navigate(`/?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true });
      return;
    }

    // Redirect authenticated users into orchestrator until their core profile is initialized and complete
    if (isAuthenticated && !isGuest && requireOnboarding && (!profile || !profile.onboardingComplete)) {
      if (location.pathname !== '/orchestrator') {
        navigate('/orchestrator', { replace: true });
      }
    }
  }, [isEverythingLoading, isAuthenticated, isGuest, profile, navigate, location.pathname, requireOnboarding]);

  if (isEverythingLoading) {
    return <BootLoader />;
  }

  if (!isAuthenticated && !isGuest) {
    return null; 
  }

  return <>{children}</>;
}
