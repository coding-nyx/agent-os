import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Sun, Moon, ArrowLeft } from 'lucide-react';
import { useTheme } from '@/components/ThemeContext';
import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useData } from '@/lib/data-provider';
import { BrandIdentity } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrandIcon } from '@/components/layout/brand-icon';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { getBrandIdentity } = useData();
  const [identity, setIdentity] = useState<BrandIdentity | null>(null);
  const [loadingIdentity, setLoadingIdentity] = useState(true);

  useEffect(() => {
    document.title = 'Trainer Portal';
    getBrandIdentity('platform').then(id => {
        setIdentity(id);
        setLoadingIdentity(false);
    });
  }, [getBrandIdentity]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (await login(email, password)) {
      navigate('/admin/dashboard');
    } else {
      setError('Invalid credentials');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div className="absolute top-4 left-4">
          <Button variant="ghost" asChild className="gap-2">
              <Link to="/">
                  <ArrowLeft className="h-4 w-4" /> Back to Home
              </Link>
          </Button>
      </div>
      <div className="absolute top-4 right-4">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle Theme">
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
      </div>
      <Card className="w-full max-w-md border-border/50">
        <CardHeader className="text-center">
          <BrandIcon 
            logoUrl={identity?.logoUrl} 
            brandName={identity?.brandName || 'Admin'} 
            loading={loadingIdentity} 
            logoScale={identity?.logoScale} 
            size="lg"
            className="mx-auto mb-4"
          />
          <CardTitle className="text-2xl">Trainer Portal</CardTitle>
          <CardDescription>Enter your credentials to access the dashboard</CardDescription>
        </CardHeader>

        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            {identity?.logoUrl && (
                <div className="flex items-center justify-between p-2 border rounded-md bg-muted/20">
                    <span className="text-xs font-medium">Preview Scale</span>
                    <Select value={identity.logoScale || 'fit'} onValueChange={(val: 'fit' | 'fill') => setIdentity({...identity, logoScale: val})}>
                        <SelectTrigger className="w-[100px] h-8 text-xs">
                            <SelectValue placeholder="Scale" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="fit">Fit</SelectItem>
                            <SelectItem value="fill">Fill</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
