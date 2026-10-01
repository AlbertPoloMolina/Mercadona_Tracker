/**
 * Parser de Excel para precios_productos.xlsx usando SheetJS
 */
import { determineCategory, cleanTokensForVariants, CATEGORIES_MAP } from './categories.js';

export function parseSpanishDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const clean = s.split(' ')[0];
  const parts = clean.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const dt = new Date(year, month, day);
      return {
        dateObj: dt,
        iso: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        original: s
      };
    }
  }
  return null;
}

export function parseExcelWorkbook(arrayBuffer) {
  if (!window.XLSX) {
    throw new Error('La librería SheetJS (XLSX) no está cargada.');
  }

  const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  if (!rawRows || rawRows.length < 2) {
    throw new Error('El archivo Excel no contiene suficientes datos.');
  }

  const headers = rawRows[0];
  const productNames = headers.slice(1).map(h => String(h || '').trim()).filter(Boolean);

  // Procesar filas de tickets con fecha
  const parsedRows = [];
  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const dateCell = row[0];
    if (!dateCell) continue;

    const parsedDate = parseSpanishDate(dateCell);
    if (!parsedDate) continue;

    // Verificar si la fila tiene al menos un precio
    let hasData = false;
    const itemPrices = {};
    for (let c = 1; c < headers.length; c++) {
      const colName = headers[c];
      const val = row[c];
      if (val !== null && val !== undefined && val !== '') {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          itemPrices[colName] = Math.round(num * 100) / 100;
          hasData = true;
        }
      }
    }

    if (hasData) {
      parsedRows.push({
        dateObj: parsedDate.dateObj,
        dateISO: parsedDate.iso,
        originalDate: parsedDate.original,
        prices: itemPrices
      });
    }
  }

  // Ordenar cronológicamente
  parsedRows.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  if (parsedRows.length === 0) {
    throw new Error('No se encontraron tickets con fecha válida en el Excel.');
  }

  // Pre-computar tokens para detección de variantes
  const productTokens = {};
  for (const name of productNames) {
    productTokens[name] = new Set(cleanTokensForVariants(name));
  }

  const productsData = [];
  const categoriesSet = new Set();

  for (const col of productNames) {
    const history = [];

    for (const ticket of parsedRows) {
      if (ticket.prices[col] !== undefined) {
        history.push({
          date: ticket.originalDate,
          dateISO: ticket.dateISO,
          price: ticket.prices[col]
        });
      }
    }

    if (history.length === 0) continue;

    const cat = determineCategory(col);
    categoriesSet.add(cat);

    const priceList = history.map(h => h.price);
    const lastItem = history[history.length - 1];
    const lastPrice = lastItem.price;
    const lastDate = lastItem.date;
    const lastDateISO = lastItem.dateISO;

    const minPrice = Math.min(...priceList);
    const minIdx = priceList.indexOf(minPrice);
    const minDate = history[minIdx].date;

    const maxPrice = Math.max(...priceList);
    const maxIdx = priceList.indexOf(maxPrice);
    const maxDate = history[maxIdx].date;

    const avgPrice = Math.round((priceList.reduce((acc, p) => acc + p, 0) / priceList.length) * 100) / 100;

    let prevPrice = null;
    let changePrev = 0;
    let changePrevPct = 0;
    if (history.length >= 2) {
      prevPrice = history[history.length - 2].price;
      changePrev = Math.round((lastPrice - prevPrice) * 100) / 100;
      if (prevPrice > 0) {
        changePrevPct = Math.round(((changePrev / prevPrice) * 100) * 10) / 10;
      }
    }

    const changeMinPct = minPrice > 0 ? Math.round(((lastPrice - minPrice) / minPrice) * 1000) / 10 : 0;

    let trend = 'stable';
    if (changePrev > 0.01) trend = 'up';
    else if (changePrev < -0.01) trend = 'down';

    // Variantes / formatos
    const curTokens = productTokens[col];
    const variants = [];
    if (curTokens && curTokens.size > 0) {
      for (const other of productNames) {
        if (other === col) continue;
        const otherTokens = productTokens[other];
        if (!otherTokens) continue;

        let overlapCount = 0;
        for (const t of curTokens) {
          if (otherTokens.has(t)) overlapCount++;
        }

        if ((curTokens.size >= 2 && overlapCount >= 2) ||
            (curTokens.size === 1 && overlapCount === 1 &&
             (curTokens.has('HUEVO') || curTokens.has('LECHE') || curTokens.has('ACEITE') || curTokens.has('PAN') || curTokens.has('AGUA')))) {
          variants.push(other);
        }
      }
    }

    productsData.append ? null : productsData.push({
      id: col.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().replace(/^-+|-+$/g, ''),
      name: col,
      category: cat,
      totalPurchases: history.length,
      lastPrice: Math.round(lastPrice * 100) / 100,
      lastDate: lastDate,
      lastDateISO: lastDateISO,
      minPrice: Math.round(minPrice * 100) / 100,
      minDate: minDate,
      maxPrice: Math.round(maxPrice * 100) / 100,
      maxDate: maxDate,
      avgPrice: avgPrice,
      prevPrice: prevPrice !== null ? Math.round(prevPrice * 100) / 100 : null,
      changePrev: changePrev,
      changePrevPct: changePrevPct,
      changeMinPct: changeMinPct,
      trend: trend,
      variants: variants.slice(0, 6),
      history: history
    });
  }

  const orderedCategories = ['Todas', ...Object.keys(CATEGORIES_MAP).filter(c => categoriesSet.has(c))];
  if (categoriesSet.has('📦 Otros productos')) {
    orderedCategories.push('📦 Otros productos');
  }

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      totalTickets: parsedRows.length,
      totalProducts: productsData.length,
      dateRange: {
        first: parsedRows[0].originalDate,
        firstISO: parsedRows[0].dateISO,
        last: parsedRows[parsedRows.length - 1].originalDate,
        lastISO: parsedRows[parsedRows.length - 1].dateISO
      }
    },
    categories: orderedCategories,
    products: productsData
  };
}
