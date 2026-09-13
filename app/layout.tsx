import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Halflife",
  description:
    "A spaced-repetition study tool whose review scheduler is a trained model. It predicts the half-life of each memory and schedules the next review for the moment recall falls to your target.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
