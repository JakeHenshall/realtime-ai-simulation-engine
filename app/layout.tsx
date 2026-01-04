import type { Metadata } from 'next';
import { Figtree } from 'next/font/google';
import './globals.css';

const figtree = Figtree({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Real-time AI Simulation Engine',
  description: 'Core systems demonstration for real-time AI agent interactions',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB" className={figtree.className}>
      <body className={figtree.className}>{children}</body>
    </html>
  );
}
