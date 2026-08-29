import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Recordcrate — Track albums you love",
  description: "Log, rate, and review albums. Like Letterboxd for music.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Navbar />
        <main className="max-w-5xl mx-auto px-3 sm:px-4 py-5 sm:py-8">{children}</main>
        {/* App Store review opens the privacy and support URLs and checks they
            are reachable. A policy that exists only if you know to type the path
            reads as one that is not really there. */}
        <footer className="mx-auto max-w-5xl px-3 pb-8 pt-4 sm:px-4">
          <div className="flex items-center gap-4 border-t border-zinc-900 pt-4 text-[11px] text-zinc-600">
            <Link href="/privacy" className="transition-colors hover:text-zinc-400">
              Privacy
            </Link>
            <Link href="/support" className="transition-colors hover:text-zinc-400">
              Support
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
