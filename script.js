// ═══════════════════════════════════════════════════════════════════════════════
//  ParafraseAI · Frontend
//  by Jaime Wong Franco
//
//  · Detecta automáticamente los modelos gratuitos de tu clave de Groq
//  · Modo comparación, historial visible, cancelar, contador, texto de ejemplo
// ═══════════════════════════════════════════════════════════════════════════════
'use strict';

// ─── Configuración de PDF.js ──────────────────────────────────────────────────
window.addEventListener('load', () => {
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
});

function isDocxAvailable() {
  return typeof docx !== 'undefined' && docx && typeof docx.Document === 'function';
}

// ─── Elementos del DOM ────────────────────────────────────────────────────────
const fileInput        = document.getElementById('file-input');
const dropZone         = document.getElementById('drop-zone');
const fileLoadedDiv    = document.getElementById('file-loaded');
const fileNameSpan     = document.getElementById('file-name');
const fileMetaSpan     = document.getElementById('file-meta');
const clearFileBtn     = document.getElementById('clear-file-btn');
const textInput        = document.getElementById('text-input');
const textMetaRow      = document.getElementById('text-meta-row');
const textCounter      = document.getElementById('text-counter');
const sampleBtn        = document.getElementById('sample-btn');
const tabFile          = document.getElementById('tab-file');
const tabText          = document.getElementById('tab-text');
const fileModeDiv      = document.getElementById('file-mode');
const runBtn           = document.getElementById('run-btn');
const cancelBtn        = document.getElementById('cancel-btn');
const progressSection  = document.getElementById('progress-section');
const outputSection    = document.getElementById('output-section');
const outputTextarea   = document.getElementById('output-textarea');
const originalTextarea = document.getElementById('original-textarea');
const outputCompare    = document.getElementById('output-compare');
const compareOriginalPane = document.getElementById('compare-original-pane');
const compareBtn       = document.getElementById('compare-btn');
const statOrig         = document.getElementById('stat-orig');
const statNew          = document.getElementById('stat-new');
const statChunks       = document.getElementById('stat-chunks');
const statSimilarity   = document.getElementById('stat-similarity');
const errMsg           = document.getElementById('err-msg');
const progressFill     = document.getElementById('progress-fill');
const progressLabel    = document.getElementById('progress-label');
const chunkStatusDiv   = document.getElementById('chunk-status');
const logLine          = document.getElementById('log-line');
const copyBtn          = document.getElementById('copy-btn');
const downloadDocxBtn  = document.getElementById('download-docx-btn');
const downloadTxtBtn   = document.getElementById('download-txt-btn');
const resetBtn         = document.getElementById('reset-btn');
const intensitySlider  = document.getElementById('intensity');
const intensityVal     = document.getElementById('intensity-val');
const modelSelect      = document.getElementById('model-select');
const toneSelect       = document.getElementById('tone');
const historySection   = document.getElementById('history-section');
const historyList      = document.getElementById('history-list');
const clearHistoryBtn  = document.getElementById('clear-history-btn');
const toastContainer   = document.getElementById('toast-container');

// ─── Variables globales ───────────────────────────────────────────────────────
let extractedText     = '';
let currentMode       = 'file';
let originalFilename  = '';
let originalFileExt   = '';
let lastOriginalText  = '';
let paraphraseHistory = [];
let modelsReady       = false;
let currentAbort      = null;
let cancelRequested   = false;

const MAX_FILE_SIZE_MB = 5;

// ─── Modelos preferidos (orden de prioridad) ─────────────────────────────────
// Los 3 primeros son los GRATUITOS disponibles en tu cuenta de Groq.
const PREFERRED_MODELS = [
  { id: 'openai/gpt-oss-120b',     label: '🚀 GPT-OSS 120B (mejor calidad)' },
  { id: 'qwen/qwen3.6-27b',        label: '⚖️ Qwen 3.6 27B (equilibrado)' },
  { id: 'openai/gpt-oss-20b',      label: '⚡ GPT-OSS 20B (rápido)' },
  { id: 'llama-3.3-70b-versatile', label: '🧠 Llama 3.3 70B (si se habilita)' },
  { id: 'llama-3.1-8b-instant',    label: '🦙 Llama 3.1 8B (si se habilita)' },
  { id: 'gemma2-9b-it',            label: '💎 Gemma 2 9B (si se habilita)' }
];

// Modelos que NO sirven para parafrasear (audio, voz, moderación, agentes)
const EXCLUDE_PATTERN = /whisper|tts|playai|image|embed|audio|speech|distil|orpheus|guard|compound|safeguard|allam/i;

