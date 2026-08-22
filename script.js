// ═══════════════════════════════════════════════════════════════════════════════
//  ParafraseAI · Frontend Profesional — FASE 4
//  by Jaime Wong Franco
//
//  Fase 4 añade: protección de citas (A1), re-parafrasear selección (A2),
//  auto-humanizar (A3), contador de cuota (B1) y legibilidad Fernández-Huerta (B3).
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
const estTimeEl        = document.getElementById('est-time');
const outputSection    = document.getElementById('output-section');
const outputTextarea   = document.getElementById('output-textarea');
const originalTextarea = document.getElementById('original-textarea');
const outputCompare    = document.getElementById('output-compare');
const compareOriginalPane = document.getElementById('compare-original-pane');
const compareBtn       = document.getElementById('compare-btn');
const reparaBtn        = document.getElementById('repara-btn');
const statOrig         = document.getElementById('stat-orig');
const statNew          = document.getElementById('stat-new');
const statChunks       = document.getElementById('stat-chunks');
const statSimilarity   = document.getElementById('stat-similarity');
const statNaturalness  = document.getElementById('stat-naturalness');
const statReadtime     = document.getElementById('stat-readtime');
const statReadability  = document.getElementById('stat-readability');
const readabilityLabelEl = document.getElementById('readability-label');
const similarityAlert  = document.getElementById('similarity-alert');
const similarityAlertVal = document.getElementById('similarity-alert-val');
const versionsBar      = document.getElementById('versions-bar');
const versionsPills    = document.getElementById('versions-pills');
const genVersionBtn    = document.getElementById('gen-version-btn');
const quotaLine        = document.getElementById('quota-line');
const quotaText        = document.getElementById('quota-text');
const errMsg           = document.getElementById('err-msg');
const progressFill     = document.getElementById('progress-fill');
const progressLabel    = document.getElementById('progress-label');
const chunkStatusDiv   = document.getElementById('chunk-status');
const logLine          = document.getElementById('log-line');
const copyBtn          = document.getElementById('copy-btn');
const downloadDocxBtn  = document.getElementById('download-docx-btn');
const downloadPdfBtn   = document.getElementById('download-pdf-btn');
const downloadTxtBtn   = document.getElementById('download-txt-btn');
const resetBtn         = document.getElementById('reset-btn');
const intensitySlider  = document.getElementById('intensity');
const intensityVal     = document.getElementById('intensity-val');
const modelSelect      = document.getElementById('model-select');
const toneSelect       = document.getElementById('tone');
const audienceSelect   = document.getElementById('audience-select');
const lengthSelect     = document.getElementById('length-select');
const formSelect       = document.getElementById('form-select');
const chipHumanize     = document.getElementById('chip-humanize');
const chipAutoHumanize = document.getElementById('chip-autohumanize');
const historySection   = document.getElementById('history-section');
const historyList      = document.getElementById('history-list');
const clearHistoryBtn  = document.getElementById('clear-history-btn');
const toastContainer   = document.getElementById('toast-container');

// ─── Variables globales ───────────────────────────────────────────────────────
let extractedText     = '';
let currentMode       = 'file';
let lastOriginalText  = '';
let modelsReady       = false;
let currentAbort      = null;
let cancelRequested   = false;
let processing        = false;
let versions          = [];
let currentVersionIdx = -1;

const MAX_FILE_SIZE_MB = 5;
const MAX_CHUNKS       = 40;
const CONCURRENCY      = 2;
const NATURALNESS_THRESHOLD = 70; // disparo del auto-humanizar

const MODEL_SECONDS = {
  'openai/gpt-oss-120b': 20,
  'openai/gpt-oss-20b': 6,
  'qwen/qwen3.6-27b': 10
};

const PREFERRED_MODELS = [
  { id: 'openai/gpt-oss-120b',     label: '🚀 GPT-OSS 120B (mejor calidad)' },
  { id: 'qwen/qwen3.6-27b',        label: '⚖️ Qwen 3.6 27B (equilibrado)' },
  { id: 'openai/gpt-oss-20b',      label: '⚡ GPT-OSS 20B (rápido, ideal documentos largos)' },
  { id: 'llama-3.3-70b-versatile', label: '🧠 Llama 3.3 70B (si se habilita)' },
  { id: 'llama-3.1-8b-instant',    label: '🦙 Llama 3.1 8B (si se habilita)' },
  { id: 'gemma2-9b-it',            label: '💎 Gemma 2 9B (si se habilita)' }
];

