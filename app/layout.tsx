import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/session";

import "./globals.css";

const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  variable: "--font-archivo",
  display: "swap",
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: { default: "Halflife", template: "%s · Halflife" },
  description:
    "A spaced-repetition study tool whose review scheduler is a trained model. It predicts the half-life of each memory and schedules the next review for the moment recall falls to your target.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#151517" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en" className={archivo.variable}>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader user={session?.user ?? null} />
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 sm:px-6">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
