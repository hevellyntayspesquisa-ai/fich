// ======================================
//  FICHAMENTO ABNT – SCRIPT PRINCIPAL (ULTRA-OTIMIZADO)
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
if (selectFileBtn) {
    selectFileBtn.addEventListener('click', () => {
        pdfFileInput.click();
    });
}

if (pdfFileInput) {
  pdfFileInput.addEventListener('change', (e) => {
    arquivoPdfSelecionado = e.target.files?.[0] || null;
    if (arquivoPdfSelecionado) {
      status(`Arquivo selecionado: ${arquivoPdfSelecionado.name}. Clique em "Analisar Destaques".`, false);
      if (processPdfBtn) processPdfBtn.disabled = false;
    } else {
      status('Nenhum arquivo selecionado.', false);
      if (processPdfBtn) processPdfBtn.disabled = true;
    }
  });
}

if (processPdfBtn) {
    processPdfBtn.addEventListener('click', () => {
        if (!arquivoPdfSelecionado) {
            status('Nenhum arquivo PDF selecionado.', false);
            return;
        }
        iniciarProcessamentoPdf(arquivoPdfSelecionado);
    });
}

if (clearImportedBtn) {
  clearImportedBtn.addEventListener('click', () => {
    outputArea.innerHTML =
      '<p class="placeholder">Citações limpas. Selecione um PDF novamente.</p>';
    refOutput.innerHTML =
      '<p class="placeholder">Preencha os dados para gerar no padrão ABNT.</p>';
    txtPreview.textContent = 'Conteúdo exportável aparecerá aqui.';
    ultimoTxtExportavel = '';
    arquivoPdfSelecionado = null;
    pdfFileInput.value = ''; 
    status('Citações limpas. Aguardando seleção de arquivo…', false);
  });
}

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

if (processBtn && manualText) {
  processBtn.addEventListener('click', () => {
    const texto = manualText.value;
    if (!texto.trim()) { status('Cole algum texto no campo “Texto manual”.', false); return; }
    status('Processando texto manual...', true);
    const ref = getRefData();
    const citacoesPorCor = extrairCitacoesDeTextoManual(texto);
    renderResultado(citacoesPorCor, ref);
    status('Texto manual processado.', false);
  });
}

if (downloadTxtBtn) {
  downloadTxtBtn.addEventListener('click', () => {
    if (!ultimoTxtExportavel.trim()) { status('Não há conteúdo para exportar.', false); return; }
    const blob = new Blob([ultimoTxtExportavel], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fichamento_abnt.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    status('Fichamento exportado para TXT.', false);
  });
}

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

async function iniciarProcessamentoPdf(file) {
    if (typeof pdfjsLib === 'undefined') { status('PDF.js não está disponível.', false); return; }

    status(`Carregando PDF: ${file.name}…`, true);
    try {
        const arrayBuffer = await file.arrayBuffer();
        await extrairDestaquesDoPdf(arrayBuffer);
    } catch (err) {
        console.error(err);
        status('Erro ao processar PDF (arquivo corrompido ou não suportado).', false);
    }
}

async function extrairDestaquesDoPdf(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  status(`PDF carregado: ${pdf.numPages} páginas. Processando…`, true);
  const citacoesPorCor = {};

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const progresso = Math.round((pageNum / pdf.numPages) * 100);
    status(`[${progresso}%] Processando página ${pageNum} de ${pdf.numPages}…`, true);
    
    const page = await pdf.getPage(pageNum);

    const [textContent, annotations] = await Promise.all([
      page.getTextContent().catch(() => ({ items: [] })),
      page.getAnnotations({ intent: 'display' }).catch(() => []),
    ]);

    const itensTexto = mapTextItems(textContent);
    let textoPaginaNativo = (textContent.items || []).map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();

    // 1. Tenta OCR se não houver texto nativo (para PDFs escaneados)
    if (!textoPaginaNativo || textoPaginaNativo.length < 50) { 
      // Adicionado um pequeno atraso para dar tempo ao Tesseract de inicializar
      await new Promise(resolve => setTimeout(resolve, 100));
      status(`[${progresso}%] Página ${pageNum} sem texto nativo. Tentando OCR...`, true);
      const textoOCR = await extrairTextoComOCR(page);
      
      if (textoOCR && textoOCR.length > 50) { 
        adicionarCitacao(citacoesPorCor, 'cinza', { pagina: pageNum, texto: textoOCR });
      } else {
         console.warn(`OCR não retornou texto útil na página ${pageNum}.`);
      }
      continue; 
    }

    // 2. Processa anotações de destaque (Highlights) digitais
    for (const ann of (annotations || [])) {
      const subtype = ann.subtype || ann.annotationType;
      
      const isHighlight =
        subtype === 'Highlight' || subtype === 9 ||
        subtype === 'Underline' || subtype === 10 ||
        subtype === 'Squiggly' || subtype === 11 ||
        subtype === 'StrikeOut' || subtype === 12;

      if (!isHighlight) continue;

      const caixas = getHighlightBoxes(ann);
      if (!caixas.length) continue;

      const corNome = mapRgbToCorNome(ann.color);

      const partes = [];
      for (const item of itensTexto) {
        if (caixas.some((caixa) => textoDentroDaCaixa(item, caixa))) {
          partes.push(item.str);
        }
      }

      let textoDestacado = partes.join(' ').replace(/\s+/g, ' ').trim();
      
      // Tenta usar o conteúdo da anotação como fallback se o texto geométrico falhar
      if (!textoDestacado && ann.contents) {
        textoDestacado = String(ann.contents).replace(/\s+/g, ' ').trim();
      }

      if (!textoDestacado) {
          console.warn(`Anotação na página ${pageNum} ignorada: Não foi possível extrair o texto destacado.`);
          continue; 
      }

      adicionarCitacao(citacoesPorCor, corNome, { pagina: pageNum, texto: textoDestacado });
    }
  }

  const ref = getRefData();
  renderResultado(citacoesPorCor, ref);
  status('Processamento concluído.', false);
}

