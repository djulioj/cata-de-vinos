module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, wine, description } = req.body || {};
  if (!name || !wine || !description) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  const prompt = `Eres un sommelier experto y carismático en una cata de vinos. ${name} acaba de probar el Vino #${wine} y lo describió así: "${description}".

Genera una ficha de catador personalizada y elegante para ${name} basada en su descripción. La ficha debe:
- Usar tuteo (tú), tono sofisticado pero cálido y accesible, nunca pedante
- Validar e interpretar su descripción usando vocabulario de sommelier de forma natural
- Identificar su "perfil de paladar" de forma halagadora y memorable
- Tener máximo 3-4 oraciones fluidas y bien escritas
- Terminar con una predicción encantadora sobre qué tipo de vino le encantaría explorar después

Responde solo con la ficha en español colombiano, sin títulos, sin comillas, sin encabezados.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return res.status(500).json({ error: 'Error al generar la ficha' });
    }

    const data = await response.json();
    const text = data.content?.find((b) => b.type === 'text')?.text || '';
    return res.status(200).json({ response: text });
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
