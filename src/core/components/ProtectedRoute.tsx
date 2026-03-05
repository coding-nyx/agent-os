
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { BootLoader } from './BootLoader';

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
}

export function ProtectedRoute({ children, redirectTo = "/" }: ProtectedRouteProps) {
  const { isAuthenticated, isGuest, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated && !isGuest) {
      navigate(`${redirectTo}?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true });
    }
  }, [loading, isAuthenticated, isGuest, navigate, redirectTo, location.pathname]);

  if (loading) {
    return <BootLoader />;
  }

  if (!isAuthenticated && !isGuest) {
    return null; 
  }

  return <>{children}</>;
}
