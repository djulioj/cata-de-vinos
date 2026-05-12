// Helper para Firestore REST API — no requiere npm
const API_KEY = 'AIzaSyBg1vWNwtLXbXHxpSUecCs0yCRdhlG1lhY';
const PROJECT = 'cata-vinos-e3c60';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function toFS(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number')
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  return { stringValue: String(val) };
}

function fromFS(fields = {}) {
  const obj = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) obj[k] = v.stringValue;
    else if ('integerValue' in v) obj[k] = parseInt(v.integerValue);
    else if ('doubleValue' in v) obj[k] = v.doubleValue;
    else if ('booleanValue' in v) obj[k] = v.booleanValue;
    else obj[k] = null;
  }
  return obj;
}

async function fsGet(path) {
  const r = await fetch(`${BASE}/${path}?key=${API_KEY}`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.fields ? fromFS(d.fields) : null;
}

// PATCH con updateMask → merge (crea si no existe, actualiza campos si existe)
async function fsSet(path, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) fields[k] = toFS(v);

  const mask = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');

  const r = await fetch(`${BASE}/${path}?${mask}&key=${API_KEY}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) console.error('fsSet error:', path, await r.text());
  return r.ok;
}

// POST → auto-ID
async function fsAdd(col, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) fields[k] = toFS(v);

  const r = await fetch(`${BASE}/${col}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return r.json(); // incluye .name con el path completo del documento
}

// Lista todos los docs de una colección (hasta 100)
async function fsList(col) {
  const r = await fetch(`${BASE}/${col}?pageSize=100&key=${API_KEY}`);
  if (!r.ok) return [];
  const d = await r.json();
  return (d.documents || []).map((doc) => ({
    _id: decodeURIComponent(doc.name.split('/').pop()),
    ...fromFS(doc.fields),
  }));
}

module.exports = { fsGet, fsSet, fsAdd, fsList };
