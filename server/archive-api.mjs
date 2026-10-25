const timeoutSignal = () => {
  try { return AbortSignal.timeout(12000); } catch (_) { return undefined; }
};

function configuredScriptUrl() {
  const raw = process.env.AFTERAIN_APPS_SCRIPT_URL;
  if (!raw) throw new Error('Environment variable AFTERAIN_APPS_SCRIPT_URL belum diatur di Netlify.');
  let url;
  try { url = new URL(raw); } catch (_) { throw new Error('AFTERAIN_APPS_SCRIPT_URL bukan URL yang valid.'); }
  if (url.protocol !== 'https:') throw new Error('AFTERAIN_APPS_SCRIPT_URL harus menggunakan HTTPS.');
  return url;
}

async function readJsonResponse(response, label) {
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch (_) { throw new Error(`${label} tidak mengembalikan JSON. Pastikan deployment Apps Script memakai URL /exec dan akses web app sudah diatur.`); }
  if (!response.ok) throw new Error(`${label} gagal (HTTP ${response.status}).`);
  return payload;
}

export async function fetchPublicArchive() {
  const url = configuredScriptUrl();
  url.searchParams.set('action', 'archive');
  const signal = timeoutSignal();
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'follow',
    ...(signal ? { signal } : {})
  });
  const payload = await readJsonResponse(response, 'Google Apps Script');
  if (payload.ok === false || payload.error) throw new Error(payload.error || 'Gagal membaca arsip Google Drive.');
  const archive = payload.data || payload;
  return {
    notes: Array.isArray(archive.notes) ? archive.notes : [],
    tracks: Array.isArray(archive.tracks) ? archive.tracks : []
  };
}

export async function callAppsScriptApi(requestBody) {
  const url = configuredScriptUrl();
  const signal = timeoutSignal();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(requestBody),
    redirect: 'follow',
    ...(signal ? { signal } : {})
  });
  const payload = await readJsonResponse(response, 'Google Apps Script');
  if (payload.ok === false || payload.error) {
    const error = new Error(payload.error || 'Operasi arsip gagal.');
    error.statusCode = /password admin salah/i.test(error.message) ? 401 : /sesi admin|kedaluwarsa/i.test(error.message) ? 401 : 400;
    throw error;
  }
  return payload.data;
}

export function xmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function publicSiteOrigin(request) {
  return new URL(request.url).origin;
}

export function noteUrl(origin, note) {
  const url = new URL('/', origin);
  url.searchParams.set('entry', String(note.id || ''));
  return url.href;
}

export function noteTimestamp(note) {
  const raw = Number(note.updatedAt || note.createdAt || note.created || 0);
  return raw > 0 ? new Date(raw) : new Date(0);
}
