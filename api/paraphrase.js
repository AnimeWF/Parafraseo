// ═══════════════════════════════════════════════════════════════════════════════
//  ParafraseAI · API Serverless (Vercel) · Endpoint: /api/paraphrase
//  ⚠️ VERSIÓN DE DIAGNÓSTICO: muestra el error REAL de Groq para detectar el fallo
// ═══════════════════════════════════════════════════════════════════════════════

const TONES = {
  natural: 'natural y fluido, como lo escribiría una persona real',
  academico: 'académico y formal, apropiado para papers y ensayos universitarios',
  formal: 'formal y profesional, apropiado para documentos de negocios',
  conversacional: 'conversacional y cercano, como una conversación entre amigos'
};

const INTENSITY_TEXT = {
  1: 'cambios mínimos (solo sinónimos puntuales)',
  2: 'cambios medios (reestructura algunas oraciones)',
  3: 'reescritura profunda (transforma la redacción manteniendo el significado)'
};

const PRESERVE_RULES = {
  titles: '- NO modifiques los títulos ni líneas en MAYÚSCULAS CORTAS. Cópialos igual.\n',
  numbers: '- Preserva todos los números, fechas y porcentajes exactos.\n',
  technical: '- Mantén los términos técnicos y siglas sin sinónimos.\n'
};

function buildPrompt(text, tone, intensity, preserve) {
  let preserveRules = '';
  for (const key of preserve) {
    if (PRESERVE_RULES[key]) preserveRules += PRESERVE_RULES[key];
  }
  return `Eres un parafraseador profesional en español. Reescribe ÚNICAMENTE los párrafos de contenido, respetando los títulos.

REGLAS:
1. Tono: ${TONES[tone] || TONES.natural}.
2. Intensidad: ${INTENSITY_TEXT[intensity] || INTENSITY_TEXT[2]}.
${preserveRules}3. NO añadas comentarios ni prefijos.
4. Devuelve SOLO el texto reescrito, con la misma estructura.

TEXTO A PARAFRASEAR:
${text}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  const { text, tone, intensity, preserve, model, temperature } = req.body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Falta el texto.' });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'Falta GROQ_API_KEY en Vercel.' });
  }

  // ── MODELOS VÁLIDOS (Mixtral fue retirado por Groq) ─────────────────────
  const ALLOWED_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'gemma2-9b-it'
  ];
  const modelName = ALLOWED_MODELS.includes(model) ? model : 'llama-3.3-70b-versatile';

  const safeTone = TONES[tone] ? tone : 'natural';
  const safeIntensity = [1, 2, 3].includes(Number(intensity)) ? Number(intensity) : 2;
  const safePreserve = Array.isArray(preserve)
    ? preserve.filter(k => PRESERVE_RULES[k])
    : ['titles', 'numbers'];
  const tempValue = typeof temperature === 'number' && temperature >= 0 && temperature <= 1
    ? temperature
    : [0.3, 0.7, 1.0][safeIntensity - 1];

  const prompt = buildPrompt(text.trim(), safeTone, safeIntensity, safePreserve);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: tempValue,
        max_tokens: 4096,
        top_p: 0.9,
        stream: false
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const groqMessage = errorData?.error?.message || JSON.stringify(errorData) || 'Sin detalle';
      console.error('[ParafraseAI] Groq error:', response.status, groqMessage);

      // 🔍 DIAGNÓSTICO: devolvemos el mensaje REAL de Groq
      return res.status(response.status).json({
        error: `[Groq ${response.status}] ${groqMessage} · Modelo enviado: ${modelName}`
      });
    }

    const data = await response.json();
    const paraphrased = data?.choices?.[0]?.message?.content;

    if (!paraphrased || !paraphrased.trim()) {
      return res.status(502).json({ error: 'Groq devolvió respuesta vacía.' });
    }

    return res.status(200).json({
      paraphrased: paraphrased.trim(),
      model: modelName,
      usage: data?.usage || null
    });

  } catch (error) {
    console.error('[ParafraseAI] Error interno:', error.message);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout: la solicitud tardó demasiado.' });
    }
    // 🔍 DIAGNÓSTICO: mostramos el error real
    return res.status(500).json({ error: `Error interno: ${error.message}` });
  }
}

export const config = { maxDuration: 60 };