import { ReactNode } from 'react';
import AppShell from '@/components/layouts/AppShell';

interface SettingsLayoutProps {
  children: ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
