// ======================================
//  FICHAMENTO ABNT – SCRIPT PRINCIPAL (CORRIGIDO)
// ======================================

// Elementos
const statusBar        = document.getElementById('statusBar');
const outputArea       = document.getElementById('outputArea');
const refOutput        = document.getElementById('refOutput');
const txtPreview       = document.getElementById('txtPreview');

const pdfFileInput     = document.getElementById('pdfFileInput');
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
const categoriasPorCor = {}; // ex.: { verde: "conceitos importantes" }

// Utilitários
function status(msg) {
  if (statusBar) statusBar.textContent = msg;
  console.log('[status]', msg);
}

(function checkPdfJs() {
  if (typeof pdfjsLib === 'undefined') {
    status('PDF.js não carregado. Verifique a conexão com a internet.');
  } else {
    status('Aguardando arquivo ou texto…');
  }
})();

// Eventos UI
if (pdfFileInput) {
  pdfFileInput.addEventListener('change', handlePdfSelect);
}

if (clearImportedBtn) {
  clearImportedBtn.addEventListener('click', () => {
    outputArea.innerHTML =
      '<p class="placeholder">Citações limpas. Selecione um PDF novamente.</p>';
    refOutput.innerHTML =
      '<p class="placeholder">Preencha os dados para gerar no padrão ABNT.</p>';
    txtPreview.textContent = 'Conteúdo exportável aparecerá aqui.';
    ultimoTxtExportavel = '';
    status('Citações limpas.');
  });
}

addCategoryBtn?.addEventListener('click', () => {
  const nome = catNameInput.value.trim();
  const cor  = catColorSelect.value;
  if (!nome) { status('Digite um nome de categoria antes de adicionar.'); return; }
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
    if (!texto.trim()) { status('Cole algum texto no campo “Texto manual”.'); return; }
    const ref = getRefData();
    const citacoesPorCor = extrairCitacoesDeTextoManual(texto);
    renderResultado(citacoesPorCor, ref);
    status('Texto manual processado.');
  });
}

