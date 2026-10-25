import { callAppsScriptApi, fetchPublicArchive } from '../../server/archive-api.mjs';

export default async function handler(request) {
  try {
    if (request.method === 'GET') {
      const archive = await fetchPublicArchive();
      return Response.json(archive, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } });
    }
    if (request.method !== 'POST') {
      return Response.json({ error: 'Metode tidak didukung.' }, { status: 405, headers: { Allow: 'GET, POST' } });
    }
    let payload;
    try { payload = await request.json(); } catch (_) { return Response.json({ error: 'Badan permintaan harus berupa JSON.' }, { status: 400 }); }
    if (!payload || typeof payload.method !== 'string' || !Array.isArray(payload.args)) {
      return Response.json({ error: 'Permintaan API tidak lengkap.' }, { status: 400 });
    }
    const allowed = new Set([
      'apiGetPublicArchive', 'apiAdminLogin', 'apiAdminGetArchive', 'apiAdminSaveNote',
      'apiAdminDeleteNote', 'apiAdminSaveTrack', 'apiAdminDeleteTrack', 'apiAdminLogout'
    ]);
    if (!allowed.has(payload.method)) return Response.json({ error: 'Operasi API tidak dikenal.' }, { status: 400 });
    const data = await callAppsScriptApi({ method: payload.method, args: payload.args });
    return Response.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 502;
    return Response.json({ error: error.message || 'Koneksi ke arsip gagal.' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
