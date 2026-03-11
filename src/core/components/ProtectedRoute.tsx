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
  const { isLoading: vaultLoading, hasVault, isUnlocked, isHandshaking } = useVault();
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

    // Vault gate — guests never get redirected here.
    // isHandshaking covers the SESSION auto-unlock window so we don't
    // flash-redirect when the vault is about to unlock automatically.
    if (!isGuest && hasVault && !isUnlocked && !isHandshaking) {
      navigate(`/vault-gate?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true });
      return;
    }

    // Redirect authenticated users into orchestrator until their core profile is initialized and complete
    if (isAuthenticated && !isGuest && requireOnboarding && (!profile || !profile.onboardingComplete)) {
      if (location.pathname !== '/orchestrator') {
        navigate('/orchestrator', { replace: true });
      }
    }
  }, [isEverythingLoading, isAuthenticated, isGuest, hasVault, isUnlocked, isHandshaking, profile, navigate, location.pathname, requireOnboarding]);

  if (isEverythingLoading) {
    return <BootLoader />;
  }

  if (!isAuthenticated && !isGuest) {
    return null; 
  }

  // Null guard while vault-gate redirect is in progress (avoids momentary
  // flash of protected content before navigation completes).
  if (!isGuest && hasVault && !isUnlocked && !isHandshaking) {
    return null;
  }

  return <>{children}</>;
}
