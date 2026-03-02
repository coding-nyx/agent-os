import * as React from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Brain, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { useTheme } from '@/components/ThemeContext';
import { DEFAULT_BRAND_NAME } from '@/lib/constants';
import { useBrandIdentity } from '@/components/TrainerContext';
import { useAuth } from '@/lib/auth-context';
import { BrandIcon } from './brand-icon';

export function HomeNavbar() {
  const { theme, toggleTheme } = useTheme();
  const { identity, loading } = useBrandIdentity();
  const { user } = useAuth();
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const brandName = identity?.brandName || (loading ? '' : DEFAULT_BRAND_NAME);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 100 }}
      className={`fixed top-0 left-0 right-0 z-50 w-full transition-all duration-500 ${
        isScrolled 
          ? "border-b border-border/40 bg-background/95 backdrop-blur-md py-2 shadow-sm" 
          : "bg-transparent py-4"
      }`}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center space-x-3 font-bold text-xl uppercase tracking-tighter hover:opacity-90 transition-all group">
            <BrandIcon 
                logoUrl={identity?.logoUrl} 
                brandName={brandName} 
                loading={loading} 
                logoScale={identity?.logoScale} 
                isScrolled={isScrolled}
            />
            <span className={`transition-colors duration-300 ${
                isScrolled 
                    ? "text-foreground group-hover:text-primary" 
                    : "text-white drop-shadow-md"
            }`}>
              {brandName}
            </span>
        </Link>

        {/* Actions */}
        <div className="flex items-center space-x-4">
          <Link to="/therapy">
             <Button 
                variant="ghost" 
                size="sm"
                className={`gap-2 transition-colors duration-300 ${
                    !isScrolled ? "text-white hover:bg-white/10 hover:text-white" : ""
                }`}
             >
                <Brain className="w-4 h-4" />
                <span className="hidden sm:inline">Mental Wellness</span>
             </Button>
          </Link>

          {user ? (
              <Link to="/profile">
                  <Button variant="ghost" size="icon" className={`rounded-full ${!isScrolled ? "text-white hover:bg-white/10" : ""}`}>
                      <User className="w-5 h-5" />
                  </Button>
              </Link>
          ) : (
              <Link to="/vault">
                  <Button variant={isScrolled ? "default" : "secondary"} size="sm">
                      Login
                  </Button>
              </Link>
          )}

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleTheme} 
            aria-label="Toggle Theme"
            className={`transition-colors duration-300 ${
                !isScrolled ? "text-white hover:bg-white/10" : ""
            }`}
          >
              {theme === 'dark' ? <Sun className="h-5 w-5 text-yellow-500" /> : <Moon className="h-5 w-5 text-slate-700" />}
          </Button>
        </div>
      </div>
    </motion.nav>
  );
}
