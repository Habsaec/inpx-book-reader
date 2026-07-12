/** Returns true when server URL uses plain HTTP to a non-local host. */
export function isInsecureRemoteHttp(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return host !== 'localhost' && host !== '127.0.0.1' && !host.startsWith('192.168.');
  } catch {
    return false;
  }
}

export function insecureHttpWarning(url: string): string | null {
  if (!isInsecureRemoteHttp(url)) return null;
  return 'Подключение по HTTP без шифрования. Логин и пароль могут быть перехвачены в публичной сети. Рекомендуется HTTPS.';
}
