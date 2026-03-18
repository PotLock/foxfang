'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Settings, Twitter, CheckCircle, XCircle, Loader2, ExternalLink, Unplug } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { API_BASE_URL } from '@/lib/api/client';

interface TwitterStatus {
  connected: boolean;
  username?: string;
  displayName?: string;
  connectedAt?: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [twitterStatus, setTwitterStatus] = useState<TwitterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [flashMessage, setFlashMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check URL params for OAuth redirect result
  useEffect(() => {
    const twitterConnected = searchParams.get('twitter_connected');
    const twitterError = searchParams.get('twitter_error');
    const twitterUsername = searchParams.get('twitter_username');

    if (twitterConnected === 'true') {
      setFlashMessage({ type: 'success', text: `Twitter account @${twitterUsername} connected successfully!` });
    } else if (twitterError) {
      const errorMessages: Record<string, string> = {
        access_denied: 'You denied the Twitter connection request.',
        token_exchange_failed: 'Failed to exchange authorization code. Please try again.',
        user_fetch_failed: 'Failed to fetch your Twitter profile. Please try again.',
        unknown: 'An unexpected error occurred. Please try again.',
      };
      setFlashMessage({ type: 'error', text: errorMessages[twitterError] || `Twitter error: ${twitterError}` });
    }
  }, [searchParams]);

  // Fetch Twitter connection status
  useEffect(() => {
    if (!user) return;

    const fetchStatus = async () => {
      try {
        const resp = await fetch(`${API_BASE_URL}/auth/twitter/status`, {
          headers: { 'x-user-id': user.id },
        });
        if (resp.ok) {
          const data = await resp.json();
          setTwitterStatus(data);
        }
      } catch (err) {
        console.error('Failed to fetch Twitter status:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [user]);

  const handleConnectTwitter = () => {
    if (!user) return;
    window.location.href = `${API_BASE_URL}/auth/twitter?userId=${encodeURIComponent(user.id)}`;
  };

  const handleDisconnectTwitter = async () => {
    if (!user) return;
    setDisconnecting(true);

    try {
      const resp = await fetch(`${API_BASE_URL}/auth/twitter`, {
        method: 'DELETE',
        headers: { 'x-user-id': user.id },
      });
      if (resp.ok) {
        setTwitterStatus({ connected: false });
        setFlashMessage({ type: 'success', text: 'Twitter account disconnected.' });
      }
    } catch (err) {
      console.error('Failed to disconnect Twitter:', err);
      setFlashMessage({ type: 'error', text: 'Failed to disconnect Twitter. Please try again.' });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <Settings className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Manage your integrations and preferences</p>
        </div>
      </div>

      {/* Flash message */}
      {flashMessage && (
        <div
          className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
            flashMessage.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {flashMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="text-sm">{flashMessage.text}</span>
          <button
            onClick={() => setFlashMessage(null)}
            className="ml-auto text-gray-400 hover:text-gray-600"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Integrations section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Integrations</h2>

        {/* Twitter / X */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center">
                <Twitter className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Twitter / X</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Connect your Twitter account to let agents post tweets on your behalf.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : twitterStatus?.connected ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Connected
                </span>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                Not connected
              </span>
            )}
          </div>

          {/* Connected state */}
          {!loading && twitterStatus?.connected && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-600">
                      {twitterStatus.displayName?.[0]?.toUpperCase() || '@'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{twitterStatus.displayName}</p>
                    <a
                      href={`https://x.com/${twitterStatus.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      @{twitterStatus.username}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
                <button
                  onClick={handleDisconnectTwitter}
                  disabled={disconnecting}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {disconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unplug className="w-4 h-4" />
                  )}
                  Disconnect
                </button>
              </div>
            </div>
          )}

          {/* Disconnected state */}
          {!loading && !twitterStatus?.connected && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={handleConnectTwitter}
                className="flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
              >
                <Twitter className="w-4 h-4" />
                Connect Twitter
              </button>
              <p className="text-xs text-gray-400 mt-2">
                You&apos;ll be redirected to Twitter to authorize FoxFang.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
