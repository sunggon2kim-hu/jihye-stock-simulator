// Cloudflare Pages Function: /api
// Alpha Vantage 중계. API 키는 Cloudflare 비밀값 AV_KEY에만 있고 브라우저로 보내지 않음.
// 설정: npx wrangler pages secret put AV_KEY --project-name jihye

const AV = 'https://www.alphavantage.co/query';
const TTL = 3600; // 1시간 서버 캐시 (모든 기기가 공유 → 호출 횟수 절약)
const ALLOWED = new Set([
  'GLOBAL_QUOTE', 'TIME_SERIES_DAILY', 'TIME_SERIES_MONTHLY_ADJUSTED',
  'TIME_SERIES_MONTHLY', 'OVERVIEW', 'NEWS_SENTIMENT', 'SYMBOL_SEARCH',
]);

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const fn = url.searchParams.get('function');

  if (fn === 'STATUS') return json({ proxy: true, hasKey: !!env.AV_KEY });
  if (!env.AV_KEY) return json({ proxyError: 'NOKEY' }, 503);
  if (!ALLOWED.has(fn)) return json({ 'Error Message': 'function not allowed' }, 400);

  const params = new URLSearchParams(url.searchParams);
  params.delete('apikey');
  params.delete('force');
  params.sort();

  // 캐시 키에는 API 키를 넣지 않음
  const cacheKey = new Request(`${url.origin}/__av_cache?${params}`);
  const cache = caches.default;
  if (url.searchParams.get('force') !== '1') {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  params.set('apikey', env.AV_KEY);
  const r = await fetch(`${AV}?${params}`);
  if (!r.ok) return json({ proxyError: 'HTTP ' + r.status }, 502);
  const d = await r.json();

  const res = json(d, 200, { 'cache-control': `public, max-age=${TTL}` });
  // 한도 초과·오류 응답은 캐시하지 않음
  const isLimit = d.Note || (d.Information && Object.keys(d).length === 1);
  if (!isLimit && !d['Error Message']) waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
