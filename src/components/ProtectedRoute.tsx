import React, { useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { useNavigate, useLocation } from 'react-router-dom';
import { BootLoader } from './ui/boot-loader';

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
  allowGuest?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  redirectTo = '/admin/login',
  allowGuest = false
}) => {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated && !allowGuest) {
      navigate(`${redirectTo}?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true });
    }
  }, [loading, isAuthenticated, allowGuest, navigate, redirectTo, location.pathname]);

  if (loading) {
    return <BootLoader />;
  }

  if (!isAuthenticated && !allowGuest) {
    return null; // Will redirect via useEffect
  }

  return <>{children}</>;
};