if (downloadTxtBtn) {
  downloadTxtBtn.addEventListener('click', () => {
    if (!ultimoTxtExportavel.trim()) { status('Não há conteúdo para exportar.'); return; }
    const blob = new Blob([ultimoTxtExportavel], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fichamento_abnt.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// Dados da referência
function getRefData() {
  return {
    // CORREÇÃO: Não converter para minúsculas aqui. A capitalização será feita nas funções ABNT.
    sobrenome: (document.getElementById('sobrenome')?.value || '').trim(),
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

// Leitura do PDF e das anotações
async function handlePdfSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (typeof pdfjsLib === 'undefined') { status('PDF.js não está disponível.'); return; }

  status(`Carregando PDF: ${file.name}…`);
  try {
    const arrayBuffer = await file.arrayBuffer();
    await extrairDestaquesDoPdf(arrayBuffer);
  } catch (err) {
    console.error(err);
    status('Erro ao processar PDF (arquivo corrompido ou não suportado).');
  }
}

// OTIMIZAÇÃO DE DESEMPENHO: Processamento paralelo de páginas
async function extrairDestaquesDoPdf(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  status(`PDF carregado: ${pdf.numPages} páginas. Processando em paralelo…`);

  const processarPagina = async (pageNum) => {
    const page = await pdf.getPage(pageNum);

    const [textContent, annotations] = await Promise.all([
      page.getTextContent().catch(() => ({ items: [] })),
      page.getAnnotations({ intent: 'display' }).catch(() => []),
    ]);

    const itensTexto = mapTextItems(textContent);
    let textoPaginaNativo = (textContent.items || []).map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();

    const citacoesPagina = {};

    // 1. Se não houver texto, usa OCR
    if (!textoPaginaNativo) {
      status(`[OCR] Página ${pageNum}: tentando extrair texto...`);
      const textoOCR = await extrairTextoComOCR(page);
      if (textoOCR) {
        // Para PDFs escaneados sem anotações digitais, categorizamos em "cinza" com página
        adicionarCitacao(citacoesPagina, 'cinza', { pagina: pageNum, texto: textoOCR });
        return citacoesPagina;
      }
    }

    // 2. Extrai anotações de destaque
    for (const ann of (annotations || [])) {
      const subtype = ann.subtype || ann.annotationType;
      if (!subtype) continue;

      const isHighlight =
        subtype === 'Highlight' || subtype === 9 ||
        subtype === 'Underline' || subtype === 10 ||
        subtype === 'Squiggly' || subtype === 11 ||
        subtype === 'StrikeOut' || subtype || 12;

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
      if (!textoDestacado && ann.contents) {
        textoDestacado = String(ann.contents).replace(/\s+/g, ' ').trim();
      }
      if (!textoDestacado) continue;

      adicionarCitacao(citacoesPagina, corNome, { pagina: pageNum, texto: textoDestacado });
    }
    return citacoesPagina;
  };

  const pagePromises = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    pagePromises.push(processarPagina(i));
  }

  // Espera por todas as páginas em paralelo
  const resultadosPaginas = await Promise.all(pagePromises);
  
  // Agrupa os resultados
  const citacoesPorCor = resultadosPaginas.reduce((acc, current) => {
    for (const cor in current) {
      if (!acc[cor]) acc[cor] = [];
      acc[cor].push(...current[cor]);
    }
    return acc;
  }, {});
  
  const ref = getRefData();
  renderResultado(citacoesPorCor, ref);
  status('Processamento concluído.');
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

    const { data: { text } } = await Tesseract.recognize(canvas, 'por', {
      logger: m => console.log('[OCR]', m.status, m.progress)
    });
    const texto = (text || '').replace(/\s+/g, ' ').trim();
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

// Texto manual com cores
function extrairCitacoesDeTextoManual(texto) {
  const mapa = {};
  // CORREÇÃO: Regex mais robusta para lidar com espaços e quebras de linha nas tags.
  const regex = /\[\s*([a-zA-ZáéíóúãõâêôçÇ]+)\s*\|\s*p\s*=\s*(\d+)\s*\]([\s\S]*?)\[\s*\/end\s*\]/g;
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

// Organização por cor
function adicionarCitacao(mapa, cor, cit) {
  if (!mapa[cor]) mapa[cor] = [];
  mapa[cor].push(cit);
}

// RGB → HSV e mapeamento de cores
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

  // normaliza 0–255 → 0–1
  if (r > 1 || g > 1 || b > 1) { r /= 255; g /= 255; b /= 255; }

  const { h, s, v } = rgbToHsv(r, g, b);

  // baixa saturação → tons neutros
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

// ABNT
function montarCitacaoABNT(trecho, pagina, ref) {
  // CORREÇÃO ABNT NBR 10520: Sobrenome em CAIXA ALTA para citação em parênteses.
  const autor = ref.sobrenome.toUpperCase() || 'AUTOR';
  const ano   = ref.ano || 's.d.';
  const p     = pagina ? `, p. ${pagina}` : '';
  
  // O ponto final deve ser sempre colocado DEPOIS do parênteses da citação no padrão ABNT
  return `${trecho} (${autor}, ${ano}${p}).`;
}

function montarReferenciaABNT(ref) {
  if (!ref.sobrenome && !ref.titulo) {
    return 'Preencha pelo menos sobrenome e título para gerar a referência.';
  }
  const partes = [];
  
  // Sobrenome do primeiro autor em CAIXA ALTA
  if (ref.sobrenome) {
    const nomeComp = ref.nome ? `${ref.sobrenome.toUpperCase()}, ${ref.nome}` : ref.sobrenome.toUpperCase();
    partes.push(nomeComp);
  }
  
  // Título em NEGRITO (NBR 6023)
  if (ref.titulo) partes.push(`<b>${ref.titulo}.</b>`);

  const localEditoraAnoEdicao = [];

  // Edição
  if (ref.edicao) localEditoraAnoEdicao.push(`${ref.edicao}. ed.`);

  // Local: Editora, Ano.
  if (ref.local) localEditoraAnoEdicao.push(ref.local);
  if (ref.editora) localEditoraAnoEdicao.push(ref.editora);
  if (ref.ano) localEditoraAnoEdicao.push(ref.ano);
  
  if (localEditoraAnoEdicao.length) {
    let output = '';
    
    if (ref.edicao) {
        output += localEditoraAnoEdicao.shift() + ' ';
    }
    
    const local = localEditoraAnoEdicao.shift();
    const editora = localEditoraAnoEdicao.shift();
    const ano = localEditoraAnoEdicao.shift();
    
    if (local) output += local;
    if (editora) output += ': ' + editora;
    if (ano) output += ', ' + ano;
    output += '.';
    partes.push(output.trim());
  }

  // Complementos
  if (ref.paginas) partes.push(`${ref.paginas} p.`);
  if (ref.tipoDoc) partes.push(`(${ref.tipoDoc}).`);

  // URL e Acesso
  if (ref.url) partes.push(`Disponível em: ${ref.url}.`);
  if (ref.dataAcesso) partes.push(`Acesso em: ${ref.dataAcesso}.`);

  return partes.join(' ');
}

// Render
function renderResultado(citacoesPorCor, ref) {
  const ordemCores = ['vermelho','laranja','amarelo','verde','ciano','azul','roxo','rosa','cinza','preto','branco'];
  let htmlSaida = '';
  let linhasTxt = [];

  // Gera a referência ABNT no início do arquivo TXT
  const referenciaFinal = montarReferenciaABNT(ref);
  refOutput.innerHTML = referenciaFinal; // Usa innerHTML para renderizar o negrito (<b>)

  // Formatação do TXT
  linhasTxt.push('==================================================');
  linhasTxt.push('REFERÊNCIA (ABNT NBR 6023):');
  linhasTxt.push('==================================================');
  linhasTxt.push(referenciaFinal.replace(/<\/?b>/g, '')); // Remove tags <b> para o TXT
  linhasTxt.push('\n\n');
  linhasTxt.push('==================================================');
  linhasTxt.push('CITAÇÕES AGRUPADAS (ABNT NBR 10520):');
  linhasTxt.push('==================================================');
  linhasTxt.push('');


  ordemCores.forEach((cor) => {
    const lista = citacoesPorCor[cor];
    if (!lista || !lista.length) return;

    const nomeCategoria = categoriasPorCor[cor] || cor;
    htmlSaida += `<h3>${nomeCategoria} – ${cor}</h3>`;
    linhasTxt.push(`>>>>> ${nomeCategoria.toUpperCase()} (${cor.toUpperCase()}) <<<<<`);
    linhasTxt.push('');

    lista.forEach((cit) => {
      const citacao = montarCitacaoABNT(cit.texto, cit.pagina, ref);
      htmlSaida += `<p>${citacao}</p>`;
      
      // Saída mais detalhada e separada para o TXT
      linhasTxt.push(`P. ${cit.pagina}:`);
      linhasTxt.push(`  - Trecho: "${cit.texto.trim()}"`);
      linhasTxt.push(`  - Citação ABNT: ${montarCitacaoABNT(cit.texto, cit.pagina, ref)}`);
      linhasTxt.push('');
    });

    htmlSaida += '<hr />';
    linhasTxt.push('--------------------------------------------------');
  });

  if (!htmlSaida) {
    htmlSaida = '<p class="placeholder">Nenhuma citação destacada foi encontrada. Se o PDF for escaneado, o OCR tentará extrair o texto, mas pode variar conforme a qualidade.</p>';
    linhasTxt.push('Nenhuma citação encontrada.');
  }

  outputArea.innerHTML = htmlSaida;
  
  ultimoTxtExportavel = linhasTxt.join('\n');
  txtPreview.textContent = ultimoTxtExportavel;
}
