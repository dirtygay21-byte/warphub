import { describe, expect, test } from 'bun:test';

process.env.POSTGRES_URI ??= 'postgres://postgres:postgres@127.0.0.1:5432/wh_e2e';
process.env.TELEGRAM_BOT_TOKEN ??= '123456:TEST_TOKEN_FOR_LOCAL_RUN';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.BOT_INTERNAL_SECRET ??= 'test-internal-secret';
process.env.S3_ACCESS_KEY ??= 'test';
process.env.S3_SECRET_KEY ??= 'test';
process.env.S3_BUCKET ??= 'test';
process.env.S3_PUBLIC_URL ??= 'http://127.0.0.1/test';

const { normalizePartnerCard, normalizePartnerSettings, PartnerError } = await import('../src/modules/partners/service');
const { fetchPartnerMetadata, parseOpenGraph } = await import('../src/modules/partners/metadata');

describe('partner settings and cards', () => {
  test('normalizes a card and keeps unlimited lanes ordered and independently editable', () => {
    const card = normalizePartnerCard({ lane: 2, title: '  Miniature  ', text: '  Sale & info  ', url: 'https://shop.example/item/42', imageUrl: 'https://shop.example/42.png', sortOrder: 7 });
    expect(card).toMatchObject({ lane: 2, title: 'Miniature', text: 'Sale & info', sortOrder: 7, isActive: true });
    expect(normalizePartnerCard({ lane: 1, title: 'No image', url: 'https://shop.example' })).toMatchObject({ imageUrl: '', sortOrder: 0 });
    expect(normalizePartnerSettings({ partner1Title: ' One ', partner2Title: ' Two ', footerText: ' Sale ' })).toEqual({ partner1Title: 'One', partner2Title: 'Two', footerText: 'Sale' });
  });
  test('rejects invalid lanes, titles, URLs and sort orders', () => {
    for (const input of [
      { lane: 3, title: 'Bad', url: 'https://shop.example' },
      { lane: 1, title: 'Bad', url: 'ftp://shop.example' },
      { lane: 1, title: 'Bad', url: 'https://user:pass@shop.example' },
      { lane: 1, title: 'Bad', url: 'https://shop.example', sortOrder: -1 },
      { lane: 1, title: ' ', url: 'https://shop.example' },
    ]) expect(() => normalizePartnerCard(input as never)).toThrow(PartnerError);
  });
});

describe('Open Graph metadata', () => {
  test('reads OG fields in different attribute order, decodes entities and resolves relative image', () => {
    const result = parseOpenGraph(`
      <html><head>
        <meta content="https://cdn.example/og.png" property="og:image" />
        <meta name="description" content="Miniatures &amp; games" />
        <meta property="og:title" content="Partner &quot;Shop&quot;" />
      </head></html>`, 'https://shop.example/items/42');
    expect(result).toEqual({ title: 'Partner "Shop"', text: 'Miniatures & games', imageUrl: 'https://cdn.example/og.png' });
  });
  test('uses title/description fallbacks and rejects non-http images', () => {
    const fallback = parseOpenGraph('<title>Fallback shop</title><meta name="description" content="Text" />', 'https://shop.example');
    expect(fallback.title).toBe('Fallback shop');
    expect(fallback.text).toBe('Text');
    expect(() => parseOpenGraph('<meta property="og:image" content="data:image/png;base64,abc" />', 'https://shop.example')).toThrow(PartnerError);
  });
  test('blocks local metadata targets before any network request', async () => {
    await expect(fetchPartnerMetadata('http://127.0.0.1:4100')).rejects.toThrow('Local and private metadata URLs are not allowed');
  });
});
