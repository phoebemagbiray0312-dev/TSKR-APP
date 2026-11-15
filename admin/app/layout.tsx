import './globals.css';
import { Poppins } from 'next/font/google';
import AnimatedFavicon from './AnimatedFavicon';

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });
export const metadata = {
  title: 'TSKR', robots: { index: false, follow: false },
  icons: { icon: '/icon.png', apple: '/apple-icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={poppins.className}><AnimatedFavicon />{children}</body>
    </html>
  );
}
