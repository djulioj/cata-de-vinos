export function goTo(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  window.scrollTo(0, 0);
}

export function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

export function renderHostResponses(docs, container) {
  if (!docs.length) {
    container.innerHTML = '<p style="font-size:14px;color:var(--muted);">Las respuestas aparecerán aquí a medida que lleguen.</p>';
    return;
  }
  const sorted = [...docs].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  container.innerHTML = sorted
    .map(
      (r) => `
    <div class="entry">
      <div class="entry-meta">
        <span class="entry-name">${esc(r.name)}</span>
        <span class="badge badge-wine" style="font-size:10px;">Vino ${r.wine}</span>
      </div>
      <div class="entry-desc">"${esc(r.description)}"</div>
      ${
        r.claudeResponse
          ? `<div class="entry-response-mini">${esc(r.claudeResponse)}</div>`
          : '<div style="font-size:12px;color:var(--muted);margin-top:4px;">Generando ficha...</div>'
      }
    </div>
  `
    )
    .join('');
}

export function renderReveal(docs, wineCount, container, metricEls) {
  const withResponse = docs.filter((d) => d.claudeResponse);
  metricEls.fichas.textContent = withResponse.length;
  metricEls.wines.textContent = wineCount || '—';

  if (!docs.length) {
    container.innerHTML = '<p style="font-size:14px;color:var(--muted);">Aún no hay respuestas registradas.</p>';
    return;
  }
  const sorted = [...docs].sort((a, b) => (a.wine || 0) - (b.wine || 0));
  container.innerHTML = sorted
    .map(
      (r) => `
    <div class="entry">
      <div class="entry-meta">
        <span class="entry-name">${esc(r.name)}</span>
        <span class="badge badge-wine" style="font-size:10px;">Vino ${r.wine}</span>
      </div>
      <div class="entry-desc">"${esc(r.description)}"</div>
      ${r.claudeResponse ? `<div class="entry-response-mini">${esc(r.claudeResponse)}</div>` : ''}
    </div>
  `
    )
    .join('');
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
