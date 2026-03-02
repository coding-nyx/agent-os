import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AppNavbar } from '../../layout/app-navbar';

interface TherapistLayoutProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
}

export function TherapistLayout({ children, title, showBack }: TherapistLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden relative">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-200/20 dark:bg-indigo-900/10 rounded-full blur-[100px]"
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-rose-100/20 dark:bg-rose-900/10 rounded-full blur-[120px]"
          animate={{
            x: [0, -40, 0],
            y: [0, -50, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
      </div>

      <AppNavbar />

      {/* Main Content Area */}
      <main className="relative z-10 container mx-auto px-4 py-8 h-[calc(100vh-80px)] overflow-y-auto scrollbar-hide">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="h-full"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
