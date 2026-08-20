// ═══════════════════════════════════════════════════════════════════════════════
//  ParafraseAI · Frontend
//  by Jaime Wong Franco
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ─── Configuración de PDF.js ────────────────────────────────────────────────
window.addEventListener('load', () => {
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
});

// ─── Verificar librería docx ─────────────────────────────────────────────────
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
const tabFile          = document.getElementById('tab-file');
const tabText          = document.getElementById('tab-text');
const fileModeDiv      = document.getElementById('file-mode');
const runBtn           = document.getElementById('run-btn');
const progressSection  = document.getElementById('progress-section');
const outputSection    = document.getElementById('output-section');
const outputTextarea   = document.getElementById('output-textarea');
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

// ─── Variables globales ───────────────────────────────────────────────────────
let extractedText    = '';
let currentMode      = 'file';
let originalFilename = '';
let originalFileExt  = '';
let paraphraseHistory = [];

const MAX_FILE_SIZE_MB = 5;

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  tabFile.addEventListener('click', () => switchMode('file'));
  tabText.addEventListener('click', () => switchMode('text'));
  fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
  clearFileBtn.addEventListener('click', clearFile);
  runBtn.addEventListener('click', startParaphrase);
  copyBtn.addEventListener('click', copyOutput);
  downloadDocxBtn.addEventListener('click', downloadAsDocx);
  downloadTxtBtn.addEventListener('click', downloadAsTxt);
  resetBtn.addEventListener('click', resetAll);
  intensitySlider.addEventListener('input', (e) => updateIntensity(e.target.value));

  // ── Toggle chips de preservar ─────────────────────────────────────────────
  document.querySelectorAll('#preserve-chips .toggle-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
  });

  // ── Auto-grow del textarea de entrada ────────────────────────────────────
  textInput.addEventListener('input', autoGrow);
  textInput.addEventListener('paste', () => setTimeout(autoGrow, 0));

  // ── Drag & drop ──────────────────────────────────────────────────────────
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

  // ── Atajos de teclado ────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'Enter' && !runBtn.disabled) {
        e.preventDefault();
        startParaphrase();
      }
      if (e.key === 'c' && document.activeElement === outputTextarea) {
        e.preventDefault();
        copyOutput();
      }
    }
  });

  updateIntensity(intensitySlider.value);
  loadHistory();
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

// ─── Auto-grow textarea ───────────────────────────────────────────────────────
function autoGrow() {
  textInput.style.height = 'auto';
  const newHeight = Math.min(textInput.scrollHeight, 600);
  textInput.style.height = newHeight + 'px';
}

// ─── Cambio de modo (archivo / texto pegado) ──────────────────────────────────
function switchMode(mode) {
  currentMode = mode;
  tabFile.classList.toggle('active', mode === 'file');
  tabText.classList.toggle('active', mode === 'text');
  fileModeDiv.style.display = mode === 'file' ? 'block' : 'none';
  textInput.style.display   = mode === 'text'  ? 'block' : 'none';
  if (mode === 'text') {
    extractedText = '';
    setTimeout(() => textInput.focus(), 100);
  }
}

// ─── Manejo de archivo ────────────────────────────────────────────────────────
async function handleFile(file) {
  if (!file) return;

  // Validar tamaño
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    showErr(`El archivo supera el límite de ${MAX_FILE_SIZE_MB} MB. Usa un archivo más pequeño.`);
    return;
  }

  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'docx', 'doc', 'txt'].includes(ext)) {
    showErr('Formato no soportado. Usa PDF, DOCX o TXT.');
    return;
  }

  originalFilename = file.name;
  originalFileExt  = ext;
  fileLoadedDiv.style.display = 'flex';
  fileNameSpan.innerText = file.name;
  fileMetaSpan.innerText = 'Leyendo...';

  // Icono según extensión
  const icons = { pdf: '📕', docx: '📘', doc: '📘', txt: '📄' };
  document.getElementById('file-icon').innerText = icons[ext] || '📎';

  try {
    if (ext === 'txt')                      extractedText = await file.text();
    else if (ext === 'pdf')                 extractedText = await extractPDF(file);
    else /* docx / doc */                   extractedText = await extractDOCX(file);

    const wc = countWords(extractedText);
    fileMetaSpan.innerHTML = `${(file.size / 1024).toFixed(1)} KB · ${wc} palabras · ${ext.toUpperCase()}`;
    showErr('');
  } catch (e) {
    showErr('Error al leer el archivo: ' + e.message);
    extractedText = '';
    fileLoadedDiv.style.display = 'none';
  }
}

async function extractPDF(file) {
  const ab  = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  let text  = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(x => x.str).join(' ') + '\n';
  }
  return text;
}

