import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X, Sun, Moon, Brain, Dumbbell, Lock, Unlock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { useBrandIdentity, useTrainerSlug } from '@/components/TrainerContext';
import { DEFAULT_BRAND_NAME } from '@/lib/constants';
import { useTheme } from '@/components/ThemeContext';
import { BrandIcon } from './brand-icon';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';

interface AppNavbarProps {
  links?: { href: string; label: string }[];
  cta?: { href: string; label: string };
  transparentOnTop?: boolean;
}

export function AppNavbar({ links = [], cta, transparentOnTop = false }: AppNavbarProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const slug = useTrainerSlug();
  const { theme, toggleTheme } = useTheme();
  const { identity, loading } = useBrandIdentity();
  const { user } = useAuth();
  const { isUnlocked, lockVault } = useVault();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!transparentOnTop) return;
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [transparentOnTop]);

  const toggleMenu = () => setIsOpen(!isOpen);
  const brandName = identity?.brandName || DEFAULT_BRAND_NAME;
  const isLoadingIdentity = Boolean(identity) && loading;
  const brandHref = slug ? `/t/${slug}` : '/';
  const useTransparent = transparentOnTop && !isScrolled;

  const vaultClick = () => {
    if (isUnlocked) {
      lockVault();
      return;
    }
    navigate('/vault');
  };

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 100 }}
      className={`sticky top-0 z-50 w-full transition-all duration-500 ${
        useTransparent
          ? 'bg-transparent py-4'
          : 'border-b border-border/40 bg-background/95 backdrop-blur-md py-2 shadow-sm'
      }`}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to={brandHref} className="flex items-center space-x-3 font-bold text-xl uppercase tracking-tighter hover:opacity-90 transition-all group">
          <BrandIcon
            logoUrl={identity?.logoUrl}
            brandName={brandName}
            loading={isLoadingIdentity}
            logoScale={identity?.logoScale}
            isScrolled={!useTransparent}
          />
          <span className={`transition-colors duration-300 ${
            useTransparent ? 'text-white drop-shadow-md' : 'text-foreground group-hover:text-primary'
          }`}>
            {brandName}
          </span>
        </Link>

        <div className="hidden md:flex items-center space-x-6">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors ${
                useTransparent ? 'text-white/80 hover:text-white' : 'text-muted-foreground hover:text-primary'
              }`}
            >
              {link.label}
            </a>
          ))}

          <Link to="/therapy">
            <Button
              variant="ghost"
              size="sm"
              className={`gap-2 transition-colors duration-300 ${
                useTransparent ? 'text-white hover:bg-white/10 hover:text-white' : ''
              }`}
            >
              <Brain className="w-4 h-4" />
              Therapy
            </Button>
          </Link>

          <Link to="/ai-trainer">
            <Button
              variant="ghost"
              size="sm"
              className={`gap-2 transition-colors duration-300 ${
                useTransparent ? 'text-white hover:bg-white/10 hover:text-white' : ''
              }`}
            >
              <Dumbbell className="w-4 h-4" />
              AI Trainer
            </Button>
          </Link>

          <Button
            variant="ghost"
            size="icon"
            onClick={vaultClick}
            aria-label={isUnlocked ? 'Lock Vault' : 'Unlock Vault'}
            className={`transition-colors duration-300 ${
              useTransparent ? 'text-white hover:bg-white/10' : ''
            }`}
          >
            {isUnlocked ? <Unlock className="h-5 w-5 text-emerald-500" /> : <Lock className="h-5 w-5 text-amber-500" />}
          </Button>

          {user ? (
            <Link to="/profile">
              <Button
                variant="ghost"
                size="icon"
                className={`rounded-full ${useTransparent ? 'text-white hover:bg-white/10' : ''}`}
              >
                <User className="w-5 h-5" />
              </Button>
            </Link>
          ) : (
            <Link to="/vault">
              <Button variant={useTransparent ? 'secondary' : 'default'} size="sm">
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
              useTransparent ? 'text-white hover:bg-white/10' : ''
            }`}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5 text-yellow-500" /> : <Moon className="h-5 w-5 text-slate-700" />}
          </Button>

          {cta && (
            <Button variant="default" size="sm" asChild>
              <a href={cta.href}>{cta.label}</a>
            </Button>
          )}
        </div>

        <div className="md:hidden flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={vaultClick}
            aria-label={isUnlocked ? 'Lock Vault' : 'Unlock Vault'}
            className={`${useTransparent ? 'text-white hover:bg-white/10' : ''}`}
          >
            {isUnlocked ? <Unlock className="h-5 w-5 text-emerald-500" /> : <Lock className="h-5 w-5 text-amber-500" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className={`${useTransparent ? 'text-white hover:bg-white/10' : ''}`}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5 text-yellow-500" /> : <Moon className="h-5 w-5 text-slate-700" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleMenu} aria-label="Toggle Menu">
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className={`md:hidden border-b border-border/40 ${useTransparent ? 'bg-black/70' : 'bg-background'}`}
        >
          <div className="container mx-auto px-4 py-4 flex flex-col space-y-4">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-lg font-medium hover:text-primary transition-colors"
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <Link to="/therapy" className="text-lg font-medium flex items-center gap-2" onClick={() => setIsOpen(false)}>
              <Brain className="w-5 h-5" />
              Therapy
            </Link>
            <Link to="/ai-trainer" className="text-lg font-medium flex items-center gap-2" onClick={() => setIsOpen(false)}>
              <Dumbbell className="w-5 h-5" />
              AI Trainer
            </Link>
            {user ? (
              <Link to="/profile" onClick={() => setIsOpen(false)}>
                <Button className="w-full" variant="outline">Profile</Button>
              </Link>
            ) : (
              <Link to="/vault" onClick={() => setIsOpen(false)}>
                <Button className="w-full">Login</Button>
              </Link>
            )}
            {cta && (
              <Button className="w-full" asChild>
                <a href={cta.href} onClick={() => setIsOpen(false)}>{cta.label}</a>
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
}