const EXCLUDE_PATTERN = /whisper|tts|playai|image|embed|audio|speech|distil|orpheus|guard|compound|safeguard|allam/i;

const TONE_LABELS = {
  natural: '🌿 Natural', academico: '🎓 Académico',
  formal: '💼 Formal', conversacional: '💬 Conversacional'
};

const MODEL_LABELS = {
  'openai/gpt-oss-120b': 'GPT-OSS 120B',
  'openai/gpt-oss-20b': 'GPT-OSS 20B',
  'qwen/qwen3.6-27b': 'Qwen 3.6 27B'
};

const AI_PHRASES = [
  'en conclusión', 'cabe destacar', 'cabe señalar', 'es importante mencionar',
  'es importante destacar', 'en la actualidad', 'sin duda', 'en este sentido',
  'juega un papel crucial', 'es fundamental', 'hoy en día', 'en el mundo actual',
  'resulta evidente', 'es menester', 'en resumen', 'asimismo', 'del mismo modo',
  'de igual manera', 'por otro lado', 'en primer lugar', 'en segundo lugar',
  'finalmente', 'no cabe duda', 'vale la pena', 'en pocas palabras'
];

const SAMPLE_TEXT = `LA IMPORTANCIA DE LA LECTURA EN LA ERA DIGITAL

La lectura sigue siendo una de las herramientas más poderosas para el desarrollo del pensamiento crítico. Según un estudio publicado en 2023 (García & López, 2023), los jóvenes que leen al menos 30 minutos al día muestran una comprensión lectora un 45 % superior a la media.

Como señala el autor: "la lectura profunda es la base del pensamiento crítico" (p. 42). Sin embargo, las pantallas han transformado nuestros hábitos. Hoy dedicamos un promedio de 7 horas diarias a dispositivos electrónicos, y la lectura profunda está en claro declive.

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
  reparaBtn.addEventListener('click', reparaSelection);
  genVersionBtn.addEventListener('click', generateAnotherVersion);
  downloadDocxBtn.addEventListener('click', downloadAsDocx);
  downloadPdfBtn.addEventListener('click', downloadAsPdf);
  downloadTxtBtn.addEventListener('click', downloadAsTxt);
  resetBtn.addEventListener('click', resetAll);
  sampleBtn.addEventListener('click', loadSampleText);
  clearHistoryBtn.addEventListener('click', clearHistory);
  intensitySlider.addEventListener('input', (e) => updateIntensity(e.target.value));

  chipHumanize.addEventListener('click', () => toggleSwitch(chipHumanize));
  chipAutoHumanize.addEventListener('click', () => toggleSwitch(chipAutoHumanize));

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
    if (files.length > 1) { showErr('Solo se permite subir un archivo a la vez.'); return; }
    if (files[0]) handleFile(files[0]);
  });

  versionsPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.version-pill');
    if (!pill) return;
    selectVersion(parseInt(pill.dataset.idx, 10));
  });

  historyList.addEventListener('click', (e) => {
    const item = e.target.closest('.history-item');
    if (!item) return;
    loadHistoryItem(parseInt(item.dataset.idx, 10));
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !runBtn.disabled) {
      e.preventDefault();
      startParaphrase();
    }
    if (e.key === 'Escape' && processing) cancelParaphrase();
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && document.activeElement === outputTextarea) {
      if (outputTextarea.selectionStart === outputTextarea.selectionEnd) {
        e.preventDefault();
        copyOutput();
      }
    }
  });

  updateIntensity(intensitySlider.value);
  renderHistory();
  loadAvailableModels();
}

function toggleSwitch(el) {
  el.classList.toggle('active');
  el.setAttribute('aria-checked', String(el.classList.contains('active')));
}

function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Toasts y errores ─────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 350);
  }, 3200);
}

let errTimer = null;
function showErr(msg) {
  errMsg.innerText = msg;
  errMsg.classList.toggle('visible', !!msg);
  if (errTimer) clearTimeout(errTimer);
}

// ─── Detección automática de modelos ──────────────────────────────────────────
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
      showErr('⚠️ Tu clave de Groq no tiene acceso a modelos de chat.');
      return;
    }

    modelSelect.innerHTML = options.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
    modelsReady = true;
    runBtn.disabled = false;
    showErr('');
  } catch (e) {
    modelSelect.innerHTML = '<option value="">❌ Sin conexión</option>';
    showErr('⚠️ No se pudo conectar con la API. Recarga la página.');
  }
}

// ─── Utilidades de texto ──────────────────────────────────────────────────────
function autoGrow() {
  textInput.style.height = 'auto';
  textInput.style.height = Math.min(textInput.scrollHeight, 600) + 'px';
}

function updateTextCounter() {
  const text = textInput.value;
  textCounter.innerText =
    `${countWords(text).toLocaleString('es')} palabras · ${text.length.toLocaleString('es')} caracteres`;
}

function loadSampleText() {
  switchMode('text');
  textInput.value = SAMPLE_TEXT;
  autoGrow();
  updateTextCounter();
  showToast('✨ Texto de ejemplo cargado (incluye una cita APA y una comilla para probar la protección).', 'info');
}

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

function formatDuration(sec) {
  if (sec < 60) return `~${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `~${m} min ${s} s` : `~${m} min`;
}

