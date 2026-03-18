import { ReactNode } from 'react';
import AppShell from '@/components/layouts/AppShell';

export default function IdeasLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
