// =========================
// Referências aos elementos
// =========================
const statusBar       = document.getElementById('statusBar');
const outputArea      = document.getElementById('outputArea');
const refOutput       = document.getElementById('refOutput');
const txtPreview      = document.getElementById('txtPreview');

const pdfFileInput    = document.getElementById('pdfFileInput');
const clearImportedBtn= document.getElementById('clearImportedBtn');

const catNameInput    = document.getElementById('catName');
const catColorSelect  = document.getElementById('catColor');
const addCategoryBtn  = document.getElementById('addCategory');
const categoryList    = document.getElementById('categoryList');

const manualText      = document.getElementById('manualText');
const processBtn      = document.getElementById('processBtn');
const downloadTxtBtn  = document.getElementById('downloadTxtBtn');

// =========================
// Dados da referência ABNT
// =========================
function getRefData() {
  return {
    sobrenome: (document.getElementById('sobrenome').value || '').trim().toLowerCase(),
    nome:      (document.getElementById('nome').value      || '').trim(),
    autoresAdicionais: (document.getElementById('autoresAdicionais').value || '').trim(),
    titulo:    (document.getElementById('titulo').value    || '').trim(),
    local:     (document.getElementById('local').value     || '').trim(),
    editora:   (document.getElementById('editora').value   || '').trim(),
    ano:       (document.getElementById('ano').value       || '').trim(),
    edicao:    (document.getElementById('edicao').value    || '').trim(),
    paginas:   (document.getElementById('paginas').value   || '').trim(),
    tipoDoc:   (document.getElementById('tipoDoc').value   || '').trim(),
    url:       (document.getElementById('url').value       || '').trim(),
    dataAcesso:(document.getElementById('dataAcesso').value|| '').trim(),
  };
}

// ===========================
// Tabela cor → categoria
// ===========================
const categoriasPorCor = {};

addCategoryBtn.addEventListener('click', () => {
  const nome = catNameInput.value.trim();
  const cor  = catColorSelect.value;

  if (!nome) {
    status('Digite um nome de categoria antes de adicionar.');
    return;
  }

  categoriasPorCor[cor] = nome;
  renderCategoryList();
  catNameInput.value = '';
});

function renderCategoryList() {
  categoryList.innerHTML = '';
  Object.entries(categoriasPorCor).forEach(([cor, nome]) => {
    const li = document.createElement('li');
    li.textContent = `${nome} – ${cor}`;
    li.className = `cat-pill cat-${cor}`;

    const btnX = document.createElement('button');
    btnX.textContent = '×';
    btnX.className = 'cat-remove';
    btnX.addEventListener('click', () => {
      delete categoriasPorCor[cor];
      renderCategoryList();
    });

    li.appendChild(btnX);
    categoryList.appendChild(li);
  });
}

// ============================
// Utilitários
// ============================
let ultimoTxtExportavel = '';

function status(msg) {
  if (statusBar) statusBar.textContent = msg;
  console.log('[status]', msg);
}

// ========================
// Checagem inicial
// ========================
(function checkPdfJs() {
  if (typeof pdfjsLib === 'undefined') {
    status('PDF.js não carregado. Verifique a conexão com a internet.');
  } else {
    status('Aguardando arquivo ou texto…');
  }
})();

// ============================
// Listeners principais
// ============================
pdfFileInput.addEventListener('change', handlePdfSelect);

clearImportedBtn.addEventListener('click', () => {
  outputArea.innerHTML = `<p class="placeholder">Citações limpas. Selecione um PDF novamente.</p>`;
  refOutput.innerHTML  = `<p class="placeholder">Preencha os dados da referência para gerar no padrão ABNT.</p>`;
  txtPreview.textContent = 'Conteúdo exportável aparecerá aqui.';
  ultimoTxtExportavel = '';
  status('Citações limpas.');
});

// PROCESSAR TEXTO MANUAL
processBtn.addEventListener('click', () => {
  const texto = manualText.value;
  if (!texto.trim()) {
    status('Cole algum texto no campo “Texto manual”.');
    return;
  }
  const ref = getRefData();
  const citacoesPorCor = extrairCitacoesDeTextoManual(texto);
  renderResultado(citacoesPorCor, ref);
  status('Texto manual processado.');
});

