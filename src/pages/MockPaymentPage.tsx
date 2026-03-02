import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2 } from 'lucide-react';

export default function MockPaymentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'form'>('form');
  const [loading, setLoading] = useState(false);

  const amount = searchParams.get('amount') || '0';
  const className = searchParams.get('class') || 'Training Session';
  const trainerSlug = searchParams.get('trainer') || '';

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus('processing');

    // Simulate payment processing
    setTimeout(() => {
        setLoading(false);
        setStatus('success');
    }, 2000);
  };

  const handleReturn = () => {
    navigate(trainerSlug ? `/trainer?slug=${trainerSlug}` : '/');
  };

  if (status === 'success') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
             <Card className="max-w-md w-full border-primary/20 bg-card">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 bg-primary/10 p-4 rounded-full w-20 h-20 flex items-center justify-center">
                        <CheckCircle2 className="w-10 h-10 text-primary" />
                    </div>
                    <CardTitle className="text-2xl text-primary">Payment Successful!</CardTitle>
                    <CardDescription>You have successfully booked <strong>{className}</strong>.</CardDescription>
                </CardHeader>
                <CardFooter>
                    <Button onClick={handleReturn} className="w-full">Return to Trainer Profile</Button>
                </CardFooter>
             </Card>
        </div>
      );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full border-border bg-card">
        <CardHeader>
          <CardTitle>Secure Payment</CardTitle>
          <CardDescription>Complete your booking for <strong>{className}</strong></CardDescription>
        </CardHeader>
        <CardContent>
            <div className="mb-6">
                <div className="text-sm text-muted-foreground">Amount to pay</div>
                <div className="text-3xl font-bold">${amount}</div>
            </div>

            <form onSubmit={handlePayment} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="card">Card Number</Label>
                    <Input id="card" placeholder="0000 0000 0000 0000" disabled={status === 'processing'} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="expiry">Expiry</Label>
                        <Input id="expiry" placeholder="MM/YY" disabled={status === 'processing'} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="cvc">CVC</Label>
                        <Input id="cvc" placeholder="123" disabled={status === 'processing'} required />
                    </div>
                </div>
                <Button type="submit" className="w-full" disabled={status === 'processing'}>
                    {status === 'processing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Pay Now'}
                </Button>
            </form>
        </CardContent>
      </Card>
    </div>
  );
}
