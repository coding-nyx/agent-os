'use client';

import { useData } from '@/lib/data-provider';
import { GymClass } from '@/lib/types';
import { useTrainerSlug } from '@/components/TrainerContext';
import { motion } from 'framer-motion';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState } from 'react';
import { CountdownTimer } from '@/components/ui/countdown-timer';
import { BookingModal } from '@/components/ui/booking-modal';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';

export function Classes() {
  const { getClasses } = useData();
  const slug = useTrainerSlug();
  const [items, setItems] = useState<GymClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<GymClass | null>(null);

  useEffect(() => {
    if (slug) {
      getClasses(slug).then((data) => {
        const now = new Date();
        const upcoming = data.filter(c => {
          if (c.dateIso) {
            return new Date(c.dateIso) > now;
          }
          return false;
        });
        // Sort by date
        upcoming.sort((a, b) => {
          const dateA = a.dateIso ? new Date(a.dateIso).getTime() : 0;
          const dateB = b.dateIso ? new Date(b.dateIso).getTime() : 0;
          return dateA - dateB;
        });
        setItems(upcoming);
      });
    }
  }, [getClasses, slug]);

  return (
    <section id="classes" className="py-24 bg-background">
      <div className="container px-4 mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-black uppercase mb-4">Class Schedule</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Join our high-energy group sessions designed to push your limits.
          </p>
        </div>

        {items.length > 0 ? (
          <Carousel className="w-full max-w-5xl mx-auto">
            <CarouselContent className="-ml-4">
            {items.map((item, idx) => (
              <CarouselItem key={item.id} className="pl-4 md:basis-1/2 lg:basis-1/3 p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                    className={`h-full ${item.enrolledSpots >= item.maxSpots ? 'opacity-80' : ''}`}
                >
                    <Card className={`h-full flex flex-col bg-background/50 border border-border/40 hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(var(--primary),0.2)] dark:bg-white/[0.03] dark:backdrop-blur-md ${item.enrolledSpots >= item.maxSpots ? '' : 'shadow-sm'}`}>
                    <CardHeader>
                        <div className="flex justify-between items-start mb-2">
                        <div className="flex flex-col gap-1">
                            <Badge variant="secondary" className="w-fit bg-background/80 border border-border/50 text-foreground/80 font-semibold shadow-xs backdrop-blur-sm">{item.time.split(' ')[0]}</Badge>
                            <CountdownTimer targetDate={item.dateIso || new Date().toISOString()} />
                        </div>
                        <Badge variant={item.enrolledSpots >= item.maxSpots ? "destructive" : "outline"}>
                            {item.enrolledSpots >= item.maxSpots ? "FULL" : `${item.maxSpots - item.enrolledSpots} Spots Left`}
                        </Badge>
                        </div>
                        <CardTitle className="text-xl">{item.title}</CardTitle>
                        <CardDescription>{item.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-4">
                        <div className="flex items-center text-sm font-medium">
                        <Clock className="mr-2 h-4 w-4 text-primary" />
                        {item.time} ({item.durationMinutes} mins)
                        </div>
                        <div className="flex items-center text-sm font-medium">
                        <Users className="mr-2 h-4 w-4 text-primary" />
                        Capacity: {item.maxSpots}
                        </div>
                        <div className="flex items-center text-sm font-medium">
                        {/* Placeholder for price */}
                        Price: {item.price ? `$${item.price}` : 'Free'}
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button
                            className="w-full"
                            disabled={item.enrolledSpots >= item.maxSpots}
                            onClick={() => setSelectedClass(item)}
                        >
                        {item.enrolledSpots >= item.maxSpots ? "Join Waitlist" : "Book Class"}
                        </Button>
                    </CardFooter>
                    </Card>
                </motion.div>
              </CarouselItem>
            ))}
            </CarouselContent>
            <div className="hidden md:flex justify-end gap-2 mt-4">
                <CarouselPrevious className="static translate-y-0" />
                <CarouselNext className="static translate-y-0" />
            </div>
          </Carousel>
        ) : (
          <div className="text-center py-12 bg-muted/10 border border-border rounded-lg max-w-2xl mx-auto">
            <p className="text-muted-foreground text-lg">No upcoming classes scheduled. Check back soon!</p>
          </div>
        )}
      </div>

      {selectedClass && (
        <BookingModal
            gymClass={selectedClass}
            isOpen={!!selectedClass}
            onClose={() => setSelectedClass(null)}
        />
      )}
    </section>
  );
}