const TONE_LABELS = {
  natural: '🌿 Natural',
  academico: '🎓 Académico',
  formal: '💼 Formal',
  conversacional: '💬 Conversacional'
};

const MODEL_LABELS = {
  'openai/gpt-oss-120b': 'GPT-OSS 120B',
  'openai/gpt-oss-20b': 'GPT-OSS 20B',
  'qwen/qwen3.6-27b': 'Qwen 3.6 27B'
};

const SAMPLE_TEXT = `LA IMPORTANCIA DE LA LECTURA EN LA ERA DIGITAL

La lectura sigue siendo una de las herramientas más poderosas para el desarrollo del pensamiento crítico. Según un estudio publicado en 2023, los jóvenes que leen al menos 30 minutos al día muestran una comprensión lectora un 45 % superior a la media.

Sin embargo, las pantallas han transformado nuestros hábitos. Hoy dedicamos un promedio de 7 horas diarias a dispositivos electrónicos, y la lectura profunda está en claro declive.

Los especialistas recomiendan recuperar espacios de lectura sin interrupciones, aunque sea en bloques breves, para fortalecer la concentración y la memoria a largo plazo.`;

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  tabFile.addEventListener('click', () => switchMode('file'));
  tabText.addEventListener('click', () => switchMode('text'));
  fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
  clearFileBtn.addEventListener('click', clearFile);
  runBtn.addEventListener('click', startParaphrase);
  cancelBtn.addEventListener('click', cancelParaphrase);
  copyBtn.addEventListener('click', copyOutput);
  compareBtn.addEventListener('click', toggleCompare);
  downloadDocxBtn.addEventListener('click', downloadAsDocx);
  downloadTxtBtn.addEventListener('click', downloadAsTxt);
  resetBtn.addEventListener('click', resetAll);
  sampleBtn.addEventListener('click', loadSampleText);
  clearHistoryBtn.addEventListener('click', clearHistory);
  intensitySlider.addEventListener('input', (e) => updateIntensity(e.target.value));

  document.querySelectorAll('#preserve-chips .toggle-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      chip.setAttribute('aria-pressed', String(chip.classList.contains('active')));
    });
  });

  textInput.addEventListener('input', () => { autoGrow(); updateTextCounter(); });
  textInput.addEventListener('paste', () => setTimeout(() => { autoGrow(); updateTextCounter(); }, 0));

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });
  dropZone.addEventListener('dragover', () => dropZone.classList.add('drag-over'));
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 1) {
      showErr('Solo se permite subir un archivo a la vez.');
      return;
    }
    if (files[0]) handleFile(files[0]);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !runBtn.disabled) {
      e.preventDefault();
      startParaphrase();
    }
    if (e.key === 'Escape' && !runBtn.disabled) {
      cancelParaphrase();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && document.activeElement === outputTextarea) {
      if (outputTextarea.selectionStart === outputTextarea.selectionEnd) {
        e.preventDefault();
        copyOutput();
      }
    }
  });

  updateIntensity(intensitySlider.value);
  loadHistory();
  renderHistory();
  loadAvailableModels();
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Notificaciones toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 350);
  }, 2800);
}

let errTimer = null;
function showErr(msg) {
  errMsg.innerText = msg;
  errMsg.classList.toggle('visible', !!msg);
  if (errTimer) clearTimeout(errTimer);
}

// ─── Detección automática de modelos disponibles ─────────────────────────────
async function loadAvailableModels() {
  modelSelect.innerHTML = '<option value="">⏳ Verificando modelos...</option>';
  runBtn.disabled = true;

  try {
    const response = await fetch('/api/paraphrase');
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.status === 'error') {
      modelSelect.innerHTML = '<option value="">❌ Error de configuración</option>';
      showErr('⚠️ Problema con Groq: ' + (data.error || `HTTP ${response.status}`) +
        (data.hint ? ' ' + data.hint : ''));
      return;
    }

    const available = new Set(data.models || []);

    let options = PREFERRED_MODELS.filter(m => available.has(m.id));

    if (options.length === 0) {
      options = (data.models || [])
        .filter(id => !EXCLUDE_PATTERN.test(id))
        .slice(0, 8)
        .map(id => ({ id, label: id }));
    }

    if (options.length === 0) {
      modelSelect.innerHTML = '<option value="">❌ Sin modelos disponibles</option>';
      showErr('⚠️ Tu clave de Groq no tiene acceso a modelos de chat. Revisa console.groq.com.');
      return;
    }

    modelSelect.innerHTML = options
      .map(m => `<option value="${m.id}">${m.label}</option>`)
      .join('');

    modelsReady = true;
    runBtn.disabled = false;
    showErr('');
  } catch (e) {
    modelSelect.innerHTML = '<option value="">❌ Sin conexión</option>';
    showErr('⚠️ No se pudo conectar con la API para cargar los modelos. Recarga la página.');
  }
}

