/**
 * Módulo del Comparador Rápido de Supermercados
 * Permite comparar en tiempo real el precio de cualquier producto en otro súper frente a Mercadona:
 * 1. Mismo envase (Directo)
 * 2. Diferente peso o volumen (g, kg, ml, L) -> normalizado a €/kg o €/L
 * 3. Diferentes unidades (uds, piezas, pastillas, huevos) -> normalizado a €/ud
 */

/**
 * Normaliza cantidades de peso o volumen a unidad base ('kg' o 'L')
 */
export function normalizeWeightVolume(qty, unit) {
  const q = parseFloat(qty);
  if (isNaN(q) || q <= 0) return { qtyBase: 1, baseUnit: 'kg' };

  const u = String(unit || '').toLowerCase().trim();
  if (u === 'g' || u === 'gr') {
    return { qtyBase: q / 1000.0, baseUnit: 'kg' };
  } else if (u === 'kg') {
    return { qtyBase: q, baseUnit: 'kg' };
  } else if (u === 'ml') {
    return { qtyBase: q / 1000.0, baseUnit: 'L' };
  } else if (u === 'cl') {
    return { qtyBase: q / 100.0, baseUnit: 'L' };
  } else if (u === 'l') {
    return { qtyBase: q, baseUnit: 'L' };
  }
  return { qtyBase: q, baseUnit: 'kg' };
}

/**
 * Detecta automáticamente si el nombre de un producto sugiere peso, volumen o unidades
 */
export function detectProductFormat(name) {
  if (!name) return { mode: 'direct', qty: 1, unit: 'envase' };
  const upper = name.toUpperCase();

  // Pack con multiplicación de volumen: 6X1,5L, 6X1L, 4X200ML, 6X33CL
  const mMultiVol = upper.match(/(\d+)\s*[X*]\s*(\d+(?:[.,]\d+)?)\s*(L|LT|LTS|ML|CL)\b/);
  if (mMultiVol) {
    const count = parseInt(mMultiVol[1], 10);
    const vol = parseFloat(mMultiVol[2].replace(',', '.'));
    const rawUnit = mMultiVol[3];
    const unit = rawUnit === 'ML' ? 'ml' : (rawUnit === 'CL' ? 'cl' : 'L');
    const totalVol = Math.round(count * vol * 100) / 100;
    return { mode: 'weight', qty: totalVol, unit, isVolume: true };
  }

  // Volumen simple: 1,5L, 1L, 330ML, 500ML, 33CL, 1 LITRO, 1.5 LITROS (no precedido de / para evitar 1/2)
  const mVol = upper.match(/(?<!\/)(\d+(?:[.,]\d+)?)\s*(L|LT|LTS|LITROS?|ML|CL)\b/);
  if (mVol) {
    const qty = parseFloat(mVol[1].replace(',', '.'));
    const rawUnit = mVol[2];
    if (!(rawUnit === 'L' && qty > 10)) {
      const unit = rawUnit === 'ML' ? 'ml' : (rawUnit === 'CL' ? 'cl' : 'L');
      return { mode: 'weight', qty, unit, isVolume: true };
    }
  }

  // Peso: 500G, 250 GR, 1KG, 1,5KG, 500 GRS, 1 KILO, 2 KILOS (no precedido de /)
  const mWeight = upper.match(/(?<!\/)(\d+(?:[.,]\d+)?)\s*(KG|KILOS?|KGS?|G|GR|GRS|GRAMOS)\b/);
  if (mWeight) {
    const qty = parseFloat(mWeight[1].replace(',', '.'));
    const raw = mWeight[2];
    const unit = ['G', 'GR', 'GRS', 'GRAMOS'].includes(raw) ? 'g' : 'kg';
    return { mode: 'weight', qty, unit, isVolume: false };
  }

  // Unidades con prefijo: PACK-3, PACK 4, PK6, X6, X 12
  const mPack = upper.match(/\b(?:PACK|PK|X)\s*[-]?\s*([1-9]\d*)\b/);
  if (mPack) {
    return { mode: 'units', qty: parseInt(mPack[1], 10), unit: 'uds' };
  }

  // Unidades con sufijo pack: 4 PACK, 4 PAC, 4 PK, 4PACK
  const mPackPost = upper.match(/([1-9]\d*)\s*(?:PACK|PAC|PK)\b/);
  if (mPackPost) {
    return { mode: 'units', qty: parseInt(mPackPost[1], 10), unit: 'uds' };
  }

  // Abreviación P-12, P6, P3, P-2
  const mPrefP = upper.match(/\bP[-]?([1-9]\d*)\b/);
  if (mPrefP) {
    const val = parseInt(mPrefP[1], 10);
    if ([2, 3, 4, 5, 6, 8, 10, 12, 18, 24].includes(val)) {
      return { mode: 'units', qty: val, unit: 'uds' };
    }
  }

  // Unidades explícitas: 12 HUEVOS, 24 UNID, 6 UN, 3 U, 30H, 24 PAS, 8 RAC, 40 B., 40 BOLSAS
  const mUnits = upper.match(/([1-9]\d*)\s*(?:UDS?|UNID\.?|UNIDADES?|UN|U|BOLSAS?|B\.|BOCADILLOS?|HUEVOS?|CAPSULAS?|DOSIS|PASTILLAS?|PAS|HOJAS?|H|RACIONES|RAC|LATAS?)\b/);
  if (mUnits) {
    return { mode: 'units', qty: parseInt(mUnits[1], 10), unit: 'uds' };
  }

  // Número común al inicio del nombre (ej: 12 HUEVOS..., 3 BOCADILLOS...)
  const mStart = upper.match(/^([1-9]\d*)\s+([A-Z]+)/);
  if (mStart) {
    const val = parseInt(mStart[1], 10);
    const word = mStart[2];
    if ([2, 3, 4, 5, 6, 8, 10, 12, 18, 20, 24, 30, 40, 50].includes(val) && !word.endsWith('%')) {
      return { mode: 'units', qty: val, unit: 'uds' };
    }
  }

  return { mode: 'direct', qty: 1, unit: 'envase' };
}

