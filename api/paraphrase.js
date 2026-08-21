// ═══════════════════════════════════════════════════════════════════════════════
//  ParafraseAI · API Serverless (Vercel)
//  Endpoint: /api/paraphrase
//
//  GET  → Diagnóstico: valida tu clave y lista los modelos disponibles
//  POST → Parafrasea el texto enviado
//
//  Optimizado para modelos GRATUITOS: GPT-OSS 120B/20B y Qwen 3.6 27B.
//  (Los GPT-OSS necesitan temperature 1.0 / top_p 1.0, sus valores de entreno)
// ═══════════════════════════════════════════════════════════════════════════════

const TONES = {
  natural: 'natural y fluido, como lo escribiría una persona real',
  academico: 'académico y formal, apropiado para papers y ensayos universitarios',
  formal: 'formal y profesional, apropiado para documentos de negocios',
  conversacional: 'conversacional y cercano, como una conversación entre amigos'
};

const INTENSITY_TEXT = {
  1: 'cambios mínimos (solo sinónimos puntuales, conserva estructura de oraciones casi intacta)',
  2: 'cambios medios (reestructura algunas oraciones, varía vocabulario manteniendo fluidez)',
  3: 'reescritura profunda (transforma completamente la redacción manteniendo el significado exacto)'
};

const PRESERVE_RULES = {
  titles: '- NO modifiques los títulos, encabezados ni líneas que empiecen con # o estén en MAYÚSCULAS CORTAS. Cópialos exactamente igual.\n',
  numbers: '- Preserva todos los números, fechas, porcentajes y datos exactos sin cambiarlos.\n',
  technical: '- Mantén los términos técnicos, siglas y nombres propios sin usar sinónimos.\n'
};

function buildPrompt(text, tone, intensity, preserve) {
  let preserveRules = '';
  for (const key of preserve) {
    if (PRESERVE_RULES[key]) preserveRules += PRESERVE_RULES[key];
  }

  return `Eres un parafraseador profesional en español con amplia experiencia en reescritura de textos. Tu tarea es reescribir ÚNICAMENTE los párrafos de contenido, respetando siempre los títulos.

REGLAS OBLIGATORIAS:
1. Tono: ${TONES[tone] || TONES.natural}.
2. Intensidad: ${INTENSITY_TEXT[intensity] || INTENSITY_TEXT[2]}.
${preserveRules}3. NO añadas comentarios, explicaciones, introducciones ni prefijos como "Aquí el texto:" o "Paráfrasis:".
4. NO uses frases como "En resumen", "Para concluir", "En síntesis" al final.
5. Devuelve SOLO el texto reescrito, manteniendo la misma estructura de líneas y párrafos.
6. Los títulos y encabezados deben aparecer idénticos al original.
7. Mantén la coherencia y cohesión entre párrafos.

TEXTO A PARAFRASEAR:
${text}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return res.status(500).json({
      status: 'error',
      error: 'Falta la variable GROQ_API_KEY en Vercel → Settings → Environment Variables.'
    });
  }

  // ── GET: Diagnóstico de la clave + lista de modelos ─────────────────────
  if (req.method === 'GET') {
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` }
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const hint = resp.status === 401
          ? 'La clave GROQ_API_KEY es inválida o expiró. Genera una nueva en console.groq.com/keys.'
          : 'Revisa el estado de tu cuenta en console.groq.com.';
        return res.status(resp.status).json({
          status: 'error',
          error: data?.error?.message || `Groq respondió HTTP ${resp.status}`,
          hint
        });
      }

      const models = (data.data || []).map(m => m.id).sort();
      return res.status(200).json({
        status: 'ok',
        keyValid: true,
        modelCount: models.length,
        models
      });
    } catch (e) {
      return res.status(500).json({ status: 'error', error: 'No se pudo contactar a Groq: ' + e.message });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Método no permitido. Usa GET o POST.' });
  }

  // ── POST: Parafrasear ───────────────────────────────────────────────────
  const { text, tone, intensity, preserve, model } = req.body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Falta el texto o está vacío.' });
  }
  if (text.length > 11000) {
    return res.status(400).json({ error: 'El texto es demasiado largo (máx. 11000 caracteres por segmento).' });
  }

  // Sanitizar el nombre del modelo
  const modelName = typeof model === 'string' && /^[a-zA-Z0-9._\/-]{1,80}$/.test(model)
    ? model
    : 'openai/gpt-oss-20b';

  const safeTone      = TONES[tone] ? tone : 'natural';
  const safeIntensity = [1, 2, 3].includes(Number(intensity)) ? Number(intensity) : 2;
  const safePreserve  = Array.isArray(preserve)
    ? preserve.filter(k => PRESERVE_RULES[k])
    : ['titles', 'numbers'];

  // ── Parámetros según el modelo ──────────────────────────────────────────
  // Los modelos GPT-OSS fueron entrenados con temperature 1.0 y top_p 1.0;
  // usar otros valores degrada la calidad de la respuesta.
  const isGptOss    = modelName.startsWith('openai/gpt-oss');
  const tempValue   = isGptOss ? 1.0 : [0.3, 0.7, 1.0][safeIntensity - 1];
  const topPValue   = isGptOss ? 1.0 : 0.9;
  const maxTokens   = 4096;

  const prompt = buildPrompt(text.trim(), safeTone, safeIntensity, safePreserve);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'User-Agent': 'ParafraseAI/4.0'
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: tempValue,
        max_tokens: maxTokens,
        top_p: topPValue,
        stream: false
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const groqMsg = errorData?.error?.message || `HTTP ${response.status}`;
      console.error('[ParafraseAI] Error de Groq:', response.status, groqMsg);

      if (response.status === 429) {
        return res.status(429).json({
          error: 'Límite diario/horario de Groq alcanzado. Espera unos minutos.',
          retryAfter: 30
        });
      }
      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({
          error: 'La clave GROQ_API_KEY es inválida o expiró. Genera una nueva en console.groq.com/keys.'
        });
      }
      if (response.status === 404) {
        return res.status(404).json({
          error: `El modelo "${modelName}" no está disponible para tu clave. Recarga la página para actualizar la lista.`
        });
      }
      return res.status(502).json({ error: `Error de Groq: ${groqMsg}` });
    }

    const data = await response.json();
    const choice = data?.choices?.[0];
    const paraphrased = choice?.message?.content;

    if (!paraphrased || !paraphrased.trim()) {
      return res.status(502).json({ error: 'La API devolvió una respuesta vacía.' });
    }

    return res.status(200).json({
      paraphrased: paraphrased.trim(),
      model: modelName,
      truncated: choice?.finish_reason === 'length',
      usage: data?.usage || null
    });

  } catch (error) {
    console.error('[ParafraseAI] Error interno:', error.message);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'La solicitud tardó demasiado. Intenta con un texto más corto.' });
    }
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

export const config = { maxDuration: 60 };