// OCR: renderiza a página em canvas e reconhece com Tesseract.js
async function extrairTextoComOCR(page) {
  try {
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;

    const { data: { text, confidence } } = await Tesseract.recognize(canvas, 'por', {
      logger: m => console.log('[OCR]', m.status, m.progress)
    });
    
    const texto = (text || '').replace(/\s+/g, ' ').trim();
    
    // Se a confiança for baixa e o texto for curto, considera como falha
    if (confidence < 50 && texto.length < 50) {
        return '';
    }
    
    return texto;
  } catch (err) {
    console.error('OCR falhou:', err);
    return '';
  }
}

// Geometria / caixas
function intervaloSobrepoe(minA, maxA, minB, maxB, margem = 0) {
  return Math.max(minA, minB) - margem <= Math.min(maxA, maxB) + margem;
}

function mapTextItems(textContent) {
  const items = textContent.items || [];
  return items.map((it) => {
    const tr = it.transform || it.textMatrix || [1, 0, 0, 1, 0, 0];
    const x = tr[4] || 0;
    const y = tr[5] || 0;
    const fontHeight = Math.sqrt((tr[1] || 0) ** 2 + (tr[3] || 0) ** 2) || 1;
    const width = it.width || (it.str?.length ? it.str.length * fontHeight * 0.5 : fontHeight);
    const height = fontHeight;
    return { str: it.str, xMin: x, xMax: x + width, yMin: y, yMax: y + height };
  });
}

function getHighlightBoxes(annotation) {
  const boxes = [];
  const quads = annotation.quadPoints || annotation.quadrilaterals;
  if (!quads || !quads.length) return boxes;

  for (let i = 0; i < quads.length; i += 8) {
    const xs = [quads[i], quads[i + 2], quads[i + 4], quads[i + 6]];
    const ys = [quads[i + 1], quads[i + 3], quads[i + 5], quads[i + 7]];
    boxes.push({ minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) });
  }
  return boxes;
}

function textoDentroDaCaixa(item, caixa) {
  const xOverlap = intervaloSobrepoe(item.xMin, item.xMax, caixa.minX, caixa.maxX, 1);
  const yOverlap = intervaloSobrepoe(item.yMin, item.yMax, caixa.minY, caixa.maxY, 1);
  return xOverlap && yOverlap;
}

function extrairCitacoesDeTextoManual(texto) {
  const mapa = {};
  const regex = /\[([a-zA-ZáéíóúãõâêôçÇ]+)\|p=(\d+)\]([\s\S]*?)\[\/end\]/g;
  let m;
  while ((m = regex.exec(texto)) !== null) {
    const cor = m[1].toLowerCase();
    const pagina = parseInt(m[2], 10);
    const trecho = m[3].replace(/\s+/g, ' ').trim();
    if (!trecho) continue;
    adicionarCitacao(mapa, cor, { pagina, texto: trecho });
  }
  return mapa;
}

function adicionarCitacao(mapa, cor, cit) {
  if (!mapa[cor]) mapa[cor] = [];
  mapa[cor].push(cit);
}

// RGB → HSV e mapeamento de cores (lógica para identificar cor do highlight)
function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