// ─── Auto-grow textarea + contador ────────────────────────────────────────────
function autoGrow() {
  textInput.style.height = 'auto';
  textInput.style.height = Math.min(textInput.scrollHeight, 600) + 'px';
}

function updateTextCounter() {
  const text = textInput.value;
  const words = countWords(text);
  textCounter.innerText = `${words.toLocaleString('es')} palabras · ${text.length.toLocaleString('es')} caracteres`;
}

function loadSampleText() {
  switchMode('text');
  textInput.value = SAMPLE_TEXT;
  autoGrow();
  updateTextCounter();
  showToast('✨ Texto de ejemplo cargado. Pulsa «Iniciar parafraseado».', 'info');
}

// ─── Cambio de modo (archivo / texto pegado) ──────────────────────────────────
function switchMode(mode) {
  currentMode = mode;
  tabFile.classList.toggle('active', mode === 'file');
  tabText.classList.toggle('active', mode === 'text');
  tabFile.setAttribute('aria-selected', String(mode === 'file'));
  tabText.setAttribute('aria-selected', String(mode === 'text'));
  fileModeDiv.style.display = mode === 'file' ? 'block' : 'none';
  textInput.style.display   = mode === 'text' ? 'block' : 'none';
  textMetaRow.style.display = mode === 'text' ? 'flex' : 'none';
  if (mode === 'text') {
    extractedText = '';
    updateTextCounter();
    setTimeout(() => textInput.focus(), 100);
  }
}

// ─── Manejo de archivo ────────────────────────────────────────────────────────
async function handleFile(file) {
  if (!file) return;

  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    showErr(`El archivo supera el límite de ${MAX_FILE_SIZE_MB} MB. Usa un archivo más pequeño.`);
    return;
  }

  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'doc') {
    showErr('El formato .doc antiguo no está soportado. Guarda tu archivo como .docx e inténtalo de nuevo.');
    return;
  }
  if (!['pdf', 'docx', 'txt'].includes(ext)) {
    showErr('Formato no soportado. Usa PDF, DOCX o TXT.');
    return;
  }

  originalFilename = file.name;
  originalFileExt  = ext;
  fileLoadedDiv.style.display = 'flex';
  fileNameSpan.innerText = file.name;
  fileMetaSpan.innerText = 'Leyendo...';

  const icons = { pdf: '📕', docx: '📘', txt: '📄' };
  document.getElementById('file-icon').innerText = icons[ext] || '📎';

  try {
    if (ext === 'txt')       extractedText = await file.text();
    else if (ext === 'pdf')  extractedText = await extractPDF(file);
    else                     extractedText = await extractDOCX(file);

    const wc = countWords(extractedText);
    if (wc === 0) throw new Error('el archivo no contiene texto extraíble (¿PDF escaneado?)');

    fileMetaSpan.innerText =
      `${(file.size / 1024).toFixed(1)} KB · ${wc.toLocaleString('es')} palabras · ${ext.toUpperCase()}`;
    showErr('');
    showToast(`📄 "${file.name}" cargado correctamente.`);
  } catch (e) {
    showErr('Error al leer el archivo: ' + e.message);
    extractedText = '';
    fileLoadedDiv.style.display = 'none';
  }
}

async function extractPDF(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('no se cargó el lector de PDF. Recarga la página.');
  }
  const ab  = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  let text  = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    fileMetaSpan.innerText = `Extrayendo página ${i} de ${pdf.numPages}...`;
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(x => x.str).join(' ') + '\n';
  }
  return text;
}

async function extractDOCX(file) {
  if (typeof mammoth === 'undefined') {
    throw new Error('no se cargó el lector de DOCX. Recarga la página.');
  }
  const ab     = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: ab });
  return result.value;
}

