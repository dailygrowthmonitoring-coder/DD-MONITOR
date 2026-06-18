import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'DD Monitor',
  description: 'Enterprise observability for Dell Data Domain backup appliances — Zain Iraq',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = (cookieStore.get('x-dd-theme')?.value === 'light' ? 'light' : 'dark') as 'dark' | 'light';

  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
