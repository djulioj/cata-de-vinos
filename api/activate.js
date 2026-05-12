const { fsSet, fsList } = require('./_firebase');
const { sendWhatsApp } = require('./_twilio');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { wine } = req.body || {};
  if (wine === undefined || wine === null) {
    return res.status(400).json({ error: 'Falta el número de vino' });
  }

  const wineNum = parseInt(wine);

  // Actualizar estado de sesión en Firestore
  await fsSet('session/state', { currentWine: wineNum });

  // ── Reset (wine = 0): no enviar mensajes, solo resetear estados ──────────
  if (wineNum === 0) {
    const guests = await fsList('guests');
    for (const g of guests) {
      if (g.state && g.state !== 'new') {
        const key = (g.phone || '').replace(/\D/g, '');
        if (key) await fsSet(`guests/${key}`, { state: 'registered' });
      }
    }
    return res.json({ ok: true, sent: 0, message: 'Cata reiniciada' });
  }

  // ── Activar vino: enviar WA a todos los registrados ──────────────────────
  const guests = await fsList('guests');
  const eligible = guests.filter(
    (g) => g.name && g.phone && ['registered', 'submitted', 'describing'].includes(g.state)
  );

  let sent = 0;
  for (const g of eligible) {
    try {
      await sendWhatsApp(
        g.phone,
        `🍷 *Vino ${wineNum}*\n\n¡Llegó el momento, ${g.name}! Pruébalo y descríbemelo con tus propias palabras. No hay respuesta incorrecta 😊`
      );
      const key = g.phone.replace(/\D/g, '');
      await fsSet(`guests/${key}`, { state: 'describing', currentWine: wineNum });
      sent++;
    } catch (e) {
      console.error(`Error enviando a ${g.phone}:`, e);
    }
  }

  res.json({ ok: true, sent, total: eligible.length });
};