async function extractDOCX(file) {
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

function countChars(text) {
  return text.replace(/\s/g, '').length;
}

function updateIntensity(val) {
  const labels = ['Conservador', 'Media', 'Agresivo'];
  const colors = ['#34d399', '#6ee7b7', '#fbbf24'];
  intensityVal.innerText = labels[val - 1];
  intensityVal.style.color = colors[val - 1];
}

// Temperatura según intensidad
function intensityToTemperature(val) {
  return [0.3, 0.7, 1.0][val - 1] ?? 0.7;
}

function getPreserve() {
  return Array.from(document.querySelectorAll('#preserve-chips .toggle-chip.active'))
              .map(c => c.dataset.key);
}

let errTimer = null;
function showErr(msg, isError = true) {
  errMsg.innerText = msg;
  errMsg.classList.toggle('visible', !!msg);
  errMsg.style.background = isError ? 'rgba(248,113,113,0.08)' : 'rgba(52,211,153,0.08)';
  errMsg.style.borderColor = isError ? 'rgba(248,113,113,0.2)' : 'rgba(52,211,153,0.2)';
  errMsg.style.color = isError ? 'var(--danger)' : 'var(--success)';
  if (errTimer) clearTimeout(errTimer);
  if (!isError && msg) {
    errTimer = setTimeout(() => errMsg.classList.remove('visible'), 3000);
  }
}

// ─── Similitud semántica simple (Jaccard de palabras) ────────────────────────
function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return union.size === 0 ? 0 : Math.round((intersection.size / union.size) * 100);
}

// ─── Chunking respetando límites de título ────────────────────────────────────
function isTitle(line) {
  const t = line.trim();
  if (!t) return false;
  return t.startsWith('#') ||
         (t === t.toUpperCase() && t.length < 60 && !t.endsWith('.'));
}

function splitIntoChunks(text, maxWords = 600) {
  const lines  = text.split(/\r?\n/);
  const chunks = [];
  let current  = [];
  let wordCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line  = lines[i];
    const words = line.trim() ? line.trim().split(/\s+/).length : 0;
    const nextIsTitle = i + 1 < lines.length && isTitle(lines[i + 1]);

    if (wordCount + words > maxWords && current.length > 0 && nextIsTitle) {
      chunks.push(current.join('\n'));
      current   = [line];
      wordCount = words;
    } else {
      current.push(line);
      wordCount += words;
    }
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}

// ─── Construcción del prompt ──────────────────────────────────────────────────
function buildPrompt(chunk, tone, intensity, preserve) {
  const tones = {
    natural: 'natural y fluido, como lo escribiría una persona real',
    academico: 'académico y formal, apropiado para papers y ensayos universitarios',
    formal: 'formal y profesional, apropiado para documentos de negocios',
    conversacional: 'conversacional y cercano, como una conversación entre amigos'
  };
  const intensityText = {
    1: 'cambios mínimos (solo sinónimos puntuales, conserva estructura de oraciones casi intacta)',
    2: 'cambios medios (reestructura algunas oraciones, varía vocabulario manteniendo fluidez)',
    3: 'reescritura profunda (transforma completamente la redacción manteniendo el significado exacto)'
  };

  let preserveRules = '';
  if (preserve.includes('titles'))    preserveRules += '- NO modifiques los títulos, encabezados ni líneas que empiecen con # o estén en MAYÚSCULAS CORTAS. Cópialos exactamente igual.\n';
  if (preserve.includes('numbers'))   preserveRules += '- Preserva todos los números, fechas, porcentajes y datos exactos sin cambiarlos.\n';
  if (preserve.includes('technical')) preserveRules += '- Mantén los términos técnicos, siglas y nombres propios sin usar sinónimos.\n';

  return `Eres un parafraseador profesional en español con amplia experiencia en reescritura de textos. Tu tarea es reescribir ÚNICAMENTE los párrafos de contenido, respetando siempre los títulos.

REGLAS OBLIGATORIAS:
- Tono: ${tones[tone] || 'natural y fluido'}.
- Intensidad: ${intensityText[intensity]}.
${preserveRules}- NO añadas comentarios, explicaciones, introducciones ni prefijos como "Aquí el texto:" o "Paráfrasis:".
- NO uses frases como "En resumen", "Para concluir", "En síntesis" al final.
- Devuelve SOLO el texto reescrito, manteniendo la misma estructura de líneas y párrafos.
- Los títulos y encabezados deben aparecer idénticos al original.
- Mantén la coherencia y cohesión entre párrafos.

TEXTO A PARAFRASEAR:
${chunk}`;
}

