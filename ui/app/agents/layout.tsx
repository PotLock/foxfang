import { ReactNode } from 'react';
import AppShell from '@/components/layouts/AppShell';

interface AgentsLayoutProps {
  children: ReactNode;
}

export default function AgentsLayout({ children }: AgentsLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
