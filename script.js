// ═══════════════════════════════════════════════════════════════════════════════
//  ParafraseAI · Frontend
//  by Jaime Wong Franco
// ═══════════════════════════════════════════════════════════════════════════════
'use strict';

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
let extractedText = '';
let currentMode   = 'file';

const MAX_FILE_SIZE_MB = 5;

// URLs CDN para cargar bajo demanda
const LIBS = {
  pdfjs: {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    global: 'pdfjsLib'
  },
  mammoth: {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
    global: 'mammoth'
  },
  docx: {
    url: 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js',
    global: 'docx'
  }
};

const libPromises = {};

function loadLib(name) {
  if (libPromises[name]) return libPromises[name];
  libPromises[name] = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LIBS[name].url;
    script.onload = () => {
      if (name === 'pdfjs' && window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfjs.worker;
      }
      resolve(window[LIBS[name].global]);
    };
    script.onerror = () => reject(new Error('No se pudo cargar librería externa.'));
    document.head.appendChild(script);
  });
  return libPromises[name];
}

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

  document.querySelectorAll('#preserve-chips .toggle-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
  });

  textInput.addEventListener('input', autoGrow);
  textInput.addEventListener('paste', () => setTimeout(autoGrow, 0));

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
  });

  updateIntensity(intensitySlider.value);
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function showErr(msg) {
  errMsg.innerText = msg;
  errMsg.classList.toggle('visible', !!msg);
}

function autoGrow() {
  textInput.style.height = 'auto';
  textInput.style.height = Math.min(textInput.scrollHeight, 600) + 'px';
}

function switchMode(mode) {
  currentMode = mode;
  tabFile.classList.toggle('active', mode === 'file');
  tabText.classList.toggle('active', mode === 'text');
  fileModeDiv.style.display = mode === 'file' ? 'block' : 'none';
  textInput.style.display   = mode === 'text' ? 'block' : 'none';
  if (mode === 'text') {
    extractedText = '';
    setTimeout(() => textInput.focus(), 100);
  }
}

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
    if (ext === 'txt')       extractedText = await file.text();
    else if (ext === 'pdf')  extractedText = await extractPDF(file);
    else                     extractedText = await extractDOCX(file);

    const wc = countWords(extractedText);
    if (wc === 0) throw new Error('el archivo no contiene texto extraíble (¿PDF escaneado?)');

    fileMetaSpan.innerText = `${(file.size / 1024).toFixed(1)} KB · ${wc.toLocaleString('es')} palabras · ${ext.toUpperCase()}`;
    showErr('');
  } catch (e) {
    showErr('Error al leer el archivo: ' + e.message);
    extractedText = '';
    fileLoadedDiv.style.display = 'none';
  }
}

async function extractPDF(file) {
  fileMetaSpan.innerText = 'Cargando lector de PDF...';
  await loadLib('pdfjs');
  const ab  = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
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
  fileMetaSpan.innerText = 'Cargando lector de DOCX...';
  await loadLib('mammoth');
  const ab     = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer: ab });
  return result.value;
}

function clearFile() {
  extractedText = '';
  fileLoadedDiv.style.display = 'none';
  fileInput.value = '';
  showErr('');
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

function intensityToTemperature(val) {
  return [0.3, 0.7, 1.0][val - 1] ?? 0.7;
}

function getPreserve() {
  return Array.from(document.querySelectorAll('#preserve-chips .toggle-chip.active'))
    .map(c => c.dataset.key);
}

function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return union.size === 0 ? 0 : Math.round((intersection.size / union.size) * 100);
}

function isTitle(line) {
  const t = line.trim();
  if (!t) return false;
  return t.startsWith('#') ||
    (t === t.toUpperCase() && t.length < 60 && !t.endsWith('.') && /[A-ZÁÉÍÓÚÑ]/.test(t));
}

