module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const waFrom = process.env.TWILIO_WA_FROM || '';
  // "whatsapp:+14155238886" → "14155238886" (wa.me no usa el +)
  const waNumber = waFrom.replace('whatsapp:', '').replace('+', '');
  const joinWord = process.env.TWILIO_SANDBOX_JOIN || '';

  res.json({ waNumber, joinWord });
};
