import { fetchPublicArchive, noteUrl, noteTimestamp, publicSiteOrigin, xmlEscape } from '../../server/archive-api.mjs';

export default async function handler(request) {
  try {
    const origin = publicSiteOrigin(request);
    const archive = await fetchPublicArchive();
    const staticPages = [
      { url: `${origin}/`, priority: '1.0' },
      { url: `${origin}/archive.html`, priority: '0.8' },
      { url: `${origin}/about.html`, priority: '0.5' }
    ];
    const staticXml = staticPages.map(page => `<url><loc>${xmlEscape(page.url)}</loc><changefreq>weekly</changefreq><priority>${page.priority}</priority></url>`).join('');
    const noteXml = archive.notes.map(note => {
      const lastmod = noteTimestamp(note);
      const link = noteUrl(origin, note);
      return `<url><loc>${xmlEscape(link)}</loc>${lastmod.getTime() > 0 ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''}<changefreq>monthly</changefreq><priority>0.6</priority></url>`;
    }).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticXml}${noteXml}</urlset>`;
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  } catch (error) {
    return new Response(`Sitemap belum tersedia: ${error.message || 'arsip tidak dapat dibaca.'}`, { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}
