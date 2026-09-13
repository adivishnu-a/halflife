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
  metadataBase: new URL("https://halflifecards.vercel.app"),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f0e8" },
    { media: "(prefers-color-scheme: dark)", color: "#171613" },
  ],
};

// Applies a saved theme before first paint, so there is no flash of the wrong palette.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <SiteHeader user={session?.user ?? null} />
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6 sm:px-6">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
