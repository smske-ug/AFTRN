import { fetchPublicArchive, noteUrl, noteTimestamp, publicSiteOrigin, xmlEscape } from '../../server/archive-api.mjs';

export default async function handler(request) {
  try {
    const origin = publicSiteOrigin(request);
    const archive = await fetchPublicArchive();
    const notes = archive.notes.slice().sort((a, b) => noteTimestamp(b).getTime() - noteTimestamp(a).getTime());
    const now = new Date().toUTCString();
    const items = notes.map(note => {
      const updated = noteTimestamp(note);
      const link = noteUrl(origin, note);
      const description = xmlEscape(String(note.body || '').slice(0, 4000));
      const tags = (Array.isArray(note.tags) ? note.tags : []).map(tag => `<category>${xmlEscape(tag)}</category>`).join('');
      return `<item><title>${xmlEscape(note.title || 'tanpa judul')}</title><link>${xmlEscape(link)}</link><guid isPermaLink="true">${xmlEscape(link)}</guid><pubDate>${updated.toUTCString()}</pubDate><description>${description}</description>${tags}</item>`;
    }).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>afterain // lifelog</title><link>${xmlEscape(origin + '/')}</link><description>Jurnal kecil tentang hal-hal yang tinggal setelah hujan.</description><language>id-ID</language><lastBuildDate>${now}</lastBuildDate><atom:link href="${xmlEscape(origin + '/rss.xml')}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
    return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  } catch (error) {
    return new Response(`RSS belum tersedia: ${error.message || 'arsip tidak dapat dibaca.'}`, { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}