// ─── A1: Protección de citas y referencias ────────────────────────────────────
// Reemplaza citas APA y texto entre comillas por marcadores ⟦Qn⟧ antes de
// enviar a la IA, y los restaura después. Garantiza que queden intactas.
function protectQuotations(text) {
  const items = [];
  let result = text;

  // Referencias APA: (Apellido, 2020), (Apellido et al., 2020, p. 5)
  result = result.replace(/\([^()\n]{1,80}?,\s*(19|20)\d{2}[a-z]?(?:,\s*(?:p|pp|cap|sec)\.?\s*[\d–\-]+)?\)/g, (m) => {
    items.push(m);
    return `⟦Q${items.length}⟧`;
  });

  // Comillas rectas, curvas y latinas
  result = result.replace(/"[^"\n]{2,600}"/g, (m) => { items.push(m); return `⟦Q${items.length}⟧`; });
  result = result.replace(/“[^”\n]{2,600}”/g, (m) => { items.push(m); return `⟦Q${items.length}⟧`; });
  result = result.replace(/«[^»\n]{2,600}»/g, (m) => { items.push(m); return `⟦Q${items.length}⟧`; });

  return { protectedText: result, items };
}

function restoreQuotations(text, items) {
  let restored = text;
  // Restaurar de mayor a menor índice (maneja citas anidadas dentro de comillas)
  for (let i = items.length - 1; i >= 0; i--) {
    const pattern = new RegExp(`⟦\\s*Q\\s*${i + 1}\\s*⟧`, 'g');
    restored = restored.replace(pattern, () => items[i]);
  }
  return restored;
}

// ─── Similitud léxica (Jaccard) ───────────────────────────────────────────────
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return union.size === 0 ? 0 : Math.round((intersection.size / union.size) * 100);
}

// ─── Puntuación de naturalidad ────────────────────────────────────────────────
function calculateNaturalness(text) {
  const lower = text.toLowerCase();
  let bannedHits = 0;
  AI_PHRASES.forEach(p => {
    let idx = 0;
    while ((idx = lower.indexOf(p, idx)) !== -1) { bannedHits++; idx += p.length; }
  });

  const sentences = text.split(/[.!?…]+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length < 2) return 60;

  const lens = sentences.map(s => s.split(/\s+/).length);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  if (mean === 0) return 60;
  const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length;
  const cv = Math.sqrt(variance) / mean;

  const starters = sentences.map(s => (s.split(/\s+/)[0] || '').toLowerCase());
  const freq = {};
  starters.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  const maxRepeat = Math.max(...Object.values(freq));
  const repeatRatio = maxRepeat / sentences.length;

  let score = 55;
  score += Math.min(25, cv * 55);
  score -= Math.min(35, bannedHits * 7);
  score -= Math.max(0, (repeatRatio - 0.25) * 40);
  return Math.max(8, Math.min(97, Math.round(score)));
}

// ─── B3: Legibilidad Fernández-Huerta (español) ──────────────────────────────
function countSyllables(word) {
  const groups = word.toLowerCase().match(/[aeiouáéíóúü]+/g);
  return groups ? groups.length : 1;
}

