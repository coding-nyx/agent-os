import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/lib/data-provider";
import { AuthProvider } from "@/lib/auth-context";
import { CustomAlert } from "@/components/ui/custom-alert";
import { FirebaseDataService } from "@/lib/services/firebase-service";
import { DEFAULT_BRAND_NAME } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  let brandName = DEFAULT_BRAND_NAME;
  const description = "Elite Personal Training & Fitness Coaching";

  try {
    // Pass null user for public read access
    const service = new FirebaseDataService(null);
    const identity = await service.getBrandIdentity('platform');
    if (identity && identity.brandName) {
      brandName = identity.brandName;
    }

    // We could also fetch landing page content for description if desired
    // const landing = await service.getLandingPageContent();
    // if (landing && landing.heroSubtitle) description = landing.heroSubtitle;

  } catch (e) {
    console.warn("Failed to fetch dynamic metadata, using defaults", e);
  }

  return {
    title: `${brandName} | Unleash Your Potential`,
    description: description,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AuthProvider>
          <DataProvider>
            {children}
            <CustomAlert />
          </DataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
