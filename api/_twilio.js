// Envía un mensaje de WhatsApp via Twilio REST API — no requiere npm
async function sendWhatsApp(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WA_FROM;

  if (!sid || !token || !from) {
    console.error('Faltan variables de entorno de Twilio');
    return null;
  }

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  const r = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
    }
  );

  const d = await r.json();
  if (!r.ok || d.error_code) console.error('Twilio error:', JSON.stringify(d));
  return d;
}

module.exports = { sendWhatsApp };