function clearFile() {
  extractedText = '';
  fileLoadedDiv.style.display = 'none';
  fileInput.value = '';
  showErr('');
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
function countWords(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function updateIntensity(val) {
  const labels = ['Conservador', 'Medio', 'Agresivo'];
  const colors = ['#34d399', '#6ee7b7', '#fbbf24'];
  intensityVal.innerText = labels[val - 1];
  intensityVal.style.color = colors[val - 1];
}

function getPreserve() {
  return Array.from(document.querySelectorAll('#preserve-chips .toggle-chip.active'))
    .map(c => c.dataset.key);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return union.size === 0 ? 0 : Math.round((intersection.size / union.size) * 100);
}

// ─── Chunking corregido ───────────────────────────────────────────────────────
function isTitle(line) {
  const t = line.trim();
  if (!t) return false;
  return t.startsWith('#') ||
    (t === t.toUpperCase() && t.length < 60 && !t.endsWith('.'));
}

function splitIntoChunks(text, maxWords = 550, maxChars = 7000) {
  const lines  = text.split(/\r?\n/);
  const chunks = [];
  let current   = [];
  let wordCount = 0;
  let charCount = 0;

  const flush = () => {
    const joined = current.join('\n').trim();
    if (joined) chunks.push(joined);
    current = [];
    wordCount = 0;
    charCount = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const trimmed = line.trim();
    const words   = trimmed ? trimmed.split(/\s+/).length : 0;

    if (words > maxWords || line.length > maxChars) {
      flush();
      for (const piece of splitLongLine(line, maxWords, maxChars)) chunks.push(piece);
      continue;
    }

    const nextIsTitle = i + 1 < lines.length && isTitle(lines[i + 1]);
    const overBudget  =
      wordCount + words > maxWords ||
      charCount + line.length + 1 > maxChars;

    if (overBudget && current.length > 0) {
      flush();
    } else if (nextIsTitle && current.length > 0 && wordCount > 80) {
      flush();
    }

    current.push(line);
    wordCount += words;
    charCount += line.length + 1;
  }

  flush();
  return chunks;
}

function splitLongLine(line, maxWords, maxChars) {
  const sentences = line.match(/[^.!?…]+[.!?…]+\s*/g) || [line];
  const pieces = [];
  let cur = '';
  let wc  = 0;

  for (const sentence of sentences) {
    const sw = sentence.trim() ? sentence.trim().split(/\s+/).length : 0;
    if (wc + sw > maxWords && cur.trim()) {
      pieces.push(cur.trim());
      cur = '';
      wc  = 0;
    }
    cur += sentence;
    wc  += sw;
    while (cur.length > maxChars) {
      pieces.push(cur.slice(0, maxChars));
      cur = cur.slice(maxChars);
    }
  }
  if (cur.trim()) pieces.push(cur.trim());
  return pieces;
}

// ─── Fetch con timeout, reintentos y cancelación ─────────────────────────────
async function fetchWithTimeout(url, options, timeoutMs = 30000, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (cancelRequested) throw new DOMException('Cancelado', 'AbortError');

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (currentAbort) {
      if (currentAbort.signal.aborted) controller.abort();
      else currentAbort.signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (currentAbort) currentAbort.signal.removeEventListener('abort', onExternalAbort);
      return response;
    } catch (err) {
      clearTimeout(timer);
      if (currentAbort) currentAbort.signal.removeEventListener('abort', onExternalAbort);
      if (cancelRequested) throw new DOMException('Cancelado', 'AbortError');
      if (attempt === retries) throw err;
      logLine.innerText = `Reintentando... (${attempt + 1}/${retries})`;
      await sleep(1000 * (attempt + 1));
    }
  }
}

// ─── Cancelación ──────────────────────────────────────────────────────────────
function cancelParaphrase() {
  if (runBtn.disabled === false) return; // solo mientras procesa
  cancelRequested = true;
  if (currentAbort) currentAbort.abort();
  logLine.innerText = 'Cancelando...';
}

// ─── Proceso principal ────────────────────────────────────────────────────────
async function startParaphrase() {
  if (runBtn.disabled) return;
  showErr('');

  if (!modelsReady) {
    showErr('La lista de modelos aún no está lista. Espera un momento o recarga la página.');
    return;
  }

  let source = '';
  if (currentMode === 'file') {
    if (!extractedText) { showErr('Sube un archivo primero.'); return; }
    source = extractedText;
  } else {
    source = textInput.value.trim();
    if (!source) { showErr('Pega un texto primero.'); return; }
  }

  const tone      = toneSelect.value;
  const intensity = parseInt(intensitySlider.value, 10);
  const model     = modelSelect.value;
  const preserve  = getPreserve();

  if (!model) {
    showErr('No hay ningún modelo disponible.');
    return;
  }

  const chunks = splitIntoChunks(source);
  const total  = chunks.length;

  if (total > 20) {
    showErr(`El documento es muy largo (${total} segmentos). Considera dividirlo en partes más pequeñas.`);
    return;
  }

  runBtn.disabled   = true;
  cancelRequested   = false;
  currentAbort      = new AbortController();
  lastOriginalText  = source;

  progressSection.classList.add('visible');
  outputSection.classList.remove('visible');
  progressFill.style.width = '0%';
  chunkStatusDiv.innerHTML = chunks.map((_, i) =>
    `<div class="chunk-dot" id="dot-${i}" title="Segmento ${i + 1}"></div>`
  ).join('');

  const results    = [];
  let errorCount   = 0;
  let truncatedCount = 0;
  let firstError   = '';
  const startTime  = Date.now();

  for (let i = 0; i < chunks.length; i++) {
    if (cancelRequested) break;

    const dot = document.getElementById(`dot-${i}`);
    dot.classList.add('active');
    logLine.innerText        = `Procesando segmento ${i + 1} de ${total}...`;
    progressFill.style.width = `${(i / total) * 100}%`;
    progressLabel.innerText  = `Segmento ${i + 1} de ${total}`;

    try {
      const response = await fetchWithTimeout('/api/paraphrase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunks[i], tone, intensity, preserve, model })
      }, 55000, 1);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.paraphrased) throw new Error('Respuesta vacía del servidor');
      if (data.truncated) truncatedCount++;
      results.push(data.paraphrased);
      dot.classList.remove('active');
      dot.classList.add('done');
    } catch (err) {
      if (cancelRequested || err.name === 'AbortError') {
        dot.classList.remove('active');
        dot.classList.add('canceled');
        break;
      }
      errorCount++;
      if (!firstError) firstError = err.message || String(err);
      dot.classList.remove('active');
      dot.classList.add('error');
      results.push(chunks[i]);
      console.error(`Error segmento ${i + 1}:`, err);
    }

    if (i < chunks.length - 1 && !cancelRequested) await sleep(300);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  progressFill.style.width = '100%';
  logLine.innerText = '';

  // ── Cancelado sin resultados ───────────────────────────────────────────
  if (cancelRequested && results.length === 0) {
    progressSection.classList.remove('visible');
    runBtn.disabled = false;
    showToast('⏹ Parafraseo cancelado.', 'info');
    return;
  }

  // ── Todos fallaron → mostrar el error real ─────────────────────────────
  if (errorCount === total) {
    progressSection.classList.remove('visible');
    runBtn.disabled = false;
    showErr(`Todos los segmentos fallaron. Detalle: ${firstError}`);
    return;
  }

  // ── Renderizar resultado ───────────────────────────────────────────────
  const finalText = results.join('\n\n');
  outputTextarea.value   = finalText;
  originalTextarea.value = source;
  statOrig.innerText     = countWords(source).toLocaleString('es');
  statNew.innerText      = countWords(finalText).toLocaleString('es');
  statChunks.innerText   = `${results.length - errorCount}/${total}`;
  statSimilarity.innerText = calculateSimilarity(source, finalText) + '%';

  progressLabel.innerText = cancelRequested
    ? `⏹ Cancelado tras ${elapsed}s — resultado parcial`
    : errorCount > 0
      ? `⚠️ Completado con ${errorCount} error(es) en ${elapsed}s`
      : `✅ Parafraseado completado en ${elapsed}s`;

  outputSection.classList.add('visible');

  if (errorCount > 0) {
    showErr(`⚠️ ${errorCount} de ${total} segmento(s) fallaron (${firstError}). El texto original fue conservado en esas secciones.`);
  }
  if (truncatedCount > 0) {
    showToast(`⚠️ ${truncatedCount} segmento(s) se cortaron por longitud.`, 'info');
  }

  saveToHistory({
    date: new Date().toISOString(),
    tone, intensity, model,
    originalWords: countWords(source),
    newWords: countWords(finalText),
    similarity: calculateSimilarity(source, finalText),
    preview: finalText.substring(0, 120) + '...'
  });
  renderHistory();

  runBtn.disabled = false;
}

