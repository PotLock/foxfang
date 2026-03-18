import { API_BASE_URL } from './client';

export interface ToneProfile {
  doList?: string[];
  dontList?: string[];
  forbiddenWords?: string[];
  ctaPatterns?: string[];
  vocabulary?: string[];
}

export interface BrandProfile {
  id: string;
  projectId: string;
  name?: string;
  tagline?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontPrimary?: string;
  fontSecondary?: string;
  toneKeywords: string[];
  toneProfile?: ToneProfile;
  targetAudience?: string;
  logoPath?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function getBrandProfile(
  userId: string,
  projectId: string
): Promise<BrandProfile | null> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/brand-profile?userId=${encodeURIComponent(userId)}`
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to load brand profile');
  }

  const data = await response.json();
  return data.profile || null;
}

export async function saveBrandProfile(input: {
  userId: string;
  projectId: string;
  name?: string;
  tagline?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontPrimary?: string;
  fontSecondary?: string;
  toneKeywords?: string[];
  toneProfile?: ToneProfile;
  targetAudience?: string;
}): Promise<BrandProfile> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(input.projectId)}/brand-profile`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to save brand profile');
  }

  const data = await response.json();
  return data.profile;
}

export async function uploadBrandLogo(input: {
  userId: string;
  projectId: string;
  filename: string;
  base64: string;
  mimeType: string;
}): Promise<{ logoPath: string }> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(input.projectId)}/brand-logo`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Failed to upload logo');
  }

  return response.json();
}
