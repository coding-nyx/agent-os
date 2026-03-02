import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { BootLoader } from '@/components/ui/boot-loader';
import { AnimatePresence } from 'framer-motion';

export default function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate('/admin/login');
      } else if (location.pathname === '/admin') {
        navigate('/admin/dashboard');
      }
    }
  }, [user, loading, navigate, location]);

  if (loading) {
    return (
        <AnimatePresence>
            <BootLoader message="Checking access..." />
        </AnimatePresence>
    );
  }

  return null;
}