/**
 * Calcula el precio unitario (€/kg, €/L o €/ud) dado un precio y un formato (peso/volumen/unidades)
 */
export function calculateProductUnitPrice(price, format) {
  const p = parseFloat(price);
  if (isNaN(p) || p <= 0 || !format) return null;

  if (format.mode === 'weight') {
    const norm = normalizeWeightVolume(format.qty, format.unit);
    if (!norm || norm.qtyBase <= 0) return null;
    const unitPrice = p / norm.qtyBase;
    const baseUnit = norm.baseUnit; // 'kg' o 'L'
    return {
      unitPrice: Math.round(unitPrice * 100) / 100,
      unitPriceRaw: unitPrice,
      unitLabel: baseUnit,
      formatted: `${unitPrice.toFixed(2).replace('.', ',')} €/${baseUnit}`,
      shortLabel: `€/${baseUnit}`
    };
  }

  if (format.mode === 'units') {
    const q = parseFloat(format.qty);
    if (isNaN(q) || q <= 0) return null;
    const unitPrice = p / q;
    const decimals = unitPrice < 1 ? 3 : 2;
    return {
      unitPrice: Math.round(unitPrice * 1000) / 1000,
      unitPriceRaw: unitPrice,
      unitLabel: 'ud',
      formatted: `${unitPrice.toFixed(decimals).replace('.', ',')} €/ud`,
      shortLabel: '€/ud'
    };
  }

  return null;
}

export class SupermarketComparator {
  constructor(productsData = []) {
    this.products = productsData;
    this.selectedProduct = null;
    this.savedComparisons = this.loadSavedComparisons();
  }

  setProducts(productsData) {
    this.products = productsData;
  }

