import '../../../../design-system/tokens.css';
import '../../../../design-system/components.css';
import type { ReactNode } from 'react';
import { copy } from '@greenci/core';
export const metadata = { title: copy.name };
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
