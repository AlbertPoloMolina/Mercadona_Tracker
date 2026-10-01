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
  if (!name) return { mode: 'direct', qty: 1, unit: 'ud' };
  const upper = name.toUpperCase();

  // Volumen: 1,5L, 1L, 330ML, 500ML
  const mVol = upper.match(/(\d+(?:[.,]\d+)?)\s*(L|ML|CL)\b/);
  if (mVol) {
    const qty = parseFloat(mVol[1].replace(',', '.'));
    const rawUnit = mVol[2];
    const unit = rawUnit === 'ML' ? 'ml' : (rawUnit === 'CL' ? 'cl' : 'L');
    return { mode: 'weight', qty, unit, isVolume: true };
  }

  // Peso: 500G, 250 GR, 1KG, 1,5KG
  const mWeight = upper.match(/(\d+(?:[.,]\d+)?)\s*(KG|G|GR)\b/);
  if (mWeight) {
    const qty = parseFloat(mWeight[1].replace(',', '.'));
    const unit = ['G', 'GR'].includes(mWeight[2]) ? 'g' : 'kg';
    return { mode: 'weight', qty, unit, isVolume: false };
  }

  // Unidades: 12 HUEVOS, 24 UNID, PACK-3, 40 B., 4 UDS
  const mPack = upper.match(/\b(?:PACK|PK|X)\s*[-]?\s*(\d+)\b/);
  if (mPack) {
    return { mode: 'units', qty: parseInt(mPack[1], 10), unit: 'uds' };
  }

  const mUnits = upper.match(/(\d+)\s*(?:UDS|UNID|BOLSAS|B\.|BOCADILLOS|HUEVOS)\b/);
  if (mUnits) {
    return { mode: 'units', qty: parseInt(mUnits[1], 10), unit: 'uds' };
  }

  const mStart = upper.match(/^(\d+)\s+([A-Z]+)/);
  if (mStart) {
    const val = parseInt(mStart[1], 10);
    if ([2, 3, 4, 5, 6, 8, 10, 12, 18, 20, 24, 30, 40, 50].includes(val)) {
      return { mode: 'units', qty: val, unit: 'uds' };
    }
  }

  return { mode: 'direct', qty: 1, unit: 'envase' };
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
      productName: calcResult.product.name,
      mode: calcResult.mode,
      unitLabel: calcResult.unitLabel,
      mercadonaPrice: calcResult.mercadonaRawPrice,
      competitorName: calcResult.competitorName,
      competitorPrice: calcResult.competitorRawPrice,
      equivalentMercadonaCost: calcResult.equivalentMercadonaCost,
      actualCompetitorCost: calcResult.actualCompetitorCost,
      packageSavings: calcResult.packageSavings,
      diffPct: calcResult.diffPct,
      detailLabel: calcResult.detailLabel,
      verdict: calcResult.verdict
    };

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
