import { writeFileSync } from 'node:fs';

const origin = (process.env.BTMEDYA_ORIGIN || 'https://btmedya.com.tr').replace(/\/$/, '');
const checks = [
  '/', '/api/health', '/robots.txt', '/sitemap.xml', '/news-sitemap.xml',
  '/rss.xml', '/haberler/', '/sosyal-medya/', '/admin/'
];

async function probe(path) {
  const started = performance.now();
  try {
    const res = await fetch(origin + path, { redirect: 'manual', headers: { 'user-agent': 'BTMEDYA-observability/1.0' } });
    const body = await res.arrayBuffer();
    return { path, status: res.status, ms: Math.round(performance.now() - started), bytes: body.byteLength, location: res.headers.get('location') || '' };
  } catch (error) {
    return { path, status: 0, ms: Math.round(performance.now() - started), bytes: 0, error: String(error?.message || error) };
  }
}

const rows = await Promise.all(checks.map(probe));
const html = await (await fetch(origin + '/', { headers: { 'user-agent': 'BTMEDYA-observability/1.0' } })).text();
const csp = (await fetch(origin + '/', { headers: { 'user-agent': 'BTMEDYA-observability/1.0' } })).headers.get('content-security-policy') || '';
const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
const report = [
  `# BTMEDYA canlı Worker gözlem raporu`,
  ``,
  `- Origin: ${origin}`,
  `- UTC: ${new Date().toISOString()}`,
  `- Ana sayfa h1 sayısı: ${h1s.length} (${h1s.join(' | ') || 'bulunamadı'})`,
  `- CSP header: ${csp ? 'mevcut' : 'eksik'}`,
  ``,
  `| Yol | HTTP | ms | byte |`,
  `|---|---:|---:|---:|`,
  ...rows.map((x) => `| ${x.path} | ${x.status || x.error} | ${x.ms} | ${x.bytes} |`),
  ``,
  `## Yorum`,
  `- Bu rapor sentetik HTTP sağlık/SEO kontrollerini içerir; gerçek kullanıcı Core Web Vitals değerleri için Lighthouse çıktısı ve Search Console verisi ayrıca izlenir.`,
  `- Admin alt yollarının 302 dönmesi beklenen oturum korumasıdır.`,
].join('\n');

process.stdout.write(report + '\n');
writeFileSync('btmedya-worker-observability.md', report + '\n');

const failures = rows.filter((x) => x.status >= 500 || x.status === 0);
if (failures.length) process.exitCode = 1;