function fernandezHuerta(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 10) return null;
  const sentences = text.split(/[.!?…]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return null;

  let totalSyllables = 0;
  words.forEach(w => { totalSyllables += countSyllables(w); });

  const syllPerWord = totalSyllables / words.length;
  const wordsPerSentence = words.length / sentences.length;
  const score = 206.84 - 60 * syllPerWord - 1.02 * wordsPerSentence;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function readabilityLabel(score) {
  if (score >= 90) return 'Muy fácil';
  if (score >= 80) return 'Fácil';
  if (score >= 70) return 'Bastante fácil';
  if (score >= 60) return 'Estándar';
  if (score >= 50) return 'Algo difícil';
  if (score >= 30) return 'Difícil';
  return 'Muy difícil';
}

// ─── Manejo de archivos ───────────────────────────────────────────────────────
async function handleFile(file) {
  if (!file) return;

  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    showErr(`El archivo supera el límite de ${MAX_FILE_SIZE_MB} MB.`);
    return;
  }

  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'doc') {
    showErr('El formato .doc antiguo no está soportado. Guarda tu archivo como .docx.');
    return;
  }
  if (!['pdf', 'docx', 'txt'].includes(ext)) {
    showErr('Formato no soportado. Usa PDF, DOCX o TXT.');
    return;
  }

  fileLoadedDiv.style.display = 'flex';
  fileNameSpan.innerText = file.name;
  fileMetaSpan.innerText = 'Leyendo...';
  const icons = { pdf: '📕', docx: '📘', txt: '📄' };
  document.getElementById('file-icon').innerText = icons[ext] || '📎';

  try {
    if (ext === 'txt')      extractedText = await file.text();
    else if (ext === 'pdf') extractedText = await extractPDF(file);
    else                    extractedText = await extractDOCX(file);

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
  if (typeof pdfjsLib === 'undefined') throw new Error('no se cargó el lector de PDF. Recarga la página.');
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
  if (typeof mammoth === 'undefined') throw new Error('no se cargó el lector de DOCX. Recarga la página.');
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

// ─── Chunking ─────────────────────────────────────────────────────────────────
function isTitle(line) {
  const t = line.trim();
  if (!t) return false;
  return t.startsWith('#') ||
    (t === t.toUpperCase() && t.length < 60 && !t.endsWith('.'));
}

function splitIntoChunks(text, maxWords = 550, maxChars = 7000) {
  const lines  = text.split(/\r?\n/);
  const chunks = [];
  let current = [], wordCount = 0, charCount = 0;

  const flush = () => {
    const joined = current.join('\n').trim();
    if (joined) chunks.push(joined);
    current = []; wordCount = 0; charCount = 0;
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
    const overBudget  = wordCount + words > maxWords || charCount + line.length + 1 > maxChars;

    if (overBudget && current.length > 0) flush();
    else if (nextIsTitle && current.length > 0 && wordCount > 80) flush();

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
  let cur = '', wc = 0;
  for (const sentence of sentences) {
    const sw = sentence.trim() ? sentence.trim().split(/\s+/).length : 0;
    if (wc + sw > maxWords && cur.trim()) { pieces.push(cur.trim()); cur = ''; wc = 0; }
    cur += sentence; wc += sw;
    while (cur.length > maxChars) { pieces.push(cur.slice(0, maxChars)); cur = cur.slice(maxChars); }
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

function cancelParaphrase() {
  if (!processing) return;
  cancelRequested = true;
  if (currentAbort) currentAbort.abort();
  logLine.innerText = 'Cancelando...';
}

// ─── B1: Contador de cuota ────────────────────────────────────────────────────
function updateQuotaDisplay(remaining) {
  quotaLine.hidden = false;
  const icon = remaining > 100 ? '🟢' : remaining > 20 ? '🟡' : '🔴';
  quotaText.innerText = `${icon} Te quedan ~${remaining} peticiones en tu cuota de Groq`;
}

// ─── Inicio del parafraseado ──────────────────────────────────────────────────
async function startParaphrase() {
  if (processing || !modelsReady) return;
  showErr('');

  let source = '';
  if (currentMode === 'file') {
    if (!extractedText) { showErr('Sube un archivo primero.'); return; }
    source = extractedText;
  } else {
    source = textInput.value.trim();
    if (!source) { showErr('Pega un texto primero.'); return; }
  }

  await runPipeline(source);
}

async function generateAnotherVersion() {
  if (processing) return;
  if (!lastOriginalText) { showToast('Primero genera un parafraseo.', 'info'); return; }
  showErr('');
  await runPipeline(lastOriginalText);
}

// ─── Pipeline principal ───────────────────────────────────────────────────────
async function runPipeline(source, options = {}) {
  const tone      = toneSelect.value;
  const intensity = parseInt(intensitySlider.value, 10);
  const model     = modelSelect.value;
  const preserve  = getPreserve();
  const humanize  = chipHumanize.classList.contains('active');
  const audience  = audienceSelect.value;
  const length    = lengthSelect.value;
  const form      = formSelect.value;
  const quotesOn  = preserve.includes('quotes');

  if (!model) { showErr('No hay ningún modelo disponible.'); return; }

  const chunks = splitIntoChunks(source);
  const total  = chunks.length;

  if (total > MAX_CHUNKS) {
    showErr(`El documento es muy largo (${total} segmentos, máximo ${MAX_CHUNKS}). Divídelo en 2 o más partes.`);
    return;
  }

  processing      = true;
  cancelRequested = false;
  currentAbort    = new AbortController();
  lastOriginalText = source;

  runBtn.disabled = true;
  genVersionBtn.disabled = true;
  reparaBtn.disabled = true;
  progressSection.classList.add('visible');
  outputSection.classList.remove('visible');
  progressFill.style.width = '0%';
  chunkStatusDiv.innerHTML = chunks.map((_, i) =>
    `<div class="chunk-dot" id="dot-${i}" title="Segmento ${i + 1}"></div>`
  ).join('');

  const perSeg = MODEL_SECONDS[model] || 10;
  const estSeconds = Math.ceil((total / CONCURRENCY) * perSeg);
  estTimeEl.innerText = `🕐 Tiempo estimado: ${formatDuration(estSeconds)} · ${total} segmento(s) · ${CONCURRENCY} en paralelo`;

  if (total > 15 && model === 'openai/gpt-oss-120b') {
    showToast('💡 Documento largo: con GPT-OSS 20B irás más rápido y gastarás menos cuota diaria.', 'info');
  }

  const opts = { tone, intensity, preserve, model, humanize, audience, length, form };
  if (options.autoBoost) opts.boostHumanize = true;

  const results = new Array(chunks.length);
  let errorCount = 0, truncatedCount = 0, completed = 0;
  let firstError = '';
  let nextIndex  = 0;
  const startTime = Date.now();

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= chunks.length || cancelRequested) return;

      const dot = document.getElementById(`dot-${i}`);
      if (dot) dot.classList.add('active');

      try {
        // A1: proteger citas antes de enviar (si está activado)
        const { protectedText, items } = quotesOn
          ? protectQuotations(chunks[i])
          : { protectedText: chunks[i], items: [] };

        const response = await fetchWithTimeout('/api/paraphrase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: protectedText, ...opts })
        }, 55000, 1);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Error HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data.paraphrased) throw new Error('Respuesta vacía del servidor');
        if (data.truncated) truncatedCount++;

        // B1: actualizar cuota si viene en la respuesta
        if (data.quota && typeof data.quota.remainingRequests === 'number') {
          updateQuotaDisplay(data.quota.remainingRequests);
        }

        // A1: restaurar las citas protegidas
        results[i] = items.length
          ? restoreQuotations(data.paraphrased, items)
          : data.paraphrased;

        if (dot) { dot.classList.remove('active'); dot.classList.add('done'); }
      } catch (err) {
        if (cancelRequested || err.name === 'AbortError') {
          if (dot) { dot.classList.remove('active'); dot.classList.add('canceled'); }
          return;
        }
        errorCount++;
        if (!firstError) firstError = err.message || String(err);
        results[i] = chunks[i];
        if (dot) { dot.classList.remove('active'); dot.classList.add('error'); }
        console.error(`Error segmento ${i + 1}:`, err);
      }

      completed++;
      progressFill.style.width = `${(completed / total) * 100}%`;
      progressLabel.innerText  = `${completed} de ${total} segmentos`;
      logLine.innerText        = `Procesando ${CONCURRENCY} segmentos en paralelo...`;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker())
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  progressFill.style.width = '100%';
  logLine.innerText = '';

  if (cancelRequested && completed === 0) {
    progressSection.classList.remove('visible');
    finishUI();
    showToast('⏹ Parafraseo cancelado.', 'info');
    return;
  }

  if (errorCount === total) {
    progressSection.classList.remove('visible');
    finishUI();
    showErr(`Todos los segmentos fallaron. Detalle: ${firstError}`);
    return;
  }

  const finalText = results.join('\n\n');
  outputTextarea.value   = finalText;
  originalTextarea.value = source;

  statOrig.innerText   = countWords(source).toLocaleString('es');
  statChunks.innerText = `${total - errorCount}/${total}`;

  progressLabel.innerText = cancelRequested
    ? `⏹ Cancelado tras ${elapsed}s — resultado parcial`
    : errorCount > 0
      ? `⚠️ Completado con ${errorCount} error(es) en ${elapsed}s`
      : `✅ Parafraseado completado en ${elapsed}s`;

  outputSection.classList.add('visible');
  addVersion(finalText, source, model);

  if (errorCount > 0) {
    showErr(`⚠️ ${errorCount} de ${total} segmento(s) fallaron (${firstError}). El texto original fue conservado en esas secciones.`);
  }
  if (truncatedCount > 0) {
    showToast(`⚠️ ${truncatedCount} segmento(s) se cortaron por longitud.`, 'info');
  }

  saveToHistory({
    date: new Date().toISOString(),
    tone, model,
    originalWords: countWords(source),
    newWords: countWords(finalText),
    similarity: versions[0].similarity,
    naturalness: versions[0].naturalness,
    original: source.slice(0, 60000),
    text: finalText.slice(0, 60000),
    preview: finalText.substring(0, 120) + '...'
  });
  renderHistory();

  // ── A3: Auto-humanizar ─────────────────────────────────────────────────
  const nat = versions[0].naturalness;
  const shouldAutoBoost =
    !options.autoBoost &&
    chipHumanize.classList.contains('active') &&
    chipAutoHumanize.classList.contains('active') &&
    nat < NATURALNESS_THRESHOLD;

  if (shouldAutoBoost) {
    showToast(`🎯 Naturalidad ${nat}% (baja). Generando automáticamente una versión más humana...`, 'info');
    await sleep(700);
    await runPipeline(source, { autoBoost: true });
    return;
  }

  finishUI();
}

