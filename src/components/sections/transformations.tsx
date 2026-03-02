'use client';

import { useData } from '@/lib/data-provider';
import { Transformation } from '@/lib/types';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { useTrainerSlug } from '@/components/TrainerContext';
import { TransformationDetailModal } from '@/components/ui/transformation-detail-modal';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';

export function Transformations() {
  const { getTransformations } = useData();
  const slug = useTrainerSlug();
  const [items, setItems] = useState<Transformation[]>([]);
  const [selectedItem, setSelectedItem] = useState<Transformation | null>(null);

  useEffect(() => {
    if (slug) {
      getTransformations(slug).then(setItems);
    }
  }, [getTransformations, slug]);

  if (items.length === 0) return null;

  return (
    <section id="transformations" className="py-24 bg-primary/5 dark:bg-white/5 border-y border-border/5">
      <div className="container px-4 mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-black uppercase mb-4">Real Results</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            See the incredible transformations achieved by people just like you.
          </p>
        </div>

        <Carousel className="w-full max-w-5xl mx-auto">
          <CarouselContent className="-ml-4">
            {items.map((item, idx) => (
              <CarouselItem key={item.id} className="pl-4 md:basis-1/2 lg:basis-1/3 p-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="h-full"
                >
                  <Card
                    className="overflow-hidden border-border/50 h-full cursor-pointer hover:border-primary/50 transition-colors group bg-card"
                    onClick={() => setSelectedItem(item)}
                  >
                    <CardContent className="p-0">
                      <div className="grid grid-cols-2 gap-0.5 bg-border">
                        <div className="relative aspect-[3/4] group-hover:opacity-90 transition-opacity">
                          {/* Placeholder for real images */}
                          <div className="absolute inset-0 bg-muted flex items-center justify-center text-muted-foreground font-bold">BEFORE</div>
                          <img src={item.beforeImage} alt="Before" className="w-full h-full object-cover relative z-10" />
                        </div>
                        <div className="relative aspect-[3/4] group-hover:opacity-90 transition-opacity">
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center text-primary font-bold">AFTER</div>
                          <img src={item.afterImage} alt="After" className="w-full h-full object-cover relative z-10" />
                        </div>
                      </div>
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-lg">{item.clientName}</h3>
                          <div className="bg-primary/10 text-primary p-2 rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <ArrowRight size={16} />
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                      </div>
                    </CardContent>
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
      </div>

      {selectedItem && (
        <TransformationDetailModal
            item={selectedItem}
            isOpen={!!selectedItem}
            onClose={() => setSelectedItem(null)}
        />
      )}
    </section>
  );
}
