// Prueba directa del API key — corre con: node test-api.js
const key = process.argv[2] || process.env.ANTHROPIC_API_KEY;

if (!key) {
  console.error('Falta la key. Úsalo así: node test-api.js sk-ant-...');
  process.exit(1);
}

console.log('Probando key:', key.slice(0, 18) + '...');

fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-haiku-20240307',
    max_tokens: 20,
    messages: [{ role: 'user', content: 'Responde solo: funciona' }],
  }),
})
  .then((r) => r.json())
  .then((d) => {
    if (d.error) {
      console.error('❌ Error Anthropic:', d.error.type, '-', d.error.message);
    } else {
      console.log('✅ Key válida. Respuesta:', d.content?.[0]?.text);
    }
  })
  .catch((e) => console.error('❌ Error de red:', e.message));