function splitIntoChunks(text, maxWords = 550, maxChars = 7000) {
  const lines = text.split(/\r?\n/);
  const chunks = [];
  let current = [];
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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function startParaphrase() {
  if (runBtn.disabled) return;
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

  const chunks = splitIntoChunks(source);
  const total  = chunks.length;

  if (total > 20) {
    showErr(`El documento es muy largo (${total} segmentos). Considera dividirlo.`);
    return;
  }

  runBtn.disabled = true;
  progressSection.classList.add('visible');
  outputSection.classList.remove('visible');
  progressFill.style.width = '0%';
  chunkStatusDiv.innerHTML = chunks.map((_, i) =>
    `<div class="chunk-dot" id="dot-${i}" title="Segmento ${i + 1}"></div>`
  ).join('');

  const opts = { tone, intensity, preserve, model, temperature };
  const results = [];
  let errorCount = 0;
  let firstError = '';
  const startTime = Date.now();

  for (let i = 0; i < chunks.length; i++) {
    const dot = document.getElementById(`dot-${i}`);
    dot.classList.add('active');
    logLine.innerText = `Procesando segmento ${i + 1} de ${total}...`;
    progressFill.style.width = `${(i / total) * 100}%`;
    progressLabel.innerText = `Segmento ${i + 1} de ${total}`;

    try {
      const data = await paraphraseChunk(chunks[i], opts);
      if (!data.paraphrased) throw new Error('Respuesta vacía del servidor');
      results.push(data.paraphrased);
      dot.classList.remove('active');
      dot.classList.add('done');
    } catch (err) {
      errorCount++;
      if (!firstError) firstError = err.message || String(err);
      console.error(`Error segmento ${i + 1}:`, err);
      dot.classList.remove('active');
      dot.classList.add('error');
      results.push(chunks[i]);
    }

    if (i < chunks.length - 1) await sleep(300);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  progressFill.style.width = '100%';
  logLine.innerText = '';

  if (errorCount === total) {
    progressSection.classList.remove('visible');
    runBtn.disabled = false;
    showErr(`Todos los segmentos fallaron. Detalle: ${firstError}`);
    return;
  }

  const finalText = results.join('\n\n');
  outputTextarea.value   = finalText;
  statOrig.innerText     = countWords(source).toLocaleString('es');
  statNew.innerText      = countWords(finalText).toLocaleString('es');
  statChunks.innerText   = `${results.length - errorCount}/${total}`;
  statSimilarity.innerText = calculateSimilarity(source, finalText) + '%';

  progressLabel.innerText = errorCount > 0
    ? `⚠️ Completado con ${errorCount} error(es) en ${elapsed}s`
    : `✅ Parafraseado completado en ${elapsed}s`;

  outputSection.classList.add('visible');

  if (errorCount > 0) {
    showErr(`⚠️ ${errorCount} de ${total} segmento(s) fallaron (${firstError}). El texto original fue conservado en esas secciones.`);
  }

  runBtn.disabled = false;
}

async function paraphraseChunk(chunkText, opts) {
  // IMPORTANTE: URL relativa porque la API está en el MISMO proyecto
  const response = await fetch('/api/paraphrase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: chunkText, ...opts })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Error HTTP ${response.status}`);
  }

  return await response.json();
}

async function copyOutput() {
  const text = outputTextarea.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showErr('');
    alert('✅ Copiado al portapapeles');
  } catch {
    outputTextarea.select();
    document.execCommand('copy');
    alert('✅ Copiado al portapapeles');
  }
}

async function downloadAsDocx() {
  const text = outputTextarea.value;
  if (!text) { showErr('No hay texto para descargar.'); return; }

  try {
    if (typeof window.docx === 'undefined' || !window.docx.Document) {
      showErr('');
      logLine.innerText = 'Cargando generador DOCX...';
      await loadLib('docx');
    }

    const { Document, Packer, Paragraph, TextRun, AlignmentType } = window.docx;
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

    const doc = new Document({
      sections: [{
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
        },
        children: paragraphs
      }]
    });

    const blob = await Packer.toBlob(doc);
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href  = url;
    link.download = `parafraseado_${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showErr('');
    alert('✅ Documento DOCX descargado');
  } catch (error) {
    console.error('Error en downloadAsDocx:', error);
    showErr('Error al generar DOCX: ' + error.message);
  }
}

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
  alert('✅ Archivo TXT descargado');
}

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}