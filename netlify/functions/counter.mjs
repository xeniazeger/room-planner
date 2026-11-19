// Visit counter backed by Netlify Blobs.
//   POST /api/hit    count a page view; body { newVisitor: boolean } → totals
//   GET  /api/stats  totals plus the last 30 days

import { getStore } from '@netlify/blobs';

const STATS_DAYS = 30;

const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const bump = (c, newVisitor) => ({
    views: (c?.views || 0) + 1,
    visitors: (c?.visitors || 0) + (newVisitor ? 1 : 0),
});

const empty = (c) => ({ views: c?.views || 0, visitors: c?.visitors || 0 });

export async function handle(req, store, now = new Date()) {
    if (req.method === 'POST') {
        let body = {};
        try { body = await req.json(); } catch {}
        const newVisitor = body?.newVisitor === true;
        const dayKey = `day/${now.toISOString().slice(0, 10)}`;
        const [total, day] = await Promise.all([store.get('total', { type: 'json' }), store.get(dayKey, { type: 'json' })]);
        const nextTotal = bump(total, newVisitor);
        await Promise.all([store.setJSON('total', nextTotal), store.setJSON(dayKey, bump(day, newVisitor))]);
        return json(200, nextTotal);
    }

    if (req.method === 'GET') {
        const { blobs } = await store.list({ prefix: 'day/' });
        const keys = blobs.map((b) => b.key).sort().slice(-STATS_DAYS).reverse();
        const days = await Promise.all(keys.map(async (key) => ({ date: key.slice(4), ...empty(await store.get(key, { type: 'json' })) })));
        return json(200, { total: empty(await store.get('total', { type: 'json' })), days });
    }

    return json(405, { error: 'method_not_allowed' });
}

export default (req) => handle(req, getStore({ name: 'counter', consistency: 'strong' }));

export const config = {
    path: ['/api/hit', '/api/stats'],
    rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
