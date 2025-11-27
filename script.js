// ======================================
//  FICHAMENTO ABNT – SCRIPT PRINCIPAL
// ======================================

// -------------------------
// Referências aos elementos
// -------------------------
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

// --------------------------
// Dados da referência (ABNT)
// --------------------------
function getRefData() {
  return {
    sobrenome: (document.getElementById('sobrenome').value || '').trim().toLowerCase(),
    nome: (document.getElementById('nome').value || '').trim(),
    autoresAdicionais: (document.getElementById('autoresAdicionais').value || '').trim(),
    titulo: (document.getElementById('titulo').value || '').trim(),
    local: (document.getElementById('local').value || '').trim(),
    editora: (document.getElementById('editora').value || '').trim(),
    ano: (document.getElementById('ano').value || '').trim(),
    edicao: (document.getElementById('edicao').value || '').trim(),
    paginas: (document.getElementById('paginas').value || '').trim(),
    tipoDoc: (document.getElementById('tipoDoc').value || '').trim(),
    url: (document.getElementById('url').value || '').trim(),
    dataAcesso: (document.getElementById('dataAcesso').value || '').trim(),
  };
}

// --------------------------------
// Tabela de cores → categorias
// --------------------------------
const categoriasPorCor = {}; // ex.: { verde: "conceitos importantes" }

