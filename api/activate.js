const { fsGet, fsSet, fsList } = require('./_firebase');
const { sendWhatsApp } = require('./_twilio');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { wine, action } = req.body || {};

  const guests = await fsList('guests');

  // ── Finalizar cata: mensaje de cierre personalizado ───────────────────────
  if (action === 'finalize') {
    const eligible = guests.filter((g) => g.name && g.phone && g.state !== 'new');

    await Promise.all(
      eligible.map((g) =>
        sendWhatsApp(
          g.phone,
          `🍷 *¡Gracias por participar, ${g.name}!*\n\nEsta noche cataste ${g.currentWine || 'varios'} vinos y tu sommelier de IA generó una ficha personalizada para cada uno.\n\n_Fue un placer tenerte en la cata. ¡Salud! 🥂_`
        ).catch((e) => console.error(`Error finalizando ${g.phone}:`, e))
      )
    );

    await fsSet('session/state', { currentWine: 0 });
    return res.json({ ok: true, sent: eligible.length });
  }

  if (wine === undefined || wine === null) {
    return res.status(400).json({ error: 'Falta el número de vino' });
  }

  const wineNum = parseInt(wine);
  await fsSet('session/state', { currentWine: wineNum });

  // ── Reset (wine = 0) ───────────────────────────────────────────────────────
  if (wineNum === 0) {
    await Promise.all(
      guests
        .filter((g) => g.state && g.state !== 'new')
        .map((g) => {
          const key = (g.phone || '').replace(/\D/g, '');
          return key ? fsSet(`guests/${key}`, { state: 'registered' }) : Promise.resolve();
        })
    );
    return res.json({ ok: true, sent: 0, message: 'Cata reiniciada' });
  }

  // ── Activar vino: enviar WA en paralelo a todos ───────────────────────────
  const eligible = guests.filter(
    (g) => g.name && g.phone && ['registered', 'submitted', 'describing'].includes(g.state)
  );

  const results = await Promise.allSettled(
    eligible.map(async (g) => {
      await sendWhatsApp(
        g.phone,
        `🍷 *Vino ${wineNum}*\n\n¡Llegó el momento, ${g.name}! Pruébalo y descríbemelo con tus propias palabras. No hay respuesta incorrecta 😊`
      );
      const key = g.phone.replace(/\D/g, '');
      await fsSet(`guests/${key}`, { state: 'describing', currentWine: wineNum });
    })
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  res.json({ ok: true, sent, total: eligible.length });
};
