const { fsGet, fsSet, fsAdd } = require('./_firebase');
const { sendWhatsApp } = require('./_twilio');

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Respuesta TwiML (Twilio espera XML para mensajes síncronos)
const twiml = (msg) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${msg}</Message></Response>`;

// Extrae solo dígitos del número: "whatsapp:+573014261343" → "573014261343"
const phoneKey = (from) => from.replace(/\D/g, '');

// Parsea body form-urlencoded o JSON (Twilio manda form-encoded)
function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const out = {};
  new URLSearchParams(String(req.body || '')).forEach((v, k) => (out[k] = v));
  return out;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = parseBody(req);
  const from = (body.From || '').trim();        // "whatsapp:+573014261343"
  const msgText = (body.Body || '').trim();
  const key = phoneKey(from);

  if (!from || !key) return res.status(400).end();

  res.setHeader('Content-Type', 'text/xml');

  const guest = await fsGet(`guests/${key}`);

  // ── 1. Primera vez que escribe ────────────────────────────────────────────
  if (!guest) {
    await fsSet(`guests/${key}`, { phone: from, state: 'new', joinedAt: Date.now() });
    return res.end(twiml('¡Hola! Bienvenido a la cata de vinos 🍷\n\n¿Cuál es tu nombre?'));
  }

  // ── 2. Está esperando ingresar su nombre ──────────────────────────────────
  if (guest.state === 'new') {
    const name = msgText;
    if (!name) return res.end(twiml('¿Cuál es tu nombre? Solo escríbemelo 😊'));

    // Verificar si ya hay un vino activo
    const session = await fsGet('session/state');
    const currentWine = session?.currentWine || 0;

    if (currentWine > 0) {
      await fsSet(`guests/${key}`, { name, state: 'describing', currentWine });
      return res.end(
        twiml(
          `¡Perfecto, ${name}! 🎉 Justo a tiempo — el Vino ${currentWine} ya está activo.\n\n¿Cómo lo describes? Cuéntamelo con tus propias palabras, no hay respuesta incorrecta.`
        )
      );
    }

    await fsSet(`guests/${key}`, { name, state: 'registered' });
    return res.end(
      twiml(
        `¡Perfecto, ${name}! Ya estás en la cata 🎉\n\nTe aviso aquí en cuanto el anfitrión active el primer vino. ¡Disfruta!`
      )
    );
  }

  // ── 3. Registrado, esperando que el anfitrión active un vino ──────────────
  if (guest.state === 'registered' || guest.state === 'submitted') {
    return res.end(
      twiml(
        `¡Hola, ${guest.name}! 🍷 El anfitrión activará el siguiente vino pronto. Te aviso aquí cuando sea el momento.`
      )
    );
  }

  // ── 4. Vino activo — esperando su descripción ────────────────────────────
  if (guest.state === 'describing') {
    const desc = msgText;
    const wine = guest.currentWine;

    // Responder de inmediato para no dejar al usuario esperando
    res.end(twiml('Dame un momento mientras preparo tu ficha de catador... ✍️🍷'));

    // Guardar en Firestore
    const docResult = await fsAdd('responses', {
      name: guest.name,
      phone: from,
      wine,
      description: desc,
      claudeResponse: '',
      ts: Date.now(),
    });
    const docId = docResult.name?.split('/').pop();

    // Marcar como enviado para que no procese mensajes duplicados
    await fsSet(`guests/${key}`, { state: 'submitted' });

    // Llamar a Claude (la función sigue corriendo después de res.end())
    try {
      const prompt = `Eres un sommelier experto y carismático en una cata de vinos. ${guest.name} acaba de probar el Vino #${wine} y lo describió así: "${desc}".

Genera una ficha de catador personalizada y elegante para ${guest.name} basada en su descripción. La ficha debe:
- Usar tuteo (tú), tono sofisticado pero cálido y accesible, nunca pedante
- Validar e interpretar su descripción usando vocabulario de sommelier de forma natural
- Identificar su "perfil de paladar" de forma halagadora y memorable
- Tener máximo 3-4 oraciones fluidas y bien escritas
- Terminar con una predicción encantadora sobre qué tipo de vino le encantaría explorar después

Responde solo con la ficha en español colombiano, sin títulos, sin comillas, sin encabezados.`;

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const claudeData = await claudeRes.json();
      const ficha = claudeData.content?.[0]?.text || 'No se pudo generar la ficha.';

      // Guardar ficha en Firestore
      if (docId) await fsSet(`responses/${docId}`, { claudeResponse: ficha });

      // Enviar ficha por WhatsApp
      await sendWhatsApp(
        from,
        `🍷 *Tu ficha de catador — Vino ${wine}*\n\n${ficha}\n\n_El anfitrión te avisará cuando llegue el siguiente vino._`
      );
    } catch (e) {
      console.error('Error generando ficha:', e);
      await sendWhatsApp(
        from,
        'Ups, tuve un problema generando tu ficha 😔 Respóndeme de nuevo con tu descripción y lo intento otra vez.'
      );
      // Revertir estado para que pueda reintentar
      await fsSet(`guests/${key}`, { state: 'describing' });
    }
    return;
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return res.end(
    twiml('¡Hola! 🍷 Estamos en la cata. Avísale al anfitrión si tienes algún problema.')
  );
};