// ─── Modo comparación lado a lado ─────────────────────────────────────────────
function toggleCompare() {
  if (!lastOriginalText) {
    showToast('Primero genera un parafraseo para poder comparar.', 'info');
    return;
  }
  const active = outputCompare.classList.toggle('side-by-side');
  compareOriginalPane.hidden = !active;
  compareBtn.classList.toggle('active', active);
  compareBtn.setAttribute('aria-pressed', String(active));
  if (active) originalTextarea.value = lastOriginalText;
}

// ─── Historial local (ahora visible) ──────────────────────────────────────────
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('parafrase_history') || '[]');
  } catch {
    return [];
  }
}

function saveToHistory(entry) {
  try {
    const history = getHistory();
    history.unshift(entry);
    if (history.length > 10) history.pop();
    localStorage.setItem('parafrase_history', JSON.stringify(history));
  } catch (e) {
    console.warn('No se pudo guardar historial:', e);
  }
}

function loadHistory() {
  paraphraseHistory = getHistory();
}

function renderHistory() {
  const history = getHistory();
  historySection.hidden = history.length === 0;
  if (history.length === 0) return;

  historyList.innerHTML = history.map((h, idx) => {
    const date = new Date(h.date).toLocaleString('es', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });
    return `
      <div class="history-item" style="animation-delay:${idx * 0.05}s">
        <div class="history-item-head">
          <span>${date}</span>
          <span class="badge">${TONE_LABELS[h.tone] || h.tone}</span>
          <span class="badge">${MODEL_LABELS[h.model] || h.model}</span>
          <span class="badge">${h.originalWords}→${h.newWords} palabras</span>
          <span class="badge">Similitud ${h.similarity}%</span>
        </div>
        <p class="history-preview">${escapeHtml(h.preview || '')}</p>
      </div>`;
  }).join('');
}

