// ═══════════════════════════════════════════════════════════════════════════════
//  ParafraseAI · API Serverless (Vercel) — proyecto SEPARADO del frontend
//  Endpoint: /api/paraphrase
//
//  NUEVO: soporte CORS completo, ya que el frontend vive en otro dominio.
//  · Maneja el preflight OPTIONS
//  · Lista blanca de orígenes (ALLOWED_ORIGINS)
//  · GET de diagnóstico para verificar despliegue y clave
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CORS: dominios autorizados a usar esta API ──────────────────────────────
const ALLOWED_ORIGINS = [
  'https://parafraseo.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
  '*' // ← Permite todos los orígenes temporalmente para pruebas
];

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  const allowAll = ALLOWED_ORIGINS.includes('*');

  if (allowAll || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');
  }
}

// ─── Rate limit en memoria (ventana deslizante) ───────────────────────────────
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQ = 40;
const rateHits = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  let hits = rateHits.get(ip) || [];
  hits = hits.filter(t => now - t < RATE_WINDOW_MS);

  if (hits.length >= RATE_MAX_REQ) {
    rateHits.set(ip, hits);
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - hits[0])) / 1000);
    return { limited: true, retryAfter };
  }

  hits.push(now);
  rateHits.set(ip, hits);

  if (rateHits.size > 10000) rateHits.clear();
  return { limited: false };
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || 'desconocida';
}

// ─── Construcción del prompt en el servidor ───────────────────────────────────
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

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Aplicar headers CORS a TODAS las respuestas
  applyCors(req, res);

  // Preflight CORS: el navegador envía OPTIONS antes del POST con JSON
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Endpoint de diagnóstico (GET)
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      endpoint: '/api/paraphrase',
      keyConfigured: Boolean(process.env.GROQ_API_KEY)
    });
  }

  // Solo POST para parafrasear
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(405).json({ error: 'Método no permitido. Usa GET o POST.' });
  }

  // Rate limit por IP
  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  if (rate.limited) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    return res.status(429).json({
      error: 'Has alcanzado el límite de peticiones por minuto. Espera unos segundos.',
      retryAfter: rate.retryAfter
    });
  }

  // Validar body
  const { text, tone, intensity, preserve, model, temperature } = req.body || {};

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Falta el texto o está vacío.' });
  }
  if (text.length > 11000) {
    return res.status(400).json({ error: 'El texto es demasiado largo (máx. 11000 caracteres).' });
  }

  // Validar API Key
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error('[ParafraseAI] Falta variable de entorno GROQ_API_KEY');
    return res.status(500).json({
      error: 'Falta la variable GROQ_API_KEY en el servidor. Configúrala en Vercel → Settings → Environment Variables y haz redeploy.'
    });
  }

  // Parámetros validados con whitelist
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

  const MAX_TOKENS = 4096;
  const prompt = buildPrompt(text.trim(), safeTone, safeIntensity, safePreserve);

  // Headers de seguridad
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'User-Agent': 'ParafraseAI/2.0'
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: tempValue,
        max_tokens: MAX_TOKENS,
        top_p: 0.9,
        stream: false
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[ParafraseAI] Error de Groq:', JSON.stringify(errorData));

      if (response.status === 429) {
        return res.status(429).json({
          error: 'La API de IA está saturada. Reintentando en unos segundos...',
          retryAfter: 8
        });
      }

      if (response.status === 401 || response.status === 403) {
        return res.status(502).json({
          error: 'La clave GROQ_API_KEY parece inválida o expirada. Genera una nueva en console.groq.com.'
        });
      }

      return res.status(502).json({ error: 'Error del proveedor de IA. Inténtalo de nuevo.' });
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

// Duración máxima de la función
export const config = {
  maxDuration: 60
};