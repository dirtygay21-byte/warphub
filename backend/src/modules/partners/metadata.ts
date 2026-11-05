import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { PartnerError, partnerUrl } from './service';

const MAX_HTML_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 5000;

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) return isPrivateIp(normalized.slice(7));
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)
    );
  }
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('ff');
}

function assertPublicHostname(hostname: string): void {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home') || isPrivateIp(host)) {
    throw new PartnerError('INVALID_INPUT', 'Local and private metadata URLs are not allowed');
  }
}

async function assertPublicUrl(value: string): Promise<URL> {
  const raw = partnerUrl(value);
  const url = new URL(raw);
  assertPublicHostname(url.hostname);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) throw new PartnerError('INVALID_INPUT', 'Metadata URL resolves to a private network');
  return url;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'nbsp') return ' ';
    const code = lower.startsWith('#x') ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
  });
}

const cleanText = (value: unknown, max: number) => decodeEntities(String(value ?? '')).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseOpenGraph(html: string, pageUrl: string) {
  const values = new Map<string, string>();
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = match[0];
    const get = (name: string) => tag.match(new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? '';
    const key = (get('property') || get('name')).toLowerCase();
    const content = get('content');
    if (key && content) values.set(key, content);
  }
  const title = cleanText(values.get('og:title') || values.get('twitter:title') || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 180);
  const text = cleanText(values.get('og:description') || values.get('twitter:description') || values.get('description'), 600);
  const rawImage = values.get('og:image:secure_url') || values.get('og:image:url') || values.get('og:image') || values.get('twitter:image') || values.get('twitter:image:src') || '';
  let imageUrl = '';
  if (rawImage) {
    const candidate = new URL(decodeEntities(rawImage), pageUrl).toString();
    imageUrl = partnerUrl(candidate);
  }
  return { title, text, imageUrl };
}

async function readLimitedHtml(response: Response): Promise<string> {
  const type = response.headers.get('content-type') ?? '';
  if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) throw new PartnerError('INVALID_INPUT', 'Metadata URL did not return HTML');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size <= MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  if (size > MAX_HTML_BYTES) {
    await reader.cancel();
    throw new PartnerError('INVALID_INPUT', 'Metadata page is too large');
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

export async function fetchPartnerMetadata(value: string) {
  let url = await assertPublicUrl(value);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'WarpHubPartnerMetadata/1.0' },
      });
    } catch {
      throw new PartnerError('INVALID_INPUT', 'Metadata URL is unavailable');
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new PartnerError('INVALID_INPUT', 'Metadata redirect has no location');
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new PartnerError('INVALID_INPUT', `Metadata URL returned HTTP ${response.status}`);
    const html = await readLimitedHtml(response);
    return { ...parseOpenGraph(html, url.toString()), url: url.toString() };
  }
  throw new PartnerError('INVALID_INPUT', 'Too many metadata redirects');
}
