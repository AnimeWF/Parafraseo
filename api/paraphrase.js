// ═══════════════════════════════════════════════════════════════════════════════
//  ParafraseAI · API Serverless (Vercel)
//  Endpoint: /api/paraphrase
//
//  Fase 4: protección de citas (marcadores ⟦Q⟧), auto-humanizar (boostHumanize)
//  y retorno de cuota restante de Groq.
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
  technical: '- Mantén los términos técnicos, siglas y nombres propios sin usar sinónimos.\n',
  quotes: '- NO modifiques el texto entre comillas ("...", “…”, «...») ni las citas/referencias bibliográficas tipo (Apellido, año). Cópialos EXACTAMENTE como aparecen.\n'
};

const AUDIENCES = {
  general: 'vocabulario accesible y claro, apropiado para público general',
  experto: 'vocabulario técnico y preciso, apropiado para especialistas en el tema',
  estudiante: 'lenguaje claro, didáctico y fácil de comprender para estudiantes'
};

const LENGTHS = {
  resumir: 'Reduce la extensión aproximadamente un 30 %, conservando todas las ideas clave.',
  igual: 'Mantén una extensión similar a la del original.',
  expandir: 'Amplía la extensión aproximadamente un 30 %, desarrollando las ideas sin inventar información nueva.'
};

const FORMS = {
  usted: 'Usa tratamiento de usted en todo el texto.',
  tu: 'Usa tratamiento de tú en todo el texto.',
  impersonal: 'Redacta en forma impersonal (ej.: "se observa", "se considera", "se puede afirmar").'
};

const BANNED_PHRASES = [
  'en conclusión', 'cabe destacar', 'cabe señalar', 'es importante mencionar',
  'es importante destacar', 'en la actualidad', 'sin duda', 'en este sentido',
  'juega un papel crucial', 'es fundamental', 'hoy en día', 'en el mundo actual',
  'resulta evidente', 'es menester', 'en resumen', 'asimismo', 'del mismo modo',
  'de igual manera', 'por otro lado', 'en primer lugar', 'en segundo lugar',
  'finalmente', 'no cabe duda', 'vale la pena', 'en pocas palabras'
];

