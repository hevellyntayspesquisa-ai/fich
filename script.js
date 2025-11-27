// ======================================
//  FICHAMENTO ABNT – SCRIPT PRINCIPAL (FINAL)
// ======================================

// Elementos
const statusBar        = document.getElementById('statusBar');
const outputArea       = document.getElementById('outputArea');
const refOutput        = document.getElementById('refOutput');
const txtPreview       = document.getElementById('txtPreview');

const pdfFileInput     = document.getElementById('pdfFileInput');
const selectFileBtn    = document.getElementById('selectFileBtn'); 
const processPdfBtn    = document.getElementById('processPdfBtn'); 
const clearImportedBtn = document.getElementById('clearImportedBtn');

const catNameInput     = document.getElementById('catName');
const catColorSelect   = document.getElementById('catColor');
const addCategoryBtn   = document.getElementById('addCategory');
const categoryList     = document.getElementById('categoryList');

const manualText       = document.getElementById('manualText');
const processBtn       = document.getElementById('processBtn');
const downloadTxtBtn   = document.getElementById('downloadTxtBtn');

// Estado
let ultimoTxtExportavel = '';
const categoriasPorCor = {}; 
let arquivoPdfSelecionado = null; 

// Utilitários
function status(msg, isLoading = false) {
  if (statusBar) statusBar.textContent = msg;
  const isPdfSelected = !!arquivoPdfSelecionado;
  if (processPdfBtn) processPdfBtn.disabled = isLoading || !isPdfSelected;
  if (selectFileBtn) selectFileBtn.disabled = isLoading;
  if (processBtn) processBtn.disabled = isLoading; 
  console.log('[status]', msg);
}

(function checkPdfJs() {
  if (typeof pdfjsLib === 'undefined') {
    status('PDF.js não carregado. Verifique a conexão com a internet.', false);
  } else {
    status('Aguardando seleção de arquivo…', false);
  }
})();

// Eventos UI
selectFileBtn?.addEventListener('click', () => pdfFileInput.click());

pdfFileInput?.addEventListener('change', (e) => {
  arquivoPdfSelecionado = e.target.files?.[0] || null;
  if (arquivoPdfSelecionado) {
    status(`Arquivo selecionado: ${arquivoPdfSelecionado.name}. Clique em "Analisar Destaques".`, false);
    processPdfBtn.disabled = false;
  } else {
    status('Nenhum arquivo selecionado.', false);
    processPdfBtn.disabled = true;
  }
});

processPdfBtn?.addEventListener('click', () => {
  if (!arquivoPdfSelecionado) {
    status('Nenhum arquivo PDF selecionado.', false);
    return;
  }
  iniciarProcessamentoPdf(arquivoPdfSelecionado);
});

clearImportedBtn?.addEventListener('click', () => {
  outputArea.innerHTML = '<p class="placeholder">Citações limpas. Selecione um PDF novamente.</p>';
  refOutput.innerHTML = '<p class="placeholder">Preencha os dados para gerar no padrão ABNT.</p>';
  txtPreview.textContent = 'Conteúdo exportável aparecerá aqui.';
  ultimoTxtExportavel = '';
  arquivoPdfSelecionado = null;
  pdfFileInput.value = ''; 
  status('Citações limpas. Aguardando seleção de arquivo…', false);
});

addCategoryBtn?.addEventListener('click', () => {
  const nome = catNameInput.value.trim();
  const cor  = catColorSelect.value;
  if (!nome) { status('Digite um nome de categoria antes de adicionar.', false); return; }
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

processBtn?.addEventListener('click', () => {
  const texto = manualText.value;
  if (!texto.trim()) { status('Cole algum texto no campo “Texto manual”.', false); return; }
  status('Processando texto manual...', true);
  const ref = getRefData();
  const citacoesPorCor = extrairCitacoesDeTextoManual(texto);
  renderResultado(citacoesPorCor, ref);
  status('Texto manual processado.', false);
});

downloadTxtBtn?.addEventListener('click', () => {
  if (!ultimoTxtExportavel.trim()) { status('Não há conteúdo para exportar.', false); return; }
  const blob = new Blob([ultimoTxtExportavel], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'fichamento_abnt.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  status('Fichamento exportado para TXT.', false);
});

// Dados da referência
function getRefData() {
  return {
    sobrenome: (document.getElementById('sobrenome')?.value || '').trim().toUpperCase(),
    nome: (document.getElementById('nome')?.value || '').trim(),
    autoresAdicionais: (document.getElementById('autoresAdicionais')?.value || '').trim(),
    titulo: (document.getElementById('titulo')?.value || '').trim(),
    local: (document.getElementById('local')?.value || '').trim(),
    editora: (document.getElementById('editora')?.value || '').trim(),
    ano: (document.getElementById('ano')?.value || '').trim(),
    edicao: (document.getElementById('edicao')?.value || '').trim(),
    paginas: (document.getElementById('paginas')?.value || '').trim(),
    tipoDoc: (document.getElementById('tipoDoc')?.value || '').trim(),
    url: (document.getElementById('url')?.value || '').trim(),
    dataAcesso: (document.getElementById('dataAcesso')?.value || '').trim(),
  };
}

// Processamento PDF
async function iniciarProcessamentoPdf(file) {
  if (typeof pdfjsLib === 'undefined') { status('PDF.js não está disponível.', false); return; }
  status(`Carregando PDF: ${file.name}…`, true);
  try {
    const arrayBuffer = await file.arrayBuffer();
    await extrairDestaquesDoPdf(arrayBuffer);
  } catch (err) {
    console.error(err);
    status('Erro ao processar PDF.', false);
  }
}

async function extrairDestaquesDoPdf(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  status(`PDF carregado: ${pdf.numPages} páginas. Processando…`, true);
  const citacoesPorCor = {};

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const [textContent, annotations] = await Promise.all([
      page.getTextContent().catch(() => ({ items: [] })),
      page.getAnnotations({ intent: 'display' }).catch(() => []),
    ]);

    const itensTexto = mapTextItems(textContent);
    let textoPaginaNativo = (textContent.items || []).map(it => it.str).join(' ').trim();

    // OCR se não houver texto nativo
    if (!textoPaginaNativo || textoPaginaNativo.length < 50) {
      status(`Página ${pageNum}: sem texto nativo, aplicando OCR...`, true);
      const textoOCR = await extrairTextoComOCR(page);
      if (textoOCR) adicionarCitacao(citacoesPorCor, 'cinza', { pagina: pageNum, texto: textoOCR });
      continue;
    }

    // Processa destaques digitais
    for (const ann of annotations) {
      const subtype = ann.subtype || ann.annotationType;
      const isHighlight = ['Highlight','Underline','Squiggly','StrikeOut'].includes(subtype) || [9,10,11,12].includes(subtype);
      if (!isHighlight) continue;

      const caixas = getHighlightBoxes(ann);
      if (!caixas.length) continue;

      const corNome = mapRgbToCorNome(ann.color);
