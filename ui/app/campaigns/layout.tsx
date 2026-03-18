import { ReactNode } from 'react';
import AppShell from '@/components/layouts/AppShell';

export const metadata = {
  title: 'Campaigns - FoxFang'
};

interface CampaignsLayoutProps {
  children: ReactNode;
}

export default function CampaignsLayout({ children }: CampaignsLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