function clearHistory() {
  localStorage.removeItem('parafrase_history');
  renderHistory();
  showToast('🗑 Historial borrado.', 'info');
}

// ─── Copiar al portapapeles ───────────────────────────────────────────────────
async function copyOutput() {
  const text = outputTextarea.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('📋 Copiado al portapapeles');
  } catch {
    outputTextarea.select();
    outputTextarea.setSelectionRange(0, 999999);
    document.execCommand('copy');
    showToast('📋 Copiado al portapapeles');
  }
}

// ─── Descarga DOCX ────────────────────────────────────────────────────────────
async function downloadAsDocx() {
  const text = outputTextarea.value;
  if (!text) { showErr('No hay texto para descargar.'); return; }
  if (!isDocxAvailable()) {
    showErr('❌ La librería DOCX no está cargada. Recarga la página.');
    return;
  }

  try {
    const { Document, Packer, Paragraph, TextRun, AlignmentType } = docx;
    const lines = text.split(/\r?\n/);
    const paragraphs = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const lineIsTitle = trimmed.length > 0 && trimmed.length < 80 &&
        (trimmed.startsWith('#') ||
         (trimmed === trimmed.toUpperCase() && trimmed.length < 50 && !trimmed.endsWith('.')));

      if (lineIsTitle) {
        const cleanTitle = trimmed.replace(/^#+\s*/, '');
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: cleanTitle, bold: true, size: 28, font: 'Arial', color: '1a1a1a' })],
          spacing: { before: 280, after: 140 },
          alignment: AlignmentType.LEFT
        }));
      } else if (trimmed.length === 0) {
        paragraphs.push(new Paragraph({ text: '' }));
      } else {
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: line, size: 24, font: 'Calibri', color: '333333' })],
          spacing: { after: 120, line: 276 },
          alignment: AlignmentType.JUSTIFIED
        }));
      }
    }

    const docxDoc = new Document({
      sections: [{
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: paragraphs
      }]
    });

    const blob = await Packer.toBlob(docxDoc);
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href  = url;
    link.download = `parafraseado_${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('📥 Documento DOCX descargado');
  } catch (error) {
    console.error('Error en downloadAsDocx:', error);
    showErr('Error al generar DOCX: ' + error.message);
  }
}

// ─── Descarga TXT ─────────────────────────────────────────────────────────────
function downloadAsTxt() {
  const text = outputTextarea.value;
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `parafraseado_${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📄 Archivo TXT descargado');
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function resetAll() {
  clearFile();
  textInput.value = '';
  textInput.style.height = '';
  updateTextCounter();
  outputSection.classList.remove('visible');
  progressSection.classList.remove('visible');
  progressFill.style.width = '0%';
  extractedText = '';
  lastOriginalText = '';
  cancelRequested = false;
  showErr('');
  logLine.innerText = '';
  outputCompare.classList.remove('side-by-side');
  compareOriginalPane.hidden = true;
  compareBtn.classList.remove('active');
  compareBtn.setAttribute('aria-pressed', 'false');
}

// ─── Arrancar ─────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}