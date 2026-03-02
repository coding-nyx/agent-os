import { Link } from 'react-router-dom';
import { useData } from '@/lib/data-provider';
import { useEffect, useState } from 'react';
import { BrandIdentity } from '@/lib/types';
import { DEFAULT_BRAND_NAME } from '@/lib/constants';

export function Footer() {
  const { getBrandIdentity } = useData();
  const [brand, setBrand] = useState<BrandIdentity | null>(null);

  useEffect(() => {
    const fetchBrand = async () => {
      try {
        const bData = await getBrandIdentity('platform');
        setBrand(bData);
      } catch (e) {
        console.error("Error loading footer brand data", e);
      }
    };
    fetchBrand();
  }, [getBrandIdentity]);

  const brandName = brand?.brandName || DEFAULT_BRAND_NAME;

  return (
    <footer className="py-12 bg-black border-t border-white/10 text-center text-gray-400 text-sm flex flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <p className="font-medium text-gray-300 tracking-wider uppercase text-xs">
          &copy; {new Date().getFullYear()} {brandName}
        </p>
        <p className="max-w-xs text-[10px] text-gray-600 leading-relaxed uppercase tracking-[0.2em]">
          Premium Fitness Coaching & Elite Performance
        </p>
      </div>
      
      <div className="flex items-center gap-6 mt-4">
        <Link 
          to="/admin/login" 
          className="text-[10px] uppercase tracking-[0.15em] text-gray-600 hover:text-primary transition-colors duration-300"
        >
          Trainer Portal
        </Link>
        <span className="w-1 h-1 rounded-full bg-gray-800" />
        <Link 
          to="/" 
          className="text-[10px] uppercase tracking-[0.15em] text-gray-600 hover:text-primary transition-colors duration-300"
        >
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}
