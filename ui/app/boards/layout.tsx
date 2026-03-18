import { ReactNode } from 'react';
import AppShell from '@/components/layouts/AppShell';

interface BoardsLayoutProps {
  children: ReactNode;
}

export default function BoardsLayout({ children }: BoardsLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