// DOWNLOAD .TXT
downloadTxtBtn.addEventListener('click', () => {
  if (!ultimoTxtExportavel.trim()) {
    status('Não há conteúdo para exportar.');
    return;
  }
  const blob = new Blob([ultimoTxtExportavel], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'fichamento_abnt.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ==========================
// 1) PDF → destaques por cor
// ==========================
async function handlePdfSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (typeof pdfjsLib === 'undefined') {
    status('PDF.js não está disponível. Verifique a conexão.');
    return;
  }

  status(`Carregando PDF: ${file.name}…`);

  try {
    const arrayBuffer = await file.arrayBuffer();
    await extrairDestaquesDoPdf(arrayBuffer);
  } catch (err) {
    console.error('Erro ao ler arquivo:', err);
    status('Erro ao processar PDF (arquivo corrompido ou não suportado).');
  }
}

async function extrairDestaquesDoPdf(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  status(`PDF carregado (${pdf.numPages} páginas). Extraindo destaques…`);

  const citacoesPorCor = {};

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    const [textContent, annotations] = await Promise.all([
      page.getTextContent(),
      page.getAnnotations({ intent: 'display' })
    ]);

    const itensTexto = mapTextItems(textContent);

    for (const ann of annotations) {
      const subtype = ann.subtype || ann.annotationType;
      if (!subtype) continue;

      const isHighlight =
        subtype === 'Highlight' || subtype === 9 ||
        subtype === 'Underline' || subtype === 10 ||
        subtype === 'Squiggly'  || subtype === 11 ||
        subtype === 'StrikeOut' || subtype === 12;

      if (!isHighlight) continue;

      const caixas = getHighlightBoxes(ann);
      if (!caixas.length) continue;

      const corNome = mapRgbToCorNome(ann.color);

      const partes = [];
      for (const item of itensTexto) {
        const { x, y } = item;
        if (caixas.some(caixa => pontoDentroDaCaixa(x, y, caixa))) {
          partes.push(item.str);
        }
      }

      let textoDestacado = partes.join(' ').replace(/\s+/g, ' ').trim();

      if (!textoDestacado && ann.contents) {
        textoDestacado = String(ann.contents).replace(/\s+/g, ' ').trim();
      }

      if (!textoDestacado) continue;

      adicionarCitacao(citacoesPorCor, corNome, {
        pagina: pageNum,
        texto: textoDestacado
      });
    }
  }

  const ref = getRefData();
  renderResultado(citacoesPorCor, ref);
  status('Destaques extraídos!');
}

// TEXTOS DO PDF
function mapTextItems(textContent) {
  return textContent.items.map(it => {
    const transform = it.transform || it.textMatrix || [1, 0, 0, 1, 0, 0];
    const e = transform[4] || 0;
    const f = transform[5] || 0;
    return { str: it.str, x: e, y: f };
  });
}

function getHighlightBoxes(annotation) {
  const boxes = [];
  const quads = annotation.quadPoints || annotation.quadrilaterals;
  if (!quads || !quads.length) return boxes;

  for (let i = 0; i < quads.length; i += 8) {
    const xs = [quads[i], quads[i+2], quads[i+4], quads[i+6]];
    const ys = [quads[i+1], quads[i+3], quads[i+5], quads[i+7]];
    boxes.push({
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    });
  }
  return boxes;
}

function pontoDentroDaCaixa(x, y, caixa) {
  return (
    x >= caixa.minX &&
    x <= caixa.maxX &&
    y >= caixa.minY &&
    y <= caixa.maxY
  );
}

// =============================
// 2) TEXTO MANUAL COM CORES
// =============================
function extrairCitacoesDeTextoManual(texto) {
  const mapa = {};
  const regex = /\[([a-zA-Z]+)\|p=(\d+)\]([\s\S]*?)\[\/end\]/g;
  let m;
  while ((m = regex.exec(texto)) !== null) {
    const cor    = m[1].toLowerCase();
    const pagina = parseInt(m[2], 10);
    const trecho = m[3].replace(/\s+/g, ' ').trim();
    if (!trecho) continue;
    adicionarCitacao(mapa, cor, { pagina, texto: trecho });
  }
  return mapa;
}

// ===============================
// 3) ORGANIZAÇÃO E FORMATAÇÃO ABNT
// ===============================
function adicionarCitacao(mapa, cor, cit) {
  if (!mapa[cor]) mapa[cor] = [];
  mapa[cor].push(cit);
}

function mapRgbToCorNome(rgb) {
  if (!rgb || rgb.length < 3) return 'amarelo';

  let [r, g, b] = rgb;
  if (r > 1 || g > 1 || b > 1) { r/=255; g/=255; b/=255; }

  if (r > .8 && g > .8 && b < .4) return 'amarelo';
  if (r > .8 && g < .4 && b < .4) return 'vermelho';
  if (g > .6 && r < .4 && b < .4) return 'verde';
