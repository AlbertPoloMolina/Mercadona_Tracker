/**
 * Módulo de Optimización de Compra (Organizador y Carro Optimizado Multi-Tienda)
 * - Calcula la estimación total por supermercado individual (monotienda)
 * - Calcula la ruta y reparto óptimo multi-tienda para maximizar el ahorro
 */

export class ShoppingOptimizer {
  constructor() {
    this.supermarkets = [];
    this.canonicalProducts = new Map(); // id -> canonical
    this.storeProducts = [];           // todos los productos de tienda
  }

  setData({ supermarkets = [], canonicalProducts = [], storeProducts = [] }) {
    this.supermarkets = supermarkets;
    this.canonicalProducts = new Map(canonicalProducts.map(c => [c.id, c]));
    this.storeProducts = storeProducts;
  }

  /**
   * Obtiene las ofertas de todas las tiendas para un producto canónico
   * @param {string} canonicalId
   */
  getStoreOffersForCanonical(canonicalId) {
    return this.storeProducts.filter(sp => sp.canonical_product_id === canonicalId);
  }

  /**
   * Calcula el balance de la lista de compra:
   * 1. Totales monotienda por cada supermercado
   * 2. Carro optimizado multi-tienda
   * 
   * @param {Array} shoppingList - Lista de items { id, canonical_product_id, target_quantity, checked }
   */
  optimize(shoppingList = []) {
    if (!shoppingList || shoppingList.length === 0) {
      return {
        isEmpty: true,
        totalItemsCount: 0,
        singleStoreEstimates: [],
        multiStorePlan: null,
        bestSingleStore: null
      };
    }

    const activeList = shoppingList.map(item => {
      const canonical = this.canonicalProducts.get(item.canonical_product_id) || {
        id: item.canonical_product_id,
        name: 'Producto desconocido',
        base_unit: 'ud'
      };
      const offers = this.getStoreOffersForCanonical(item.canonical_product_id);
      return {
        ...item,
        canonical,
        qty: parseFloat(item.target_quantity) || 1,
        offers
      };
    });

    // 1. CÁLCULO MONOTIENDA (¿Cuánto costaría comprar todo en un único supermercado?)
    const singleStoreEstimates = [];
    const allSupermarketIds = this.supermarkets.length > 0 
      ? this.supermarkets.map(s => s.id)
      : ['mercadona', 'family-cash', 'lidl', 'carrefour', 'dia', 'aldi', 'alcampo', 'consum'];

    for (const supId of allSupermarketIds) {
      const supMeta = this.supermarkets.find(s => s.id === supId) || {
        id: supId,
        name: supId.replace('-', ' ').toUpperCase(),
        color: '#666',
        icon: '🏪'
      };

      let totalCost = 0;
      let availableCount = 0;
      const itemBreakdown = [];
      const missingItems = [];

      for (const item of activeList) {
        // Buscar el producto de esta tienda
        const storeOffer = item.offers.find(o => o.supermarket_id === supId);
        if (storeOffer) {
          const itemCost = storeOffer.last_price * item.qty;
          totalCost += itemCost;
          availableCount++;
          itemBreakdown.push({
            item,
            storeOffer,
            itemCost: Math.round(itemCost * 100) / 100,
            unitPrice: storeOffer.last_unit_price
          });
        } else {
          missingItems.push(item);
        }
      }

      // Solo mostramos supermercados que tengan al menos 1 producto registrado
      if (availableCount > 0) {
        singleStoreEstimates.push({
          supermarket: supMeta,
          totalCost: Math.round(totalCost * 100) / 100,
          availableCount,
          totalItems: activeList.length,
          coveragePct: Math.round((availableCount / activeList.length) * 100),
          isComplete: availableCount === activeList.length,
          itemBreakdown,
          missingItems
        });
      }
    }

    // Ordenar de más barato a más caro (priorizando los que tienen lista completa)
    singleStoreEstimates.sort((a, b) => {
      if (a.isComplete && !b.isComplete) return -1;
      if (!a.isComplete && b.isComplete) return 1;
      return a.totalCost - b.totalCost;
    });

    const bestSingleStore = singleStoreEstimates.find(s => s.isComplete) || singleStoreEstimates[0] || null;

    // 2. CÁLCULO DEL CARRO OPTIMIZADO MULTI-TIENDA
    let optimizedTotal = 0;
    const itemsByStore = new Map(); // supermarket_id -> [ items ]
    const unassignedItems = [];

    for (const item of activeList) {
      if (!item.offers || item.offers.length === 0) {
        unassignedItems.push(item);
        continue;
      }

      // Ordenar ofertas por menor precio
      const sortedOffers = [...item.offers].sort((a, b) => {
        // Comparamos por precio por unidad si existe, o por precio total
        const uA = a.last_unit_price || a.last_price;
        const uB = b.last_unit_price || b.last_price;
        return uA - uB;
      });

      const bestOffer = sortedOffers[0];
      const supId = bestOffer.supermarket_id;
      const itemCost = bestOffer.last_price * item.qty;
      optimizedTotal += itemCost;

      if (!itemsByStore.has(supId)) {
        const supMeta = this.supermarkets.find(s => s.id === supId) || {
          id: supId,
          name: supId.replace('-', ' ').toUpperCase(),
          color: '#666',
          icon: '🏪'
        };
        itemsByStore.set(supId, {
          supermarket: supMeta,
          subtotal: 0,
          items: []
        });
      }

      const storeBucket = itemsByStore.get(supId);
      storeBucket.subtotal = Math.round((storeBucket.subtotal + itemCost) * 100) / 100;
      storeBucket.items.push({
        item,
        bestOffer,
        itemCost: Math.round(itemCost * 100) / 100,
        otherOffers: sortedOffers.slice(1)
      });
    }

    optimizedTotal = Math.round(optimizedTotal * 100) / 100;

    // Calcular ahorro frente al mejor monotienda
    let savingsVsBestSingle = 0;
    let savingsPct = 0;
    if (bestSingleStore && bestSingleStore.totalCost > optimizedTotal) {
      savingsVsBestSingle = Math.round((bestSingleStore.totalCost - optimizedTotal) * 100) / 100;
      savingsPct = Math.round((savingsVsBestSingle / bestSingleStore.totalCost) * 1000) / 10;
    }

    const multiStorePlan = {
      optimizedTotal,
      storesCount: itemsByStore.size,
      storesPlan: Array.from(itemsByStore.values()).sort((a, b) => b.subtotal - a.subtotal),
      unassignedItems,
      savingsVsBestSingle,
      savingsPct,
      bestSingleStoreName: bestSingleStore ? bestSingleStore.supermarket.name : null
    };

    return {
      isEmpty: false,
      totalItemsCount: activeList.length,
      singleStoreEstimates,
      bestSingleStore,
      multiStorePlan
    };
  }
}
