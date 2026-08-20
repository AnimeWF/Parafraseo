// ═══════════════════════════════════════════════════════════════════════════════
//  ParafraseAI · API Serverless (Vercel)
//  Endpoint: /api/paraphrase
// ═══════════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  // ── Solo POST ────────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  // ── Validar body ─────────────────────────────────────────────────────────
  const { prompt, model, temperature } = req.body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Falta el prompt o está vacío.' });
  }

  if (prompt.length > 12000) {
    return res.status(400).json({ error: 'El prompt es demasiado largo (máx. 12000 caracteres).' });
  }

  // ── Validar API Key ────────────────────────────────────────────────────────
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error('[ParafraseAI] Falta variable de entorno GROQ_API_KEY');
    return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
  }

  // ── Parámetros con fallbacks seguros ─────────────────────────────────────
  const ALLOWED_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768'
  ];

  const modelName = ALLOWED_MODELS.includes(model) ? model : 'llama-3.3-70b-versatile';
  const tempValue = typeof temperature === 'number' && temperature >= 0 && temperature <= 1
                    ? temperature
                    : 0.7;

  const MAX_TOKENS = 4096;  // Aumentado para chunks grandes

  // ── Headers de seguridad ─────────────────────────────────────────────────
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'User-Agent':    'ParafraseAI/1.0'
      },
      body: JSON.stringify({
        model:       modelName,
        messages:    [{ role: 'user', content: prompt }],
        temperature: tempValue,
        max_tokens:  MAX_TOKENS,
        top_p:       0.9,
        stream:      false
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[ParafraseAI] Error de Groq:', JSON.stringify(errorData));
      const msg = errorData?.error?.message || `Error HTTP ${response.status} de Groq`;
      return res.status(response.status).json({ error: msg });
    }

    const data        = await response.json();
    const paraphrased = data?.choices?.[0]?.message?.content;

    if (!paraphrased || !paraphrased.trim()) {
      return res.status(500).json({ error: 'La API devolvió una respuesta vacía.' });
    }

    // ── Respuesta exitosa ──────────────────────────────────────────────────
    return res.status(200).json({
      paraphrased: paraphrased.trim(),
      model: modelName,
      usage: data?.usage || null
    });

  } catch (error) {
    console.error('[ParafraseAI] Error interno:', error.message);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'La solicitud tardó demasiado. Intenta con un texto más corto.' });
    }
    return res.status(500).json({ error: 'Error interno del servidor: ' + error.message });
  }
}