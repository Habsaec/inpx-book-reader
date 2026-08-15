/** RFC1918, loopback, link-local, mDNS, Tailscale/CGNAT — не считаем «удалённым HTTP». */
export function isPrivateOrLocalHost(hostname: string): boolean {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (
    host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host === '0.0.0.0'
    || host === '::'
  ) {
    return true;
  }
  if (host.endsWith('.local') || host.endsWith('.localhost')) return true;
  if (host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('169.254.')) {
    return true;
  }
  const m172 = host.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  // 100.64.0.0/10 — CGNAT / Tailscale: трафик уже в туннеле, HTTP-предупреждение ложное.
  const m100 = host.match(/^100\.(\d+)\./);
  if (m100) {
    const second = Number(m100[1]);
    if (second >= 64 && second <= 127) return true;
  }
  if (host.includes(':')) {
    if (host === '::1' || host.startsWith('fe80:')) return true;
    // Unique local fc00::/7
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
  }
  return false;
}

/** Returns true when server URL uses plain HTTP to a non-local host. */
export function isInsecureRemoteHttp(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:') return false;
    return !isPrivateOrLocalHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function insecureHttpWarning(url: string): string | null {
  if (!isInsecureRemoteHttp(url)) return null;
  return 'Подключение по HTTP без шифрования. Логин и пароль могут быть перехвачены в публичной сети. Рекомендуется HTTPS.';
}