function finishUI() {
  processing = false;
  runBtn.disabled = false;
  genVersionBtn.disabled = false;
  reparaBtn.disabled = false;
}

// ─── Versiones ────────────────────────────────────────────────────────────────
function addVersion(text, source, model) {
  const version = computeStats(text, source, model);
  versions.unshift(version);
  if (versions.length > 3) versions.pop();
  currentVersionIdx = 0;

  outputTextarea.value = version.text;
  applyVersionStats(version);
  renderVersions();
}

function computeStats(text, source, model) {
  const words = countWords(text);
  const readability = fernandezHuerta(text);
  return {
    text,
    words,
    similarity: calculateSimilarity(source, text),
    naturalness: calculateNaturalness(text),
    readability,
    readtime: Math.max(1, Math.ceil(words / 200)),
    model
  };
}

function applyVersionStats(v) {
  statNew.innerText          = v.words.toLocaleString('es');
  statSimilarity.innerText   = v.similarity + '%';
  statNaturalness.innerText  = v.naturalness + '%';
  statReadtime.innerText     = v.readtime + ' min';

  if (v.readability !== null) {
    statReadability.innerText = v.readability;
    readabilityLabelEl.innerText = readabilityLabel(v.readability);
    colorStat(statReadability, v.readability >= 60 ? 'good' : v.readability >= 40 ? 'warn' : 'bad');
  } else {
    statReadability.innerText = '—';
    readabilityLabelEl.innerText = 'Legibilidad';
    statReadability.classList.remove('stat-good', 'stat-warn', 'stat-bad');
  }

  colorStat(statNaturalness, v.naturalness >= 70 ? 'good' : v.naturalness >= 45 ? 'warn' : 'bad');
  colorStat(statSimilarity, v.similarity <= 60 ? 'good' : v.similarity <= 85 ? 'warn' : 'bad');

  if (v.similarity > 85) {
    similarityAlertVal.innerText = v.similarity;
    similarityAlert.hidden = false;
  } else {
    similarityAlert.hidden = true;
  }
}

