import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Real-time AI Simulation Engine',
  description: 'Core systems demonstration for real-time AI agent interactions',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
