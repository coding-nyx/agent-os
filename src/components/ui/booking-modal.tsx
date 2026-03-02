import React from 'react';
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GymClass, Booking } from '@/lib/types'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTrainerSlug } from '@/components/TrainerContext'
import { Loader2 } from 'lucide-react'
import { useData } from '@/lib/data-provider'
import emailjs from '@emailjs/browser';

interface BookingModalProps {
  gymClass: GymClass;
  isOpen: boolean;
  onClose: () => void;
}

export function BookingModal({ gymClass, isOpen, onClose }: BookingModalProps) {
  const navigate = useNavigate();
  const slug = useTrainerSlug();
  const { addBooking } = useData();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
        const price = gymClass.price || 0;
        const bookingData: Omit<Booking, 'id'> = {
            classId: gymClass.id,
            classTitle: gymClass.title,
            classDate: gymClass.dateIso,
            customerName: formData.name,
            customerEmail: formData.email,
            customerPhone: formData.phone,
            status: price > 0 ? 'pending' : 'confirmed',
            createdAt: new Date().toISOString()
        };

        const bookingId = await addBooking(slug, bookingData);

        if (price > 0) {
            setLoading(false);
            // Redirect to payment
            navigate(`/payment?amount=${price}&class=${encodeURIComponent(gymClass.title)}&trainer=${slug}&bookingId=${bookingId}`);
            return;
        }

        // Free Class - Success Logic
        // Send email via EmailJS
        const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
        const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
        const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

        if (serviceId && templateId && publicKey) {
            await emailjs.send(serviceId, templateId, {
                to_email: formData.email,
                to_name: formData.name,
                class_name: gymClass.title,
                class_time: gymClass.time,
                trainer_name: slug, // Or fetch actual trainer name if needed, using slug for now
                message: `You have successfully booked ${gymClass.title}.`,
            }, publicKey);
        } else {
            console.warn("EmailJS environment variables missing. Email not sent.");
        }

        setLoading(false);
        setSuccess(true);
    } catch (error) {
        console.error("Booking failed:", error);
        setLoading(false);
        // Ideally show an error message to user
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        {success ? (
            <div className="py-6 text-center space-y-4">
                <div className="text-primary font-bold text-xl">Booking Confirmed!</div>
                <p className="text-muted-foreground">
                    You have successfully booked <strong>{gymClass.title}</strong>.
                    A confirmation email has been sent to {formData.email}.
                </p>
                <Button onClick={onClose} className="w-full">Done</Button>
            </div>
        ) : (
            <form onSubmit={handleSubmit}>
                <DialogHeader>
                <DialogTitle>Book {gymClass.title}</DialogTitle>
                <DialogDescription>
                    Fill in your details to secure your spot.
                    <span className="block mt-2 font-bold text-primary">
                        Price: {gymClass.price && gymClass.price > 0 ? `$${gymClass.price}` : 'Free'}
                    </span>
                </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">
                    Name
                    </Label>
                    <Input id="name" name="name" value={formData.name} onChange={handleChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="email" className="text-right">
                    Email
                    </Label>
                    <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} className="col-span-3" required />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="phone" className="text-right">
                    Mobile
                    </Label>
                    <Input id="phone" name="phone" type="tel" value={formData.phone} onChange={handleChange} className="col-span-3" required />
                </div>
                </div>
                <DialogFooter>
                <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm Booking
                </Button>
                </DialogFooter>
            </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