function colorStat(el, level) {
  el.classList.remove('stat-good', 'stat-warn', 'stat-bad');
  el.classList.add('stat-' + level);
}

function renderVersions() {
  versionsBar.hidden = versions.length === 0;
  versionsPills.innerHTML = versions.map((v, i) => `
    <button class="version-pill ${i === currentVersionIdx ? 'active' : ''}"
            data-idx="${i}" type="button"
            title="${MODEL_LABELS[v.model] || v.model} · ${v.words} palabras · Naturalidad ${v.naturalness}%">
      V${i + 1}${i === 0 ? ' ✨' : ''}
    </button>`).join('');
}

function selectVersion(idx) {
  if (idx < 0 || idx >= versions.length) return;
  currentVersionIdx = idx;
  outputTextarea.value = versions[idx].text;
  applyVersionStats(versions[idx]);
  renderVersions();
  showToast(`Versión V${idx + 1} cargada.`, 'info');
}

// ─── A2: Re-parafrasear selección ─────────────────────────────────────────────
function getSelectedParagraph() {
  const text = outputTextarea.value;
  let start = outputTextarea.selectionStart;
  let end   = outputTextarea.selectionEnd;
  if (start === end) return null;

  // Expandir hasta los límites del párrafo
  while (start > 0 && text[start - 1] !== '\n') start--;
  while (end < text.length && text[end] !== '\n') end++;

  return { start, end, paragraph: text.slice(start, end).trim() };
}