function buildPrompt(text, opts) {
  let rules = '';
  let n = 1;

  rules += `${n++}. Tono: ${TONES[opts.tone] || TONES.natural}.\n`;
  rules += `${n++}. Intensidad: ${INTENSITY_TEXT[opts.intensity] || INTENSITY_TEXT[2]}.\n`;

  if (opts.audience && AUDIENCES[opts.audience]) {
    rules += `${n++}. Público objetivo: usa ${AUDIENCES[opts.audience]}.\n`;
  }
  if (opts.length && LENGTHS[opts.length]) {
    rules += `${n++}. Extensión: ${LENGTHS[opts.length]}\n`;
  }
  if (opts.form && FORMS[opts.form]) {
    rules += `${n++}. Tratamiento: ${FORMS[opts.form]}\n`;
  }

  let preserveRules = '';
  for (const key of opts.preserve || []) {
    if (PRESERVE_RULES[key]) preserveRules += PRESERVE_RULES[key];
  }

  // Si el texto contiene marcadores de citas protegidas, exige conservarlos
  if (text.includes('⟦')) {
    rules += `${n++}. MUY IMPORTANTE: conserva EXACTAMENTE y sin modificar cualquier marcador entre ⟦ y ⟧ (por ejemplo ⟦Q1⟧, ⟦Q2⟧). Son citas protegidas que se restaurarán después; no las traduzcas, reordenes ni elimines.\n`;
  }

  // Modo humanizar (normal o reforzado)
  const humanizeOn = opts.humanize || opts.boostHumanize;
  let humanizeRules = '';
  if (humanizeOn) {
    humanizeRules = `
REGLAS DE HUMANIZACIÓN (OBLIGATORIAS):
- Varía la longitud de las oraciones: alterna frases cortas y directas con otras más largas. El ritmo debe sentirse natural e irregular, como escrito por una persona.
- PROHIBIDO usar estas expresiones típicas de IA: ${BANNED_PHRASES.map(p => `"${p}"`).join(', ')}.
- No empieces oraciones consecutivas con la misma palabra ni repitas el mismo conector.
- Escribe en prosa fluida; evita listas y estructuras repetitivas.
- Prefiere construcciones sencillas y directas antes que subordinadas largas.`;

    if (opts.boostHumanize) {
      humanizeRules += `
- REFUERZO EXTRA: esta es una segunda pasada de humanización. Sé aún más natural: usa giros coloquiales suaves, evita cualquier patrón formulaico y haz que el texto suene completamente humano, como si lo hubiera escrito un estudiante real.`;
    }
  }

  return `Eres un parafraseador profesional en español con amplia experiencia en reescritura de textos. Tu tarea es reescribir ÚNICAMENTE los párrafos de contenido, respetando siempre los títulos y las citas protegidas.

REGLAS OBLIGATORIAS:
${rules}${preserveRules}${n++}. NO añadas comentarios, explicaciones, introducciones ni prefijos como "Aquí el texto:" o "Paráfrasis:".
${n++}. Devuelve SOLO el texto reescrito, manteniendo la misma estructura de líneas y párrafos.
${n++}. Los títulos, encabezados y citas protegidas deben aparecer idénticos al original.
${n++}. Mantén la coherencia y cohesión entre párrafos.${humanizeRules}

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
      return res.status(200).json({ status: 'ok', keyValid: true, modelCount: models.length, models });
    } catch (e) {
      return res.status(500).json({ status: 'error', error: 'No se pudo contactar a Groq: ' + e.message });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Método no permitido. Usa GET o POST.' });
  }

  // ── POST: Parafrasear ───────────────────────────────────────────────────
  const body = req.body || {};
  const { text, tone, intensity, preserve, model, humanize, boostHumanize, audience, length, form } = body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Falta el texto o está vacío.' });
  }
  if (text.length > 11000) {
    return res.status(400).json({ error: 'El texto es demasiado largo (máx. 11000 caracteres por segmento).' });
  }

  const modelName = typeof model === 'string' && /^[a-zA-Z0-9._\/-]{1,80}$/.test(model)
    ? model
    : 'openai/gpt-oss-20b';

  const opts = {
    tone: TONES[tone] ? tone : 'natural',
    intensity: [1, 2, 3].includes(Number(intensity)) ? Number(intensity) : 2,
    preserve: Array.isArray(preserve) ? preserve.filter(k => PRESERVE_RULES[k]) : ['titles', 'numbers'],
    humanize: Boolean(humanize),
    boostHumanize: Boolean(boostHumanize),
    audience: AUDIENCES[audience] ? audience : null,
    length: LENGTHS[length] ? length : null,
    form: FORMS[form] ? form : null
  };

  const isGptOss  = modelName.startsWith('openai/gpt-oss');
  const tempValue = isGptOss ? 1.0 : [0.3, 0.7, 1.0][opts.intensity - 1];
  const topPValue = isGptOss ? 1.0 : 0.9;

  const prompt = buildPrompt(text.trim(), opts);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'User-Agent': 'ParafraseAI/6.0'
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: tempValue,
        max_tokens: 4096,
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
          error: 'Límite de Groq alcanzado. Espera unos minutos o cambia a GPT-OSS 20B.',
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

    // ── Cuota restante (headers de rate limit de Groq) ───────────────────
    const remainingReqs = response.headers.get('x-ratelimit-remaining-requests');
    const quota = remainingReqs !== null && !isNaN(parseInt(remainingReqs, 10))
      ? { remainingRequests: parseInt(remainingReqs, 10) }
      : null;

    return res.status(200).json({
      paraphrased: paraphrased.trim(),
      model: modelName,
      truncated: choice?.finish_reason === 'length',
      usage: data?.usage || null,
      quota
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