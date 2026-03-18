import { ReactNode } from 'react';
import AppShell from '@/components/layouts/AppShell';

interface AnalyticsLayoutProps {
  children: ReactNode;
}

export default function AnalyticsLayout({ children }: AnalyticsLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
