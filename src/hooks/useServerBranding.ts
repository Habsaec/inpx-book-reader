import React from 'react';
import { ServerConfig } from '../types';
import { fetchServerBranding, fetchServerLogoBlob } from '../lib/inpxClient';

const APP_FALLBACK_NAME = 'INPX Reader';

export function useServerBranding(serverConfig: ServerConfig) {
  const [siteName, setSiteName] = React.useState(APP_FALLBACK_NAME);
  const [logoSrc, setLogoSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (serverConfig.connectionStatus !== 'connected' || !serverConfig.url) {
      setSiteName(APP_FALLBACK_NAME);
      setLogoSrc(null);
      document.title = APP_FALLBACK_NAME;
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const branding = await fetchServerBranding(serverConfig);
        if (cancelled) return;

        setSiteName(branding.siteName);
        document.title = branding.siteName;

        const blob = await fetchServerLogoBlob(serverConfig, branding.logoPath);
        if (cancelled || !blob) return;

        objectUrl = URL.createObjectURL(blob);
        setLogoSrc(objectUrl);
      } catch {
        if (!cancelled) {
          setSiteName(APP_FALLBACK_NAME);
          setLogoSrc(null);
          document.title = APP_FALLBACK_NAME;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [serverConfig.url, serverConfig.connectionStatus, serverConfig.username, serverConfig.password]);

  return { siteName, logoSrc };
}