addCategoryBtn.addEventListener('click', () => {
  const nome = catNameInput.value.trim();
  const cor = catColorSelect.value;

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

// -------------------------------
// Utilitários: status e exportação
// -------------------------------
let ultimoTxtExportavel = '';

function status(msg) {
  if (statusBar) statusBar.textContent = msg;
  console.log('[status]', msg);
}

// Checagem inicial do PDF.js
(function checkPdfJs() {
  if (typeof pdfjsLib === 'undefined') {
    status('PDF.js não carregado. Verifique a conexão com a internet.');
  } else {
    status('Aguardando arquivo ou texto…');
  }
})();

// ---------------------------
// Listeners principais da UI
// ---------------------------
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

if (processBtn && manualText) {
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
}

if (downloadTxtBtn) {
  downloadTxtBtn.addEventListener('click', () => {
    if (!ultimoTxtExportavel.trim()) {
      status('Não há conteúdo para exportar.');
      return;
    }
    const blob = new Blob([ultimoTxtExportavel], {
      type: 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fichamento_abnt.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// =====================================
// 1) Leitura do PDF e das anotações
// =====================================
async function handlePdfSelect(e) {
  const file = e.target.files && e.target.files[0];
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

  const totalPaginas = pdf.numPages;
  status(`PDF carregado: ${totalPaginas} páginas. Processando destaques…`);

  const citacoesPorCor = {};

  for (let pageNum = 1; pageNum <= totalPaginas; pageNum++) {
    status(`Processando página ${pageNum} de ${totalPaginas}…`);

    const page = await pdf.getPage(pageNum);
    const [textContent, annotations] = await Promise.all([
      page.getTextContent(),
      page.getAnnotations({ intent: 'display' }),
    ]);

    const itensTexto = mapTextItems(textContent);

    for (const ann of annotations) {
      const subtype = ann.subtype || ann.annotationType;
      if (!subtype) continue;

      const isHighlight =
        subtype === 'Highlight' ||
        subtype === 9 ||
        subtype === 'Underline' ||
        subtype === 10 ||
        subtype === 'Squiggly' ||
        subtype === 11 ||
        subtype === 'StrikeOut' ||
        subtype === 12;

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

      adicionarCitacao(citacoesPorCor, corNome, {
        pagina: pageNum,
        texto: textoDestacado,
      });
    }
  }

  const ref = getRefData();
  renderResultado(citacoesPorCor, ref);
  status('Processamento concluído.');
}

// ==========================================
//  FUNÇÕES MATEMÁTICAS DE INTERVALO / ÁREA
// ==========================================

// Verifica se dois intervalos [minA, maxA] e [minB, maxB] se sobrepõem
function intervaloSobrepoe(minA, maxA, minB, maxB, margem = 0) {
  return Math.max(minA, minB) - margem <= Math.min(maxA, maxB) + margem;
}

// Converte itens de texto em retângulos aproximados {str, xMin, xMax, yMin, yMax}
function mapTextItems(textContent) {
  return textContent.items.map((it) => {
    const tr = it.transform || it.textMatrix || [1, 0, 0, 1, 0, 0];
    const x = tr[4] || 0;
    const y = tr[5] || 0;

    const fontHeight = Math.sqrt((tr[1] || 0) ** 2 + (tr[3] || 0) ** 2) || 1;
    const width =
      it.width || (it.str && it.str.length ? it.str.length * fontHeight * 0.5 : fontHeight);
    const height = fontHeight;

    return {
      str: it.str,
      xMin: x,
      xMax: x + width,
      yMin: y,
      yMax: y + height,
    };
  });
}

// Constrói caixas (bounding boxes) a partir de quadPoints do highlight
function getHighlightBoxes(annotation) {
  const boxes = [];
  const quads = annotation.quadPoints || annotation.quadrilaterals;
  if (!quads || !quads.length) return boxes;

  for (let i = 0; i < quads.length; i += 8) {
    const xs = [quads[i], quads[i + 2], quads[i + 4], quads[i + 6]];
    const ys = [quads[i + 1], quads[i + 3], quads[i + 5], quads[i + 7]];

    boxes.push({
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    });
  }
  return boxes;
}

// Verifica se o retângulo do texto e o retângulo do highlight se sobrepõem
function textoDentroDaCaixa(item, caixa) {
  const xOverlap = intervaloSobrepoe(item.xMin, item.xMax, caixa.minX, caixa.maxX, 1);
  const yOverlap = intervaloSobrepoe(item.yMin, item.yMax, caixa.minY, caixa.maxY, 1);
  return xOverlap && yOverlap;
}

// =======================================
// 2) Texto manual com cores (opcional)
// =======================================
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

// =======================================
// 3) Organização por cor + ABNT
// =======================================
function adicionarCitacao(mapa, cor, cit) {
  if (!mapa[cor]) mapa[cor] = [];
  mapa[cor].push(cit);
}

// ---------- RGB → HSV & cor básica ----------

function rgbToHsv(r, g, b) {
  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  let h, s, v = max;

  let d = max - min;
  s = max === 0 ? 0 : d / max;

  if (d === 0) {
    h = 0;
  } else {
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s, v };
}

// Converte RGB da anotação em nome de cor básica usando HSV
function mapRgbToCorNome(rgb) {
  if (!rgb || rgb.length < 3) return 'amarelo';

  let [r, g, b] = rgb;

  // Alguns PDFs usam 0–255
  if (r > 1 || g > 1 || b > 1) {
    r /= 255;
    g /= 255;
    b /= 255;
  }

  const { h, s, v } = rgbToHsv(r, g, b);

  // baixa saturação → tons de cinza
  if (s < 0.15) {
    if (v < 0.25) return 'preto';
    if (v > 0.85) return 'branco';
    return 'cinza';
  }

  // H em graus 0–360
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

// ---------- ABNT ----------

function montarCitacaoABNT(trecho, pagina, ref) {
  const autor = ref.sobrenome || 'autor';
  const ano = ref.ano || 's.d.';
  const p = pagina ? `, p. ${pagina}` : '';
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

  if (ref.titulo) {
    partes.push(`${ref.titulo}.`);
  }

  const localEditoraAno = [];
  if (ref.local) localEditoraAno.push(ref.local);
  if (ref.editora) localEditoraAno.push(ref.editora);
  if (ref.ano) localEditoraAno.push(ref.ano);

  if (localEditoraAno.length) {
    partes.push(localEditoraAno.join(': ') + '.');
  }

  if (ref.url) {
    partes.push(ref.url);
  }
  if (ref.dataAcesso) {
    partes.push(`Acesso em: ${ref.dataAcesso}.`);
  }

  return partes.join(' ');
}

// ---------- Render na interface ----------

function renderResultado(citacoesPorCor, ref) {
  const ordemCores = [
    'vermelho',
    'laranja',
    'amarelo',
    'verde',
    'ciano',
    'azul',
    'roxo',
    'rosa',
    'cinza',
    'preto',
    'branco',
  ];

  let htmlSaida = '';
  let linhasTxt = [];

  ordemCores.forEach((cor) => {
    const lista = citacoesPorCor[cor];
    if (!lista || !lista.length) return;

    const nomeCategoria = categoriasPorCor[cor] || cor;

    htmlSaida += `<h3>${nomeCategoria} – ${cor}</h3>`;
    linhasTxt.push(`${nomeCategoria} – ${cor}`);

    lista.forEach((cit) => {
      const citacao = montarCitacaoABNT(cit.texto, cit.pagina, ref);
      htmlSaida += `<p>${citacao}</p>`;
      linhasTxt.push(citacao);
      linhasTxt.push('');
    });

    htmlSaida += '<hr />';
    linhasTxt.push('');
  });

  if (!htmlSaida) {
    htmlSaida =
      '<p class="placeholder">Nenhuma citação destacada foi encontrada. Verifique se o PDF possui texto selecionável e destaques como anotações (marca-texto), não apenas imagem escaneada.</p>';
    linhasTxt = ['Nenhuma citação encontrada.'];
  }

  outputArea.innerHTML = htmlSaida;

  const referenciaFinal = montarReferenciaABNT(ref);
  refOutput.textContent = referenciaFinal;

  linhasTxt.push('');
  linhasTxt.push('Referência:');
  linhasTxt.push(referenciaFinal);

  ultimoTxtExportavel = linhasTxt.join('\n');
  txtPreview.textContent = ultimoTxtExportavel;
}