  loadSavedComparisons() {
    try {
      const stored = localStorage.getItem('mercadona_saved_comparisons');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  persistSavedComparisons() {
    try {
      localStorage.setItem('mercadona_saved_comparisons', JSON.stringify(this.savedComparisons));
    } catch (e) {
      console.warn('No se pudo guardar la lista de comparativas en localStorage', e);
    }
  }

  selectProduct(productIdOrName) {
    this.selectedProduct = this.products.find(
      p => p.id === productIdOrName || p.name.toUpperCase() === String(productIdOrName).toUpperCase()
    ) || null;
    return this.selectedProduct;
  }

  /**
   * Realiza el cálculo comparativo según el modo seleccionado
   * @param {Object} params
   * @param {string} params.mode - 'direct' | 'weight' | 'units'
   * @param {number|string} params.competitorPrice - Precio marcado en el otro supermercado
   * @param {string} params.competitorName - Cadena (Carrefour, Lidl, etc.)
   * @param {number} [params.mercadonaQty] - Cantidad peso/volumen Mercadona
   * @param {string} [params.mercadonaUnit] - Unidad peso/volumen Mercadona ('g', 'kg', 'ml', 'L')
   * @param {number} [params.competitorQty] - Cantidad peso/volumen Competidor
   * @param {string} [params.competitorUnit] - Unidad peso/volumen Competidor ('g', 'kg', 'ml', 'L')
   * @param {number} [params.mercadonaUnits] - Número de unidades Mercadona (ej. 12)
   * @param {number} [params.competitorUnits] - Número de unidades Competidor (ej. 10)
   */
  calculate(params) {
    if (!this.selectedProduct) {
      return { error: 'Selecciona un producto primero' };
    }

    const {
      mode = 'direct',
      competitorPrice,
      competitorName = 'Competidor'
    } = params;

    const compPriceNum = parseFloat(competitorPrice);
    if (isNaN(compPriceNum) || compPriceNum <= 0) {
      return { error: 'Introduce un precio válido' };
    }

    const mercadonaPrice = this.selectedProduct.lastPrice;
    if (isNaN(mercadonaPrice) || mercadonaPrice <= 0) {
      return { error: 'El precio de referencia de Mercadona no es válido' };
    }

    let mercadonaUnitPrice = mercadonaPrice;
    let competitorUnitPrice = compPriceNum;
    let unitLabel = 'envase';
    let equivalentMercadonaCost = mercadonaPrice;
    let actualCompetitorCost = compPriceNum;
    let packageSavings = 0;
    let detailLabel = '';

    // =========================================================================
    // MODO 1: MISMO ENVASE (DIRECTO)
    // =========================================================================
    if (mode === 'direct') {
      mercadonaUnitPrice = mercadonaPrice;
      competitorUnitPrice = compPriceNum;
      unitLabel = 'envase';
      equivalentMercadonaCost = mercadonaPrice;
      actualCompetitorCost = compPriceNum;
      packageSavings = mercadonaPrice - compPriceNum;
      detailLabel = `${competitorName}: ${compPriceNum.toFixed(2)} € vs Mercadona: ${mercadonaPrice.toFixed(2)} €`;
    }

    // =========================================================================
    // MODO 2: POR PESO O VOLUMEN (g, kg, ml, L)
    // =========================================================================
    else if (mode === 'weight') {
      const mQty = parseFloat(params.mercadonaQty);
      const cQty = parseFloat(params.competitorQty);
      const mUnit = params.mercadonaUnit || 'g';
      const cUnit = params.competitorUnit || 'g';

      if (isNaN(mQty) || mQty <= 0 || isNaN(cQty) || cQty <= 0) {
        return { error: 'Introduce el peso o volumen en ambos supermercados' };
      }

      // Normalizar cantidades a unidad base (kg o L)
      const normM = normalizeWeightVolume(mQty, mUnit);
      const normC = normalizeWeightVolume(cQty, cUnit);

      unitLabel = normM.baseUnit === 'L' || normC.baseUnit === 'L' ? 'L' : 'kg';

      // Precio por kg o por Litro
      mercadonaUnitPrice = mercadonaPrice / normM.qtyBase;
      competitorUnitPrice = compPriceNum / normC.qtyBase;

      // ¿Cuánto costaría en Mercadona la misma cantidad exacta que ofrece el paquete del competidor?
      equivalentMercadonaCost = normC.qtyBase * mercadonaUnitPrice;
      actualCompetitorCost = compPriceNum;
      packageSavings = equivalentMercadonaCost - actualCompetitorCost;

      detailLabel = `${competitorUnitPrice.toFixed(2)} €/${unitLabel} (${cQty}${cUnit}) vs ${mercadonaUnitPrice.toFixed(2)} €/${unitLabel} (${mQty}${mUnit})`;
    }

    // =========================================================================
    // MODO 3: POR UNIDADES (uds, dosis, piezas, huevos)
    // =========================================================================
    else if (mode === 'units') {
      const mUnits = parseFloat(params.mercadonaUnits);
      const cUnits = parseFloat(params.competitorUnits);

      if (isNaN(mUnits) || mUnits <= 0 || isNaN(cUnits) || cUnits <= 0) {
        return { error: 'Introduce el número de unidades en ambos supermercados' };
      }

      unitLabel = 'ud';

      // Precio por unidad
      mercadonaUnitPrice = mercadonaPrice / mUnits;
      competitorUnitPrice = compPriceNum / cUnits;

      // ¿Cuánto costarían en Mercadona las unidades que trae este pack del competidor?
      equivalentMercadonaCost = cUnits * mercadonaUnitPrice;
      actualCompetitorCost = compPriceNum;
      packageSavings = equivalentMercadonaCost - actualCompetitorCost;

      detailLabel = `${competitorUnitPrice.toFixed(3)} €/ud (${cUnits} uds) vs ${mercadonaUnitPrice.toFixed(3)} €/ud (${mUnits} uds)`;
    }

    // =========================================================================
    // CÁLCULO DE DIFERENCIAS Y VEREDICTO
    // =========================================================================
    const diffUnitPrice = competitorUnitPrice - mercadonaUnitPrice;
    const diffPct = mercadonaUnitPrice > 0 ? ((competitorUnitPrice - mercadonaUnitPrice) / mercadonaUnitPrice) * 100 : 0;

    let verdict = 'same';
    let verdictTitle = 'Mismo precio';
    let verdictClass = 'verdict-neutral';
    let verdictMessage = 'Ambos supermercados ofrecen prácticamente el mismo precio por unidad/peso.';

    // Tolerancia de 0.5 céntimos o 0.8%
    if (diffPct < -0.8 && packageSavings > 0.005) {
      verdict = 'cheaper';
      verdictTitle = `¡Más económico en ${competitorName}!`;
      verdictClass = 'verdict-success';

      const absSavings = Math.abs(packageSavings).toFixed(2);
      const absPct = Math.abs(diffPct).toFixed(1);

      if (mode === 'direct') {
        verdictMessage = `🎉 Ahorras <strong>${absSavings} €</strong> (${absPct}%) comprándolo en ${competitorName} frente al último precio de Mercadona (${mercadonaPrice.toFixed(2)} €).`;
      } else if (mode === 'weight') {
        const uLabel = unitLabel;
        verdictMessage = `🎉 Sale a <strong>${competitorUnitPrice.toFixed(2)} €/${uLabel}</strong> en ${competitorName} frente a <strong>${mercadonaUnitPrice.toFixed(2)} €/${uLabel}</strong> en Mercadona (-${absPct}%). En este envase ahorras <strong>${absSavings} €</strong> respecto a comprar la misma cantidad en Mercadona.`;
      } else {
        verdictMessage = `🎉 Sale a <strong>${competitorUnitPrice.toFixed(3)} €/ud</strong> en ${competitorName} frente a <strong>${mercadonaUnitPrice.toFixed(3)} €/ud</strong> en Mercadona (-${absPct}%). En este pack ahorras <strong>${absSavings} €</strong> frente al precio de Mercadona.`;
      }

      // Verificación contra mínimo histórico
      if (mode === 'direct' && compPriceNum < this.selectedProduct.minPrice) {
        verdictMessage += ` ¡Incluso bate tu mínimo histórico en Mercadona (${this.selectedProduct.minPrice.toFixed(2)} €)!`;
      }
    } else if (diffPct > 0.8 && packageSavings < -0.005) {
      verdict = 'expensive';
      verdictTitle = `Más caro que en Mercadona`;
      verdictClass = 'verdict-danger';

      const absExtra = Math.abs(packageSavings).toFixed(2);
      const absPct = Math.abs(diffPct).toFixed(1);

      if (mode === 'direct') {
        verdictMessage = `⚠️ En ${competitorName} pagas <strong>+${absExtra} €</strong> (+${absPct}%) más. Te conviene comprarlo en Mercadona (${mercadonaPrice.toFixed(2)} €).`;
      } else if (mode === 'weight') {
        const uLabel = unitLabel;
        verdictMessage = `⚠️ Sale a <strong>${competitorUnitPrice.toFixed(2)} €/${uLabel}</strong> en ${competitorName} frente a <strong>${mercadonaUnitPrice.toFixed(2)} €/${uLabel}</strong> en Mercadona (+${absPct}%). Por esta cantidad pagas <strong>+${absExtra} €</strong> de más. Te conviene comprarlo en Mercadona.`;
      } else {
        verdictMessage = `⚠️ Sale a <strong>${competitorUnitPrice.toFixed(3)} €/ud</strong> en ${competitorName} frente a <strong>${mercadonaUnitPrice.toFixed(3)} €/ud</strong> en Mercadona (+${absPct}%). Por este pack pagas <strong>+${absExtra} €</strong> de más.`;
      }
    }

    return {
      product: this.selectedProduct,
      mode,
      competitorName,
      competitorRawPrice: compPriceNum,
      mercadonaRawPrice: mercadonaPrice,
      mercadonaUnitPrice: Math.round(mercadonaUnitPrice * 1000) / 1000,
      competitorUnitPrice: Math.round(competitorUnitPrice * 1000) / 1000,
      unitLabel,
      mercadonaQty: params.mercadonaQty || params.mercadonaUnits || 1,
      mercadonaUnit: params.mercadonaUnit || (mode === 'units' ? 'uds' : 'envase'),
      competitorQty: params.competitorQty || params.competitorUnits || 1,
      competitorUnit: params.competitorUnit || (mode === 'units' ? 'uds' : 'envase'),
      diffUnitPrice: Math.round(diffUnitPrice * 1000) / 1000,
      diffPct: Math.round(diffPct * 10) / 10,
      equivalentMercadonaCost: Math.round(equivalentMercadonaCost * 100) / 100,
      actualCompetitorCost: Math.round(actualCompetitorCost * 100) / 100,
      packageSavings: Math.round(packageSavings * 100) / 100,
      detailLabel,
      verdict,
      verdictTitle,
      verdictClass,
      verdictMessage
    };
  }

  saveComparison(calcResult) {
    if (!calcResult || calcResult.error) return false;

    const item = {
      id: 'cmp_' + Date.now(),
      timestamp: new Date().toISOString(),
      productId: calcResult.product.id,
      productName: calcResult.product.name,
      mode: calcResult.mode,
      unitLabel: calcResult.unitLabel,
      mercadonaPrice: calcResult.mercadonaRawPrice,
      mercadonaUnitPrice: calcResult.mercadonaUnitPrice,
      mercadonaQty: calcResult.mercadonaQty,
      mercadonaUnit: calcResult.mercadonaUnit,
      competitorName: calcResult.competitorName,
      competitorPrice: calcResult.competitorRawPrice,
      competitorUnitPrice: calcResult.competitorUnitPrice,
      competitorQty: calcResult.competitorQty,
      competitorUnit: calcResult.competitorUnit,
      equivalentMercadonaCost: calcResult.equivalentMercadonaCost,
      actualCompetitorCost: calcResult.actualCompetitorCost,
      packageSavings: calcResult.packageSavings,
      diffPct: calcResult.diffPct,
      detailLabel: calcResult.detailLabel,
      verdict: calcResult.verdict
    };

    // Si ya existía un registro idéntico reciente para este producto y competidor, actualizarlo o añadir
    this.savedComparisons.unshift(item);
    this.persistSavedComparisons();
    return item;
  }

  deleteComparison(id) {
    this.savedComparisons = this.savedComparisons.filter(c => c.id !== id);
    this.persistSavedComparisons();
  }

  clearComparisons() {
    this.savedComparisons = [];
    this.persistSavedComparisons();
  }

  /**
   * Genera el ranking comparativo entre TODOS los supermercados registrados para un producto
   * @param {Object} product - Producto de Mercadona
   * @param {Object} [activeFormat] - Formato activo ({ mode, qty, unit })
   * @param {Object} [currentCalcResult] - Resultado de cálculo en vivo (opcional, para previsualización inmediata)
   */
  getSupermarketRanking(product, activeFormat = null, currentCalcResult = null) {
    if (!product) return [];

    const format = activeFormat || detectProductFormat(product.name);
    const mercUnit = calculateProductUnitPrice(product.lastPrice, format);

    // 1. Entrada de Mercadona
    const mercadonaEntry = {
      supermarket: 'Mercadona',
      price: product.lastPrice,
      unitPrice: mercUnit ? mercUnit.unitPrice : product.lastPrice,
      unitLabel: mercUnit ? mercUnit.unitLabel : 'envase',
      formattedUnitPrice: mercUnit ? mercUnit.formatted : `${product.lastPrice.toFixed(2)} €/envase`,
      date: product.lastDate || 'Referencia',
      isMercadona: true,
      isLivePreview: false
    };

    // 2. Extraer comparativas registradas de este producto
    const prodNameUpper = (product.name || '').toUpperCase().trim();
    const prodId = product.id;

    // Agrupamos por competidor guardando solo el más reciente
    const competitorMap = new Map();
    const allRecords = [...(this.savedComparisons || [])];

    for (const rec of allRecords) {
      const matchName = (rec.productName || '').toUpperCase().trim() === prodNameUpper;
      const matchId = rec.productId && rec.productId === prodId;
      if (!matchName && !matchId) continue;

      const compName = rec.competitorName || 'Competidor';
      const existing = competitorMap.get(compName);
      const recDate = new Date(rec.timestamp || 0).getTime();

      if (!existing || recDate > existing.timestampMs) {
        let uPrice = rec.competitorUnitPrice;
        let uLabel = rec.unitLabel || 'envase';

        if (uPrice === undefined || uPrice === null) {
          uPrice = rec.competitorPrice;
        }

        const dateStr = rec.timestamp ? new Date(rec.timestamp).toLocaleDateString('es-ES') : 'Guardado';
        const formattedUnitPrice = uLabel === 'envase' 
          ? `${uPrice.toFixed(2)} €/envase` 
          : `${uPrice.toFixed(uLabel === 'ud' && uPrice < 1 ? 3 : 2).replace('.', ',')} €/${uLabel}`;

        competitorMap.set(compName, {
          supermarket: compName,
          price: rec.competitorPrice,
          unitPrice: uPrice,
          unitLabel: uLabel,
          formattedUnitPrice,
          date: dateStr,
          timestampMs: recDate,
          isMercadona: false,
          isLivePreview: false,
          detailLabel: rec.detailLabel || ''
        });
      }
    }

    // 3. Si hay un cálculo en directo para un competidor, actualizar o añadir en vivo
    if (currentCalcResult && !currentCalcResult.error && currentCalcResult.product?.id === product.id) {
      const liveCompName = currentCalcResult.competitorName;
      competitorMap.set(liveCompName, {
        supermarket: liveCompName,
        price: currentCalcResult.competitorRawPrice,
        unitPrice: currentCalcResult.competitorUnitPrice,
        unitLabel: currentCalcResult.unitLabel,
        formattedUnitPrice: currentCalcResult.unitLabel === 'envase'
          ? `${currentCalcResult.competitorUnitPrice.toFixed(2)} €/envase`
          : `${currentCalcResult.competitorUnitPrice.toFixed(currentCalcResult.unitLabel === 'ud' && currentCalcResult.competitorUnitPrice < 1 ? 3 : 2).replace('.', ',')} €/${currentCalcResult.unitLabel}`,
        date: 'En directo ⚡',
        timestampMs: Date.now() + 1000,
        isMercadona: false,
        isLivePreview: true,
        detailLabel: currentCalcResult.detailLabel || ''
      });
    }

    // Combinar Mercadona con competidores
    const ranking = [mercadonaEntry, ...competitorMap.values()];

    // Ordenar de menor a mayor precio unitario
    ranking.sort((a, b) => a.unitPrice - b.unitPrice);

    // Asignar puestos, medallas y diferencia vs el ganador
    const winner = ranking[0];
    const medals = ['🥇', '🥈', '🥉'];

    return ranking.map((item, idx) => {
      const isWinner = idx === 0;
      const medal = medals[idx] || `${idx + 1}º`;
      let diffPct = 0;
      let diffText = '';

      if (isWinner) {
        diffText = '¡Mejor precio!';
      } else if (winner.unitPrice > 0) {
        diffPct = Math.round(((item.unitPrice - winner.unitPrice) / winner.unitPrice) * 1000) / 10;
        diffText = `+${diffPct.toFixed(1)}%`;
      }

      return {
        ...item,
        rank: idx + 1,
        medal,
        isWinner,
        diffPct,
        diffText
      };
    });
  }

  getBasketSavingsSummary() {
    let totalMercadonaEquiv = 0;
    let totalCompetitorActual = 0;
    let cheaperCount = 0;
    let expensiveCount = 0;

    for (const item of this.savedComparisons) {
      // Usar el coste equivalente de Mercadona para que el cálculo sea real con diferentes pesos y unidades
      const mCost = item.equivalentMercadonaCost !== undefined ? item.equivalentMercadonaCost : item.mercadonaPrice;
      const cCost = item.actualCompetitorCost !== undefined ? item.actualCompetitorCost : item.competitorPrice;

      totalMercadonaEquiv += mCost;
      totalCompetitorActual += cCost;

      if (item.verdict === 'cheaper') cheaperCount++;
      else if (item.verdict === 'expensive') expensiveCount++;
    }

    const netSavings = totalMercadonaEquiv - totalCompetitorActual;
    return {
      count: this.savedComparisons.length,
      totalMercadona: Math.round(totalMercadonaEquiv * 100) / 100,
      totalCompetitor: Math.round(totalCompetitorActual * 100) / 100,
      netSavings: Math.round(netSavings * 100) / 100,
      cheaperCount,
      expensiveCount
    };
  }
}