async function reparaSelection() {
  if (processing) return;

  const sel = getSelectedParagraph();
  if (!sel) {
    showToast('✂️ Selecciona primero el párrafo que quieres re-parafrasear.', 'info');
    return;
  }
  if (sel.paragraph.length < 15) {
    showToast('Selecciona un párrafo más largo.', 'info');
    return;
  }

  const model = modelSelect.value;
  if (!model) { showErr('No hay modelo disponible.'); return; }

  processing = true;
  reparaBtn.disabled = true;
  showToast('✂️ Re-parafraseando el párrafo seleccionado...', 'info');

  currentAbort = new AbortController();
  cancelRequested = false;

  try {
    const opts = {
      tone: toneSelect.value,
      intensity: parseInt(intensitySlider.value, 10),
      preserve: getPreserve(),
      model,
      humanize: chipHumanize.classList.contains('active'),
      audience: audienceSelect.value,
      length: 'igual',
      form: formSelect.value
    };

    const { protectedText, items } = opts.preserve.includes('quotes')
      ? protectQuotations(sel.paragraph)
      : { protectedText: sel.paragraph, items: [] };

    const response = await fetchWithTimeout('/api/paraphrase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: protectedText, ...opts })
    }, 55000, 1);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.paraphrased) throw new Error('Respuesta vacía del servidor');

    if (data.quota && typeof data.quota.remainingRequests === 'number') {
      updateQuotaDisplay(data.quota.remainingRequests);
    }

    const replaced = items.length ? restoreQuotations(data.paraphrased, items) : data.paraphrased;

    // Reemplazar el párrafo en el texto completo
    const fullText = outputTextarea.value;
    const newText = fullText.slice(0, sel.start) + replaced + fullText.slice(sel.end);
    outputTextarea.value = newText;

    // Actualizar estadísticas de la versión actual
    if (versions[currentVersionIdx]) {
      const updated = computeStats(newText, lastOriginalText, model);
      updated.text = newText;
      versions[currentVersionIdx] = updated;
      applyVersionStats(updated);
    }

    showToast('✂️ Párrafo re-parafraseado correctamente.');
  } catch (err) {
    if (err.name !== 'AbortError') {
      showErr('Error al re-parafrasear: ' + (err.message || err));
    }
  } finally {
    processing = false;
    reparaBtn.disabled = false;
  }
}

// ─── Comparación lado a lado ──────────────────────────────────────────────────
function toggleCompare() {
  if (!lastOriginalText) {
    showToast('Primero genera un parafraseo para comparar.', 'info');
    return;
  }
  const active = outputCompare.classList.toggle('side-by-side');
  compareOriginalPane.hidden = !active;
  compareBtn.classList.toggle('active', active);
  compareBtn.setAttribute('aria-pressed', String(active));
  if (active) originalTextarea.value = lastOriginalText;
}

// ─── Historial ────────────────────────────────────────────────────────────────
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('parafrase_history') || '[]');
  } catch { return []; }
}

function saveToHistory(entry) {
  try {
    const history = getHistory();
    history.unshift(entry);
    if (history.length > 10) history.pop();
    localStorage.setItem('parafrase_history', JSON.stringify(history));
  } catch (e) {
    try {
      const history = getHistory().slice(0, 3);
      history.unshift(entry);
      localStorage.setItem('parafrase_history', JSON.stringify(history));
    } catch { console.warn('No se pudo guardar historial:', e); }
  }
}

