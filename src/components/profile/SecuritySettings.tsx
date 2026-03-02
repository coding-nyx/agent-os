
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth-context';
import { getFirebase } from '../../lib/firebase';
import { updateProfile, updateEmail, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Loader2, ShieldCheck, Lock, User as UserIcon } from 'lucide-react';

export function SecuritySettings() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  useEffect(() => {
      if (user) {
          setDisplayName(user.displayName || '');
          setEmail(user.email || '');
      }
  }, [user]);

  const handleUpdateProfile = async () => {
      if (!user) return;
      setLoading(true);
      setMessage(null);
      try {
          await updateProfile(user, { displayName });
          if (email !== user.email) {
              await updateEmail(user, email);
          }
          setMessage({ type: 'success', text: "Profile updated successfully." });
      } catch (e: any) {
          setMessage({ type: 'error', text: e.message });
      } finally {
          setLoading(false);
      }
  };

  const handleChangePassword = async () => {
      if (!user || !newPassword) return;
      setLoading(true);
      setMessage(null);
      try {
          // Re-auth needed for sensitive operations
          const credential = EmailAuthProvider.credential(user.email!, currentPassword);
          await reauthenticateWithCredential(user, credential);
          await updatePassword(user, newPassword);
          setMessage({ type: 'success', text: "Password changed successfully." });
          setCurrentPassword('');
          setNewPassword('');
      } catch (e: any) {
          setMessage({ type: 'error', text: "Failed to update password. Check current password." });
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="space-y-6">
      {/* Identity */}
      <Card>
          <CardHeader>
              <CardTitle>Public Profile</CardTitle>
              <CardDescription>Manage how you appear across the platform.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                  <Avatar className="w-20 h-20">
                      <AvatarImage src={user?.photoURL || ''} />
                      <AvatarFallback className="text-xl bg-slate-100 dark:bg-slate-800">
                          {user?.displayName?.charAt(0) || <UserIcon />}
                      </AvatarFallback>
                  </Avatar>
                  <Button variant="outline" size="sm">Change Avatar</Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                      <Label>Display Name</Label>
                      <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                      <Label>Email Address</Label>
                      <Input value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
              </div>
          </CardContent>
          <CardFooter>
              <Button onClick={handleUpdateProfile} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin mr-2" /> : null} Save Changes
              </Button>
          </CardFooter>
      </Card>

      {/* Security */}
      <Card>
          <CardHeader>
              <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <CardTitle>Security</CardTitle>
              </div>
              <CardDescription>Update your login credentials.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
              <div className="space-y-2">
                  <Label>Current Password</Label>
                  <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              
              {message && (
                  <div className={`text-sm p-3 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {message.text}
                  </div>
              )}
          </CardContent>
          <CardFooter>
              <Button onClick={handleChangePassword} disabled={loading || !currentPassword || !newPassword}>
                  {loading ? <Loader2 className="animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />} 
                  Update Password
              </Button>
          </CardFooter>
      </Card>
    </div>
  );
}
