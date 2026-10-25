import assert from 'node:assert/strict';

process.env.AFTERAIN_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/mock-deployment/exec';
const sample = {
  notes: [{
    id: 'note-123', title: 'Hujan & ingatan', body: 'Satu baris <tentang> hujan.',
    tags: ['memory', 'night'], created: 1793000000000, createdAt: 1793000000000, updatedAt: 1793000000000
  }],
  tracks: []
};
let failLogin = false;
globalThis.fetch = async (_input, init = {}) => {
  if ((init.method || 'GET') === 'POST') {
    const body = JSON.parse(init.body || '{}');
    if (failLogin && body.method === 'apiAdminLogin') {
      return new Response(JSON.stringify({ ok: false, error: 'Password admin salah.' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const data = body.method === 'apiAdminLogin' ? { token: 't'.repeat(64), expiresIn: 1800 } : sample;
    return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true, data: sample }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { default: archiveHandler } = await import('../netlify/functions/archive.mjs');
const { default: rssHandler } = await import('../netlify/functions/rss.mjs');
const { default: sitemapHandler } = await import('../netlify/functions/sitemap.mjs');
const { default: robotsHandler } = await import('../netlify/functions/robots.mjs');
const origin = 'https://site-test.netlify.app';

let response = await archiveHandler(new Request(`${origin}/.netlify/functions/archive`));
assert.equal(response.status, 200, 'archive GET succeeds');
assert.deepEqual((await response.json()).notes[0].tags, ['memory', 'night'], 'archive returns tags');

response = await archiveHandler(new Request(`${origin}/.netlify/functions/archive`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ method: 'apiAdminLogin', args: ['placeholder'] })
}));
assert.equal(response.status, 200, 'API POST proxy succeeds');
assert.equal((await response.json()).data.token.length, 64, 'admin token is returned');

failLogin = true;
response = await archiveHandler(new Request(`${origin}/.netlify/functions/archive`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ method: 'apiAdminLogin', args: ['wrong'] })
}));
assert.equal(response.status, 401, 'failed admin login is returned as unauthorized');
failLogin = false;

response = await rssHandler(new Request(`${origin}/rss.xml`));
const feed = await response.text();
assert.equal(response.status, 200, 'RSS endpoint succeeds');
assert.match(feed, /<rss /);
assert.match(feed, /Hujan &amp; ingatan/);
assert.match(feed, /\?entry=note-123/);
assert.match(feed, /<category>memory<\/category>/);

response = await sitemapHandler(new Request(`${origin}/sitemap.xml`));
const sitemap = await response.text();
assert.equal(response.status, 200, 'sitemap endpoint succeeds');
assert.match(sitemap, /<urlset/);
assert.match(sitemap, /https:\/\/site-test\.netlify\.app\/\?entry=note-123/);
assert.match(sitemap, /archive\.html/);

response = await robotsHandler(new Request(`${origin}/robots.txt`));
assert.match(await response.text(), /https:\/\/site-test\.netlify\.app\/sitemap\.xml/);

console.log('PASS: archive GET, API POST, admin login rejection, RSS XML, sitemap XML, and robots.txt.');
