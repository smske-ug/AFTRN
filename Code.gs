/**
 * afterain // lifelog — Google Apps Script backend
 * Archive metadata is kept in afterain-archive.json inside a private Drive folder.
 * Configure Script Property AFTERAIN_ADMIN_PASSWORD before deploying.
 */

const AFTERAIN_FOLDER_NAME = 'afterain lifelog archive';
const AFTERAIN_ARCHIVE_FILE = 'afterain-archive.json';
const AFTERAIN_ADMIN_SESSION_SECONDS = 1800;

function doGet(e) {
  // The Netlify Functions proxy reads this public JSON endpoint. Keep archive
  // reads read-only here; all write operations go through the authenticated POST dispatcher.
  if (e && e.parameter && e.parameter.action === 'archive') {
    return jsonOutput_({ ok: true, data: apiGetPublicArchive() });
  }
  return jsonOutput_({
    ok: true,
    service: 'afterain-drive-archive',
    message: 'Backend aktif. Endpoint arsip publik tersedia melalui ?action=archive.'
  });
}

/** JSON API bridge used by the same-origin Netlify Function. */
function doPost(e) {
  try {
    var request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var method = String(request.method || '');
    var args = Array.isArray(request.args) ? request.args : [];
    var handlers = {
      apiGetPublicArchive: apiGetPublicArchive,
      apiAdminLogin: apiAdminLogin,
      apiAdminGetArchive: apiAdminGetArchive,
      apiAdminSaveNote: apiAdminSaveNote,
      apiAdminDeleteNote: apiAdminDeleteNote,
      apiAdminSaveTrack: apiAdminSaveTrack,
      apiAdminDeleteTrack: apiAdminDeleteTrack,
      apiAdminLogout: apiAdminLogout
    };
    if (!Object.prototype.hasOwnProperty.call(handlers, method)) {
      throw new Error('Operasi API tidak dikenal.');
    }
    return jsonOutput_({ ok: true, data: handlers[method].apply(null, args) });
  } catch (error) {
    return jsonOutput_({ ok: false, error: error && error.message ? error.message : String(error) });
  }
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Public read-only endpoint used by the lifelog and audio player. */
function apiGetPublicArchive() {
  return publicArchive_(readArchive_());
}

/** Checks the Script Property password and returns a short-lived random token. */
function apiAdminLogin(password) {
  const configured = PropertiesService.getScriptProperties().getProperty('AFTERAIN_ADMIN_PASSWORD');
  if (!configured) {
    throw new Error('AFTERAIN_ADMIN_PASSWORD belum diisi di Project Settings > Script Properties.');
  }
  if (typeof password !== 'string' || !constantTimeEquals_(password, configured)) {
    throw new Error('Password admin salah.');
  }

  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('afterain-admin:' + token, 'valid', AFTERAIN_ADMIN_SESSION_SECONDS);
  return { token: token, expiresIn: AFTERAIN_ADMIN_SESSION_SECONDS };
}

/** Archive read endpoint for an authenticated admin. */
function apiAdminGetArchive(token) {
  requireAdmin_(token);
  return publicArchive_(readArchive_());
}

/** Add or edit a lifelog note in the Drive archive. */
function apiAdminSaveNote(token, input) {
  requireAdmin_(token);
  input = input || {};
  const title = cleanText_(input.title, 100);
  const body = cleanBody_(input.body).trim();
  if (!body) throw new Error('Isi catatan tidak boleh kosong.');
  const id = cleanText_(input.id, 100).trim();

  const archive = mutateArchive_(function (data) {
    const now = Date.now();
    if (id) {
      const item = data.notes.find(function (note) { return note.id === id; });
      if (!item) throw new Error('Catatan arsip tidak ditemukan. Muat ulang daftar.');
      item.title = title;
      item.body = body;
      item.tags = cleanTags_(input.tags);
      item.updatedAt = now;
    } else {
      data.notes.push({
        id: Utilities.getUuid(),
        title: title,
        body: body,
        tags: cleanTags_(input.tags),
        created: now,
        createdAt: now,
        updatedAt: now
      });
    }
  });
  return publicArchive_(archive);
}

/** Remove a lifelog note from the Drive archive. */
function apiAdminDeleteNote(token, id) {
  requireAdmin_(token);
  id = cleanText_(id, 100).trim();
  if (!id) throw new Error('ID catatan tidak valid.');
  const archive = mutateArchive_(function (data) {
    const before = data.notes.length;
    data.notes = data.notes.filter(function (note) { return note.id !== id; });
    if (data.notes.length === before) throw new Error('Catatan arsip tidak ditemukan.');
  });
  return publicArchive_(archive);
}

/** Add or edit an HTTPS direct-audio or browser-compatible stream URL. */
function apiAdminSaveTrack(token, input) {
  requireAdmin_(token);
  input = input || {};
  const title = cleanText_(input.title, 100).trim();
  const url = cleanText_(input.url, 1500).trim();
  const description = cleanText_(input.description, 500).trim();
  const id = cleanText_(input.id, 100).trim();

  if (!title) throw new Error('Judul audio wajib diisi.');
  if (!/^https:\/\/[^\s]+$/i.test(url)) {
    throw new Error('URL audio harus berupa link HTTPS tanpa spasi.');
  }

  const archive = mutateArchive_(function (data) {
    const now = Date.now();
    if (id) {
      const item = data.tracks.find(function (track) { return track.id === id; });
      if (!item) throw new Error('Audio arsip tidak ditemukan. Muat ulang daftar.');
      item.title = title;
      item.url = url;
      item.description = description;
      item.updatedAt = now;
    } else {
      data.tracks.push({
        id: Utilities.getUuid(),
        title: title,
        url: url,
        description: description,
        created: now,
        createdAt: now,
        updatedAt: now
      });
    }
  });
  return publicArchive_(archive);
}

/** Remove an audio link from the public playlist and Drive archive. */
function apiAdminDeleteTrack(token, id) {
  requireAdmin_(token);
  id = cleanText_(id, 100).trim();
  if (!id) throw new Error('ID audio tidak valid.');
  const archive = mutateArchive_(function (data) {
    const before = data.tracks.length;
    data.tracks = data.tracks.filter(function (track) { return track.id !== id; });
    if (data.tracks.length === before) throw new Error('Audio arsip tidak ditemukan.');
  });
  return publicArchive_(archive);
}

/** Invalidate a live admin token. */
function apiAdminLogout(token) {
  requireAdmin_(token);
  CacheService.getScriptCache().remove('afterain-admin:' + token);
  return { ok: true };
}

function requireAdmin_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{50,80}$/i.test(token)) {
    throw new Error('Sesi admin tidak valid. Silakan masuk kembali.');
  }
  const saved = CacheService.getScriptCache().get('afterain-admin:' + token);
  if (saved !== 'valid') throw new Error('Sesi admin kedaluwarsa. Silakan masuk kembali.');
}