// ─── Fetch con timeout y reintentos ─────────────────────────────────────────
async function fetchWithTimeout(url, options, timeoutMs = 30000, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      logLine.innerText = `Reintentando... (${attempt + 1}/${retries})`;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// ─── Proceso principal de parafraseado ───────────────────────────────────────
async function startParaphrase() {
  showErr('');
  let source = '';

  if (currentMode === 'file') {
    if (!extractedText) { showErr('Sube un archivo primero.'); return; }
    source = extractedText;
  } else {
    source = textInput.value.trim();
    if (!source) { showErr('Pega un texto primero.'); return; }
  }

  const tone        = toneSelect.value;
  const intensity   = parseInt(intensitySlider.value, 10);
  const model       = modelSelect.value;
  const preserve    = getPreserve();
  const temperature = intensityToTemperature(intensity);

  const chunks = splitIntoChunks(source, 600);
  const total  = chunks.length;

  if (total > 20) {
    showErr(`El documento es muy largo (${total} segmentos). Considera dividirlo en partes más pequeñas.`);
    return;
  }

  runBtn.disabled = true;
  progressSection.classList.add('visible');
  outputSection.classList.remove('visible');
  chunkStatusDiv.innerHTML = chunks.map((_, i) =>
    `<div class="chunk-dot" id="dot-${i}" title="Segmento ${i+1}"></div>`
  ).join('');

  const results    = [];
  let errorCount   = 0;
  const startTime  = Date.now();

  for (let i = 0; i < chunks.length; i++) {
    const dot = document.getElementById(`dot-${i}`);
    dot.classList.add('active');
    logLine.innerText     = `Procesando segmento ${i + 1} de ${total}...`;
    progressFill.style.width = `${(i / total) * 100}%`;
    progressLabel.innerText  = `Segmento ${i + 1} de ${total}`;

    try {
      const prompt   = buildPrompt(chunks[i], tone, intensity, preserve);
      const response = await fetchWithTimeout('/api/paraphrase', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt, model, temperature })
      }, 45000, 1);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.paraphrased) throw new Error('Respuesta vacía del servidor');

      results.push(data.paraphrased);
      dot.classList.remove('active');
      dot.classList.add('done');
    } catch (err) {
      errorCount++;
      dot.classList.remove('active');
      dot.classList.add('error');
      results.push(chunks[i]);
      console.error(`Error segmento ${i + 1}:`, err.message);
    }

    // Pequeña pausa entre requests para no saturar la API
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  progressFill.style.width = '100%';
  progressLabel.innerText  = errorCount > 0
    ? `⚠️ Completado con ${errorCount} error(es) en ${elapsed}s`
    : `✅ Parafraseado completado en ${elapsed}s`;
  logLine.innerText = '';

  const finalText = results.join('\n\n');
  outputTextarea.value = finalText;
  statOrig.innerText   = countWords(source).toLocaleString();
  statNew.innerText    = countWords(finalText).toLocaleString();
  statChunks.innerText = total;

  // Calcular similitud
  const similarity = calculateSimilarity(source, finalText);
  if (statSimilarity) statSimilarity.innerText = similarity + '%';

  outputSection.classList.add('visible');

  if (errorCount > 0) {
    showErr(`⚠️ ${errorCount} de ${total} segmento(s) fallaron. El texto original fue conservado en esas secciones.`);
  }

  // Guardar en historial
  saveToHistory({
    date: new Date().toISOString(),
    tone,
    intensity,
    model,
    originalWords: countWords(source),
    newWords: countWords(finalText),
    similarity,
    preview: finalText.substring(0, 100) + '...'
  });

  runBtn.disabled = false;
}

// ─── Historial local ──────────────────────────────────────────────────────────
function saveToHistory(entry) {
  try {
    paraphraseHistory = JSON.parse(localStorage.getItem('parafrase_history') || '[]');
    paraphraseHistory.unshift(entry);
    if (paraphraseHistory.length > 10) paraphraseHistory.pop();
    localStorage.setItem('parafrase_history', JSON.stringify(paraphraseHistory));
  } catch (e) {
    console.warn('No se pudo guardar historial:', e);
  }
}

function loadHistory() {
  try {
    paraphraseHistory = JSON.parse(localStorage.getItem('parafrase_history') || '[]');
  } catch (e) {
    paraphraseHistory = [];
  }
}

// ─── Copiar al portapapeles ───────────────────────────────────────────────────
async function copyOutput() {
  const text = outputTextarea.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showErr('✅ Copiado al portapapeles', false);
  } catch {
    // Fallback
    outputTextarea.select();
    outputTextarea.setSelectionRange(0, 999999);
    document.execCommand('copy');
    showErr('✅ Copiado al portapapeles', false);
  }
}

// ─── Descarga DOCX ────────────────────────────────────────────────────────────
async function downloadAsDocx() {
  const text = outputTextarea.value;
  if (!text) { showErr('No hay texto para descargar.', true); return; }

  if (!isDocxAvailable()) {
    showErr('❌ La librería DOCX no está cargada. Recarga la página.', true);
    return;
  }

  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;
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

    const doc  = new Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        children: paragraphs
      }]
    });

    const blob = await Packer.toBlob(doc);
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href  = url;
    const timestamp = new Date().toISOString().slice(0, 10);
    link.download = `parafraseado_${timestamp}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showErr('✅ Documento DOCX descargado', false);
  } catch (error) {
    console.error('Error en downloadAsDocx:', error);
    showErr('Error al generar DOCX: ' + error.message, true);
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
  const timestamp = new Date().toISOString().slice(0, 10);
  a.download = `parafraseado_${timestamp}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showErr('✅ Archivo TXT descargado', false);
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function resetAll() {
  clearFile();
  textInput.value = '';
  textInput.style.height = '';
  outputSection.classList.remove('visible');
  progressSection.classList.remove('visible');
  progressFill.style.width = '0%';
  extractedText = '';
  showErr('');
  logLine.innerText = '';
}

// ─── Arrancar ────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
