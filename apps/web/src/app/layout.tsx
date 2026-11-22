import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { AuthProvider, ToastProvider, ThemeProvider, NetworkStatusProvider } from '@/providers';
import { GlobalNetworkBanner } from '@/components/ui/GlobalNetworkBanner';
import './globals.css';
import '@/styles/components/scrollbar.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'FiberOps: On-Premise FTTH Operations & Network Monitoring',
  description:
    'Single Source of Truth untuk Pengelolaan Master Data Jaringan, Tiket Lapangan, Monitoring Redaman Optik, dan Asisten AI On-Premise.',
  icons: {
    icon: [
      {
        url: '/assets/Lintasarta-Icon.svg',
        type: 'image/svg+xml',
      },
    ],
    shortcut: '/assets/Lintasarta-Icon.svg',
    apple: '/assets/Lintasarta-Icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={plusJakartaSans.variable} suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('fiberops_theme');var m=document.querySelector('meta[name="color-scheme"]');if(m){m.setAttribute('content',t==='dark'||t==='light'?t:'light dark');}var isDark=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(isDark){document.documentElement.classList.add('dark');document.documentElement.setAttribute('data-theme','dark');}else{document.documentElement.classList.remove('dark');document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={plusJakartaSans.className} suppressHydrationWarning>
        <ThemeProvider>
          <NetworkStatusProvider>
            <AuthProvider>
              <ToastProvider>
                <GlobalNetworkBanner />
                {children}
              </ToastProvider>
            </AuthProvider>
          </NetworkStatusProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
