import { ReactNode } from 'react';
import AppShell from '@/components/layouts/AppShell';

interface DocsLayoutProps {
  children: ReactNode;
}

export default function DocsLayout({ children }: DocsLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
