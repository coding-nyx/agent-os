'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function VerifyPage() {
  const router = useRouter();
  // Ensure this runs only on client
  const { finishLogin } = useAuth();
  const [status, setStatus] = useState('Verifying...');

  useEffect(() => {
    // We need to grab the full URL for verification
    const email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
      setStatus('Error: Email not found. Please try logging in again on the same device.');
      return;
    }

    finishLogin(email, window.location.href)
      .then(() => {
        setStatus('Success! Redirecting...');
        setTimeout(() => router.push('/admin/dashboard/'), 1500);
      })
      .catch((err) => {
        console.error(err);
        setStatus(`Verification failed: ${err.message}`);
      });
  }, [finishLogin, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="max-w-md w-full p-6 text-center">
        <CardHeader>
           <CardTitle>Login Verification</CardTitle>
        </CardHeader>
        <CardContent>
           <p>{status}</p>
        </CardContent>
      </Card>
    </div>
  );
}
