import { db, doc, onSnapshot, collection } from './firebase.js';
import { goTo, showToast, renderHostResponses, renderReveal } from './ui.js';

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentHostTab = 'ctrl';
let localWine = 0;
let allResponses = [];

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const isHost = new URLSearchParams(window.location.search).has('host');

  if (isHost) {
    goTo('screen-host');
    startHostListeners();
    loadHostQR();
  } else {
    goTo('screen-join');
    loadJoinScreen();
  }
});

// ─── PANTALLA DE UNIÓN ────────────────────────────────────────────────────────
async function loadJoinScreen() {
  try {
    const { waNumber, joinWord } = await fetch('/api/config').then((r) => r.json());

    if (!waNumber) return;

    const chatMsg = 'Hola, quiero participar en la cata 🍷';
    const chatLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(chatMsg)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(chatLink)}`;

    // Mostrar QR y botón
    const qrImg = document.getElementById('wa-qr');
    const waBtn = document.getElementById('wa-link');
    qrImg.src = qrUrl;
    qrImg.style.display = 'block';
    waBtn.href = chatLink;
    waBtn.style.display = 'flex';
    document.getElementById('join-loading').style.display = 'none';

    // Paso 1 (sandbox join) — solo si está configurado
    if (joinWord) {
      const joinLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(joinWord)}`;
      document.getElementById('join-step1').style.display = 'block';
      document.getElementById('join-step-label').textContent = 'Paso 2 · Únete a la cata';
      document.getElementById('join-qr1').src =
        `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(joinLink)}`;
      document.getElementById('join-word').textContent = joinWord;
      document.getElementById('join-link1').href = joinLink;
    }
  } catch (e) {
    console.error('Error cargando join screen:', e);
    document.getElementById('join-loading').textContent = 'Error cargando el QR. Recarga la página.';
  }
}

// ─── HOST: QR EN EL PANEL ─────────────────────────────────────────────────────
async function loadHostQR() {
  try {
    const { waNumber, joinWord } = await fetch('/api/config').then((r) => r.json());
    if (!waNumber) return;

    const msg = joinWord || 'Hola, quiero participar en la cata 🍷';
    const link = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}`;

    document.getElementById('host-wa-qr').src = qrUrl;
    document.getElementById('host-wa-link').textContent = link;
    document.getElementById('host-wa-link').href = link;
  } catch (e) {
    console.error('Error cargando QR del anfitrión:', e);
  }
}

// ─── HOST: TABS ───────────────────────────────────────────────────────────────
window.switchTab = function (tab) {
  currentHostTab = tab;
  ['ctrl', 'resp', 'reveal'].forEach((t) => {
    document.getElementById(`tab-${t}`).className = 'tab' + (t === tab ? ' active' : '');
    document.getElementById(`panel-${t}`).style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'resp') renderResponses();
  if (tab === 'reveal') renderRevealTab();
};

// ─── HOST: CONTROL DE VINOS ───────────────────────────────────────────────────
window.nextWine = async function () {
  const wine = localWine + 1;
  const btn = document.getElementById('btn-next');
  btn.disabled = true;
  btn.textContent = 'Enviando mensajes...';

  try {
    const r = await fetch('/api/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wine }),
    });
    const d = await r.json();
    const n = d.sent || 0;
    showToast(`Vino ${wine} activado · ${n} mensaje${n !== 1 ? 's' : ''} enviado${n !== 1 ? 's' : ''}`);
  } catch (e) {
    showToast('Error al activar el vino');
    console.error(e);
  } finally {
    btn.disabled = false;
  }
};

window.prevWine = async function () {
  if (localWine <= 1) return;
  const wine = localWine - 1;
  const btn = document.getElementById('btn-prev');
  btn.disabled = true;
  try {
    const r = await fetch('/api/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wine }),
    });
    const d = await r.json();
    showToast(`Vino ${wine} · ${d.sent} mensajes enviados`);
  } catch (e) {
    showToast('Error');
  } finally {
    btn.disabled = false;
  }
};

window.resetCata = async function () {
  try {
    await fetch('/api/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wine: 0 }),
    });
    showToast('Cata reiniciada ✓');
  } catch (e) {
    showToast('Error al reiniciar');
  }
};

// ─── HOST: LISTENERS FIRESTORE ────────────────────────────────────────────────
function startHostListeners() {
  // Estado de sesión (vino activo)
  onSnapshot(doc(db, 'session', 'state'), (snap) => {
    const wine = snap.exists() ? snap.data().currentWine || 0 : 0;
    localWine = wine;

    document.getElementById('m-wine').textContent = wine || '—';
    document.getElementById('btn-prev').disabled = wine <= 1;
    document.getElementById('btn-next').textContent =
      wine === 0 ? 'Activar vino 1' : `Pasar al vino ${wine + 1}`;

    const bar = document.getElementById('host-status-bar');
    bar.innerHTML =
      wine > 0
        ? `<span class="dot dot-active"></span><span>Vino ${wine} activo — mensajes enviados a asistentes</span>`
        : `<span class="dot dot-waiting"></span><span>Ningún vino activo aún</span>`;
  });

  // Asistentes conectados (excluye los que no han dado nombre todavía)
  onSnapshot(collection(db, 'guests'), (snap) => {
    const connected = snap.docs.filter((d) => d.data().state !== 'new').length;
    document.getElementById('m-guests').textContent = connected;
    document.getElementById('r-guests').textContent = connected;
  });

  // Respuestas en tiempo real
  onSnapshot(collection(db, 'responses'), (snap) => {
    allResponses = [];
    snap.forEach((d) => allResponses.push(d.data()));
    document.getElementById('m-resp').textContent = allResponses.length;

    if (currentHostTab === 'resp') renderResponses();
    if (currentHostTab === 'reveal') renderRevealTab();
  });
}

function renderResponses() {
  renderHostResponses(allResponses, document.getElementById('host-responses-list'));
}

function renderRevealTab() {
  renderReveal(allResponses, localWine, document.getElementById('reveal-list'), {
    fichas: document.getElementById('r-fichas'),
    wines: document.getElementById('r-wines'),
  });
}
