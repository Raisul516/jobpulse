import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import AuthGate from "./components/AuthGate";
import NavBar from "./components/NavBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JobPulse",
  description: "Personal job alerts for Bangladesh",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* NavBar reads the current address (usePathname), which Next.js wants inside <Suspense>;
            the fallback is an empty bar of the same height so nothing jumps */}
        <Suspense fallback={<div className="h-[53px] border-b border-line bg-surface/80" />}>
          <NavBar />
        </Suspense>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