function mapRgbToCorNome(rgb) {
  if (!rgb || rgb.length < 3) return 'amarelo';
  let [r, g, b] = rgb;

  if (r > 1 || g > 1 || b > 1) { r /= 255; g /= 255; b /= 255; }

  const { h, s, v } = rgbToHsv(r, g, b);

  if (s < 0.15) {
    if (v < 0.25) return 'preto';
    if (v > 0.85) return 'branco';
    return 'cinza';
  }

  if ((h >= 0 && h < 15) || (h >= 345 && h <= 360)) return 'vermelho';
  if (h >= 15 && h < 45) return 'laranja';
  if (h >= 45 && h < 70) return 'amarelo';
  if (h >= 70 && h < 150) return 'verde';
  if (h >= 150 && h < 210) return 'ciano';
  if (h >= 210 && h < 255) return 'azul';
  if (h >= 255 && h < 290) return 'roxo';
  if (h >= 290 && h < 345) return 'rosa';

  return 'amarelo';
}

function montarCitacaoABNT(trecho, pagina, ref) {
  const autor = ref.sobrenome || 'AUTOR'; 
  const ano   = ref.ano || 's.d.';
  const p     = pagina ? `, p. ${pagina}` : '';
  return `${trecho} (${autor}, ${ano}${p}).`;
}

function montarReferenciaABNT(ref) {
  if (!ref.sobrenome && !ref.titulo) {
    return 'Preencha pelo menos sobrenome e título para gerar a referência.';
  }
  const partes = [];
  
  if (ref.sobrenome) {
    const nomeComp = ref.nome ? `${ref.sobrenome}, ${ref.nome}` : ref.sobrenome;
    partes.push(nomeComp);
  }
  
  if (ref.titulo) partes.push(`<b>${ref.titulo}.</b>`);

  const infoSecundaria = [];
  
  if (ref.edicao) infoSecundaria.push(`${ref.edicao}. ed.`);

  let publicacao = [];
  if (ref.local) publicacao.push(ref.local);
  if (ref.editora) publicacao.push(ref.editora);
  if (ref.ano) publicacao.push(ref.ano);
  
  if (publicacao.length) {
    let output = '';
    const local = publicacao.shift();
    const editora = publicacao.shift();
    const ano = publicacao.shift();
    
    if (local) output += local;
    if (editora) output += ': ' + editora;
    if (ano) output += ', ' + ano;
    output += '.';
    infoSecundaria.push(output.trim());
  }

  partes.push(infoSecundaria.join(' '));

  if (ref.url) partes.push(`Disponível em: ${ref.url}.`);
  if (ref.dataAcesso) partes.push(`Acesso em: ${ref.dataAcesso}.`);

  return partes.filter(p => p.trim()).join(' ');
}

function renderResultado(citacoesPorCor, ref) {
  const ordemCores = ['vermelho','laranja','amarelo','verde','ciano','azul','roxo','rosa','cinza','preto','branco'];
  let htmlSaida = '';
  let linhasTxt = [];

  const referenciaFinal = montarReferenciaABNT(ref);
  refOutput.innerHTML = referenciaFinal; 

  const referenciaTxt = referenciaFinal.replace(/<\/?b>/g, '').trim();
  linhasTxt.push('==================================================');
  linhasTxt.push('REFERÊNCIA (ABNT NBR 6023):');
  linhasTxt.push('==================================================');
  linhasTxt.push(referenciaTxt);
  linhasTxt.push('\n\n');
  linhasTxt.push('==================================================');
  linhasTxt.push('CITAÇÕES AGRUPADAS (ABNT NBR 10520):');
  linhasTxt.push('==================================================');
  linhasTxt.push('');

  let citacoesEncontradas = false;

  ordemCores.forEach((cor) => {
    const lista = citacoesPorCor[cor];
    if (!lista || !lista.length) return;
    citacoesEncontradas = true;

    const nomeCategoria = categoriasPorCor[cor] || cor;
    htmlSaida += `<h3>${nomeCategoria} – ${cor}</h3>`;
    linhasTxt.push(`>>>>> ${nomeCategoria.toUpperCase()} (${cor.toUpperCase()}) <<<<<`);
    linhasTxt.push('');

    lista.forEach((cit) => {
      const citacao = montarCitacaoABNT(cit.texto, cit.pagina, ref);
      htmlSaida += `<p>${citacao}</p>`;
      
      linhasTxt.push(`P. ${cit.pagina}:`);
      linhasTxt.push(`  - Trecho: "${cit.texto.trim()}"`);
      linhasTxt.push(`  - Citação ABNT: ${citacao}`);
      linhasTxt.push('');
    });

    htmlSaida += '<hr />';
    linhasTxt.push('--------------------------------------------------');
  });

  if (!citacoesEncontradas) {
    htmlSaida = '<p class="placeholder">Nenhuma citação destacada foi encontrada. Verifique se o PDF possui destaques digitais (texto selecionável) ou se o OCR (para PDFs escaneados) conseguiu ler o texto. Veja o console para erros.</p>';
  }

  outputArea.innerHTML = htmlSaida;
  
  ultimoTxtExportavel = linhasTxt.join('\n');
  txtPreview.textContent = ultimoTxtExportavel;
}
