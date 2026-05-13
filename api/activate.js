const { fsGet, fsSet, fsList } = require('./_firebase');
const { sendWhatsApp } = require('./_twilio');

// Procesa un array en lotes de `size` en paralelo, lote a lote
async function batchMap(arr, size, fn) {
  const results = [];
  for (let i = 0; i < arr.length; i += size) {
    const batch = arr.slice(i, i + size);
    const res = await Promise.allSettled(batch.map(fn));
    results.push(...res);
  }
  return results;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { wine, action } = req.body || {};

  const guests = await fsList('guests');

  // ── Finalizar cata: recomendaciones personalizadas con Groq ──────────────
  if (action === 'finalize') {
    const eligible = guests.filter((g) => g.name && g.phone && g.state !== 'new');

    // Traer todas las respuestas y agrupar por teléfono
    const allResponses = await fsList('responses');
    const byPhone = {};
    for (const r of allResponses) {
      const key = (r.phone || '').replace(/\D/g, '');
      if (!byPhone[key]) byPhone[key] = [];
      byPhone[key].push(r);
    }

    // Generar mensaje personalizado para cada asistente (lotes de 6 → sin rate limit en Groq)
    const results = await batchMap(eligible, 6, async (g) => {
        const key = (g.phone || '').replace(/\D/g, '');
        const resps = byPhone[key] || [];

        let finalMsg;

        if (resps.length === 0) {
          // Sin descripciones: mensaje simple de cierre
          finalMsg =
            `🍷 *¡Gracias por estar aquí, ${g.name}!*\n\n` +
            `Esta noche viviste en vivo cómo la automatización con IA puede crear experiencias únicas en segundos.\n\n` +
            `_Con cariño, el equipo de QFD Solutions. ¡Salud! 🥂_`;
        } else {
          // Con descripciones: llamar a Groq para perfil + recomendaciones
          const vinos = resps
            .sort((a, b) => (a.wine || 0) - (b.wine || 0))
            .map((r) => `Vino ${r.wine}: "${r.description}"`)
            .join('\n');

          const prompt =
            `Eres un sommelier experto. ${g.name} catió ${resps.length} vino(s) esta noche y los describió así:\n\n` +
            `${vinos}\n\n` +
            `Con base en estas descripciones, escríbele a ${g.name} un mensaje personal y elegante que:\n` +
            `- Identifique su "perfil de paladar" de forma halagadora (1 oración)\n` +
            `- Le recomiende 2-3 estilos de vino que le encantarían, con una frase descriptiva de cada uno\n` +
            `- Cierre con una frase cálida y memorable sobre la experiencia de esta noche\n\n` +
            `Usa tuteo, tono sofisticado pero cercano. Máximo 5 oraciones en total. ` +
            `Solo el texto, sin títulos ni encabezados. En español colombiano.`;

          try {
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
              },
              body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                max_tokens: 400,
                messages: [{ role: 'user', content: prompt }],
              }),
            });
            const groqData = await groqRes.json();
            const recomendacion = groqData.choices?.[0]?.message?.content;

            if (recomendacion) {
              finalMsg =
                `🍷 *Tu perfil de catador, ${g.name}*\n\n` +
                `${recomendacion}\n\n` +
                `_Generado con IA en tiempo real · QFD Solutions ✨_`;
            } else {
              // Groq falló: fallback simple
              finalMsg =
                `🍷 *¡Gracias, ${g.name}!*\n\n` +
                `Cataste ${resps.length} vino(s) esta noche y tu sommelier de IA generó fichas personalizadas para cada uno.\n\n` +
                `_¡Fue un placer! Salud 🥂_`;
            }
          } catch (e) {
            console.error(`Groq error para ${g.name}:`, e.message);
            finalMsg =
              `🍷 *¡Gracias, ${g.name}!*\n\nFue una noche increíble. ¡Salud! 🥂`;
          }
        }

        await sendWhatsApp(g.phone, finalMsg);
    });

    await fsSet('session/state', { currentWine: 0 });
    const sent = results.filter((r) => r.status === 'fulfilled').length;
    return res.json({ ok: true, sent });
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
      // Si estaba describiendo otro vino y no respondió, lo reconocemos
      const msg = g.state === 'describing'
        ? `🍷 *Vino ${wineNum}*\n\nEl anfitrión ya pasó al siguiente, ${g.name}! No te preocupes por el anterior — cuéntame qué percibes en este. Sin presión 😊`
        : `🍷 *Vino ${wineNum}*\n\n¡Llegó el momento, ${g.name}! Pruébalo y descríbemelo con tus propias palabras. No hay respuesta incorrecta 😊`;

      await sendWhatsApp(g.phone, msg);
      const key = g.phone.replace(/\D/g, '');
      await fsSet(`guests/${key}`, { state: 'describing', currentWine: wineNum });
    })
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  res.json({ ok: true, sent, total: eligible.length });
};
