import './globals.css';

export const metadata = {
  title: 'MVT Offer Library',
  description: 'Internal offer library for Montecito Village Travel',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