function renderHistory() {
  const history = getHistory();
  historySection.hidden = history.length === 0;
  if (history.length === 0) return;

  historyList.innerHTML = history.map((h, idx) => {
    const date = new Date(h.date).toLocaleString('es', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    return `
      <div class="history-item" data-idx="${idx}" style="animation-delay:${idx * 0.04}s"
           title="Clic para recuperar este parafraseo" role="button" tabindex="0">
        <div class="history-item-head">
          <span>${date}</span>
          <span class="badge">${TONE_LABELS[h.tone] || h.tone}</span>
          <span class="badge">${MODEL_LABELS[h.model] || h.model}</span>
          <span class="badge">${h.originalWords}→${h.newWords} palabras</span>
          <span class="badge">Similitud ${h.similarity}%</span>
          ${h.naturalness ? `<span class="badge">Naturalidad ${h.naturalness}%</span>` : ''}
        </div>
        <p class="history-preview">${escapeHtml(h.preview || '')}</p>
      </div>`;
  }).join('');
}

function loadHistoryItem(idx) {
  const history = getHistory();
  const h = history[idx];
  if (!h || !h.text) { showToast('Esa entrada no tiene texto guardado.', 'error'); return; }

  lastOriginalText = h.original || '';
  originalTextarea.value = lastOriginalText;
  outputTextarea.value = h.text;
  outputSection.classList.add('visible');

  statOrig.innerText       = (h.originalWords || 0).toLocaleString('es');
  statNew.innerText        = (h.newWords || 0).toLocaleString('es');
  statChunks.innerText     = '—';
  statSimilarity.innerText = (h.similarity ?? 0) + '%';
  statNaturalness.innerText = (h.naturalness ?? 0) + '%';
  statReadtime.innerText   = Math.max(1, Math.ceil((h.newWords || 0) / 200)) + ' min';
  statReadability.innerText = '—';
  readabilityLabelEl.innerText = 'Legibilidad';
  similarityAlert.hidden   = (h.similarity ?? 0) <= 85;
  if (!similarityAlert.hidden) similarityAlertVal.innerText = h.similarity;

  showToast('🕘 Parafraseo del historial recuperado.');
  window.scrollTo({ top: outputSection.offsetTop - 20, behavior: 'smooth' });
}

function clearHistory() {
  localStorage.removeItem('parafrase_history');
  renderHistory();
  showToast('🗑 Historial borrado.', 'info');
}

// ─── Copiar ───────────────────────────────────────────────────────────────────
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

// ─── Exportar DOCX ────────────────────────────────────────────────────────────
async function downloadAsDocx() {
  const text = outputTextarea.value;
  if (!text) { showErr('No hay texto para descargar.'); return; }
  if (!isDocxAvailable()) { showErr('❌ La librería DOCX no está cargada. Recarga la página.'); return; }

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
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: trimmed.replace(/^#+\s*/, ''), bold: true, size: 28, font: 'Arial', color: '1a1a1a' })],
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
    triggerDownload(blob, `parafraseado_${new Date().toISOString().slice(0, 10)}.docx`);
    showToast('📥 Documento DOCX descargado');
  } catch (error) {
    console.error('Error en downloadAsDocx:', error);
    showErr('Error al generar DOCX: ' + error.message);
  }
}

// ─── Exportar PDF ─────────────────────────────────────────────────────────────
function downloadAsPdf() {
  const text = outputTextarea.value;
  if (!text) { showErr('No hay texto para exportar.'); return; }

  const lines = text.split(/\r?\n/);
  const bodyHtml = lines.map(line => {
    const t = line.trim();
    if (!t) return '';
    const lineIsTitle = t.startsWith('#') ||
      (t === t.toUpperCase() && t.length < 50 && !t.endsWith('.'));
    if (lineIsTitle) return `<h2>${escapeHtml(t.replace(/^#+\s*/, ''))}</h2>`;
    return `<p>${escapeHtml(line)}</p>`;
  }).join('');

  const win = window.open('', '_blank');
  if (!win) {
    showErr('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para exportar PDF.');
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Documento parafraseado</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 720px; margin: 48px auto;
           padding: 0 24px; line-height: 1.9; font-size: 15px; color: #1a1a1a; }
    h2 { font-family: Arial, sans-serif; font-size: 17px; margin: 28px 0 12px; }
    p { margin: 0 0 14px; text-align: justify; }
    @media print { body { margin: 0; max-width: none; } }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
  showToast('📑 Abriendo vista de impresión → elige «Guardar como PDF».', 'info');
}

// ─── Exportar TXT ─────────────────────────────────────────────────────────────
function downloadAsTxt() {
  const text = outputTextarea.value;
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, `parafraseado_${new Date().toISOString().slice(0, 10)}.txt`);
  showToast('📄 Archivo TXT descargado');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  versions = [];
  currentVersionIdx = -1;
  versionsBar.hidden = true;
  versionsPills.innerHTML = '';
  similarityAlert.hidden = true;
  showErr('');
  logLine.innerText = '';
  estTimeEl.innerText = '';
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