function constantTimeEquals_(left, right) {
  left = String(left);
  right = String(right);
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    diff |= (left.charCodeAt(i % Math.max(1, left.length)) || 0) ^
      (right.charCodeAt(i % Math.max(1, right.length)) || 0);
  }
  return diff === 0;
}

function cleanText_(value, maxLength) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, maxLength);
}

/** Note bodies have no application-imposed character limit; remove control characters only. */
function cleanBody_(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function cleanTags_(value) {
  var source = Array.isArray(value) ? value : String(value || '').split(',');
  var tags = [];
  var seen = {};
  source.forEach(function (tag) {
    var cleaned = cleanText_(tag, 32).replace(/\s+/g, ' ').trim();
    if (!cleaned) return;
    var key = cleaned.toLocaleLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    tags.push(cleaned);
  });
  return tags.slice(0, 10);
}

function getDataFolder_() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty('AFTERAIN_DATA_FOLDER_ID');
  if (existingId) {
    try {
      return DriveApp.getFolderById(existingId);
    } catch (error) {
      // Folder was removed or is no longer accessible; recreate it below.
    }
  }

  const folders = DriveApp.getFoldersByName(AFTERAIN_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(AFTERAIN_FOLDER_NAME);
  props.setProperty('AFTERAIN_DATA_FOLDER_ID', folder.getId());
  return folder;
}

function getArchiveFile_() {
  const folder = getDataFolder_();
  const files = folder.getFilesByName(AFTERAIN_ARCHIVE_FILE);
  if (files.hasNext()) return files.next();
  const initial = { version: 1, notes: [], tracks: [] };
  return folder.createFile(AFTERAIN_ARCHIVE_FILE, JSON.stringify(initial, null, 2), MimeType.PLAIN_TEXT);
}

function readArchive_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return readArchiveUnlocked_();
  } finally {
    lock.releaseLock();
  }
}

function readArchiveUnlocked_() {
  const file = getArchiveFile_();
  let parsed;
  try {
    parsed = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  } catch (error) {
    throw new Error('File arsip di Drive tidak dapat dibaca. Periksa afterain-archive.json.');
  }
  if (!parsed || typeof parsed !== 'object') parsed = {};
  if (!Array.isArray(parsed.notes)) parsed.notes = [];
  if (!Array.isArray(parsed.tracks)) parsed.tracks = [];
  parsed.version = 1;
  parsed.notes = parsed.notes.filter(function (item) { return item && item.id && typeof item.body === 'string'; });
  parsed.tracks = parsed.tracks.filter(function (item) { return item && item.id && item.url && item.title; });
  return parsed;
}

function writeArchive_(archive) {
  const file = getArchiveFile_();
  file.setContent(JSON.stringify({ version: 1, notes: archive.notes, tracks: archive.tracks }, null, 2));
}

/** Mutations use a script lock to avoid concurrent edits overwriting one another. */
function mutateArchive_(mutator) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const archive = readArchiveUnlocked_();
    mutator(archive);
    writeArchive_(archive);
    return archive;
  } finally {
    lock.releaseLock();
  }
}

function publicArchive_(archive) {
  return {
    notes: (archive.notes || []).map(function (note) {
      return {
        id: cleanText_(note.id, 100),
        title: cleanText_(note.title, 100),
        body: cleanBody_(note.body),
        tags: cleanTags_(note.tags),
        created: Number(note.created || note.createdAt || 0),
        createdAt: Number(note.createdAt || note.created || 0),
        updatedAt: Number(note.updatedAt || note.created || note.createdAt || 0)
      };
    }),
    tracks: (archive.tracks || []).map(function (track) {
      return {
        id: cleanText_(track.id, 100),
        title: cleanText_(track.title, 100),
        url: cleanText_(track.url, 1500),
        description: cleanText_(track.description, 500),
        created: Number(track.created || track.createdAt || 0),
        createdAt: Number(track.createdAt || track.created || 0),
        updatedAt: Number(track.updatedAt || track.created || track.createdAt || 0)
      };
    })
  };
}
