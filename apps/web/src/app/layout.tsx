import type { ReactNode } from 'react';
import { loadConfig } from '@greenci/core/config';
export const metadata = { title: 'GreenCI' };
export default function Layout({ children }: { children: ReactNode }) {
  loadConfig(process.env);
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
