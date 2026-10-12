import './globals.css';

export const metadata = {
  title: {
    default: 'POSTERI — Art for your walls',
    template: '%s — POSTERI',
  },
  description: 'Thoughtful poster editions for every kind of wall.',
};

export const viewport = {
  colorScheme: 'light dark',
  themeColor: '#0b0b0b',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
