/**
 * Controlador Principal del Dashboard de Precios de Mercadona
 */

import { parseExcelWorkbook } from './excel-parser.js';
import { SupermarketComparator, detectProductFormat } from './comparator.js';
import { renderPriceChart, destroyActiveChart } from './chart-manager.js';
import { GitHubSyncManager } from './github-sync.js';

class MercadonaApp {
  constructor() {
    this.data = {
      metadata: null,
      categories: [],
      products: []
    };

    this.filters = {
      search: '',
      category: 'Todas',
      status: 'all',
      sort: 'frequent-desc',
      viewMode: 'cards'
    };

    this.comparator = new SupermarketComparator([]);
    this.githubSync = new GitHubSyncManager();
    this.activeProduct = null;
    this.selectedCompetitor = 'Carrefour';
    this.compMode = 'direct'; // 'direct' | 'weight' | 'units'

    this.init();
  }

  async init() {
    this.initTheme();
    this.setupEventListeners();
    await this.loadData();
    this.renderAll();
  }

  /* ========================================================================
     GESTIÓN DE TEMA (DARK / LIGHT)
     ======================================================================== */
  initTheme() {
    const savedTheme = localStorage.getItem('mercadona_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
      toggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mercadona_theme', next);
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
      toggleBtn.textContent = next === 'dark' ? '☀️' : '🌙';
    }
    // Re-render chart if open to match theme colors
    if (this.activeProduct) {
      const canvas = document.getElementById('product-price-chart');
      renderPriceChart(canvas, this.activeProduct);
    }
  }

  /* ========================================================================
     CARGA DE DATOS (JSON -> EXCEL -> LOCAL STORAGE)
     ======================================================================== */
  async loadData() {
    // 1. Intentar cargar desde caché de localStorage para arranque instantáneo (<5ms)
    try {
      const cached = localStorage.getItem('mercadona_data_cache');
      if (cached) {
        this.data = JSON.parse(cached);
        this.comparator.setProducts(this.data.products);
        this.updateSettingsMeta('Caché local (Instantánea)');
      }
    } catch (e) {
      console.warn('Error leyendo caché:', e);
    }

    // 2. Intentar cargar data/precios.json (más rápido y ligero)
    let loaded = false;
    try {
      const resp = await fetch('data/precios.json?t=' + Date.now());
      if (resp.ok) {
        const json = await resp.json();
        if (json.products && json.products.length > 0) {
          this.data = json;
          this.comparator.setProducts(this.data.products);
          localStorage.setItem('mercadona_data_cache', JSON.stringify(this.data));
          this.updateSettingsMeta('data/precios.json (Actualizado)');
          loaded = true;
        }
      }
    } catch (e) {
      console.log('No se pudo cargar data/precios.json directamente, intentando archivo Excel...');
    }

    // 3. Si no se cargó el JSON, intentar leer precios_productos.xlsx directamente
    if (!loaded) {
      const customUrl = localStorage.getItem('mercadona_github_url') || 'precios_productos.xlsx';
      try {
        const resp = await fetch(customUrl);
        if (resp.ok) {
          const buffer = await resp.arrayBuffer();
          const parsed = parseExcelWorkbook(buffer);
          this.data = parsed;
          this.comparator.setProducts(this.data.products);
          localStorage.setItem('mercadona_data_cache', JSON.stringify(this.data));
          this.updateSettingsMeta(customUrl);
          loaded = true;
        }
      } catch (err) {
        console.warn('Error al leer precios_productos.xlsx:', err);
      }
    }

    if (!loaded && (!this.data.products || this.data.products.length === 0)) {
      console.error('No se pudieron cargar los datos.');
    }
  }

  updateSettingsMeta(sourceName) {
    const srcEl = document.getElementById('settings-data-source');
    const syncEl = document.getElementById('settings-last-sync');
    if (srcEl) srcEl.textContent = sourceName;
    if (syncEl && this.data.metadata) {
      const dt = new Date(this.data.metadata.generatedAt || Date.now());
      syncEl.textContent = dt.toLocaleString('es-ES');
    }
  }

  /* ========================================================================
     EVENT LISTENERS & NAVEGACIÓN
     ======================================================================== */
  setupEventListeners() {
    // Theme toggle
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => this.toggleTheme());

    // Navigation Tabs (Desktop & Mobile)
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetView = btn.getAttribute('data-view');
        this.switchView(targetView);
      });
    });

    document.getElementById('brand-home-btn')?.addEventListener('click', () => {
      this.switchView('catalog');
    });

    document.getElementById('btn-quick-compare')?.addEventListener('click', () => {
      this.switchView('comparator');
    });

    // Settings Modal
    document.getElementById('settings-open-btn')?.addEventListener('click', () => this.openSettingsModal());
    document.getElementById('mobile-settings-btn')?.addEventListener('click', () => this.openSettingsModal());
    document.getElementById('settings-close-btn')?.addEventListener('click', () => this.closeSettingsModal());
    document.getElementById('settings-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'settings-modal') this.closeSettingsModal();
    });

    // Search Box
    const searchInput = document.getElementById('product-search-input');
    const clearBtn = document.getElementById('search-clear-btn');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filters.search = e.target.value.trim();
        if (clearBtn) {
          clearBtn.classList.toggle('visible', this.filters.search.length > 0);
        }
        this.renderProductsList();
      });

      // Atajo de teclado: Ctrl/Cmd + K
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          this.switchView('catalog');
          searchInput.focus();
        }
      });
    }

    clearBtn?.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        this.filters.search = '';
        clearBtn.classList.remove('visible');
        this.renderProductsList();
        searchInput.focus();
      }
    });

    // Sort Select
    document.getElementById('sort-select')?.addEventListener('change', (e) => {
      this.filters.sort = e.target.value;
      this.renderProductsList();
    });

    // View Mode Toggle (Cards vs Table)
    document.getElementById('view-cards-btn')?.addEventListener('click', () => this.setViewMode('cards'));
    document.getElementById('view-table-btn')?.addEventListener('click', () => this.setViewMode('table'));

    // Status Pills
    document.querySelectorAll('.status-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.status-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.filters.status = pill.getAttribute('data-status');
        this.renderProductsList();
      });
    });

    // Product Detail Modal Close
    document.getElementById('modal-close-btn')?.addEventListener('click', () => this.closeProductModal());
    document.getElementById('product-detail-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'product-detail-modal') this.closeProductModal();
    });

    // Comparator in Detail Modal
    document.getElementById('modal-btn-compare')?.addEventListener('click', () => {
      if (this.activeProduct) {
        const prod = this.activeProduct;
        this.closeProductModal();
        this.switchView('comparator');
        this.setupComparatorWithProduct(prod);
      }
    });

    // In-Store Comparator Events
    this.setupComparatorEvents();

    // Excel Drag & Drop & Upload
    this.setupDropzoneEvents();

    // Force Reload Button
    document.getElementById('btn-force-reload')?.addEventListener('click', async () => {
      localStorage.removeItem('mercadona_data_cache');
      await this.loadData();
      this.renderAll();
      this.closeSettingsModal();
      alert('Datos recargados con éxito.');
    });

    // Save custom GitHub URL
    document.getElementById('btn-save-github-url')?.addEventListener('click', async () => {
      const input = document.getElementById('github-url-input');
      if (input && input.value.trim()) {
        localStorage.setItem('mercadona_github_url', input.value.trim());
        localStorage.removeItem('mercadona_data_cache');
        await this.loadData();
        this.renderAll();
        this.closeSettingsModal();
        alert('URL de GitHub guardada y datos sincronizados.');
      }
    });

    // Configurar y probar conexión con GitHub API (Opción A)
    document.getElementById('btn-save-github-sync')?.addEventListener('click', async () => {
      const owner = document.getElementById('github-owner-input')?.value.trim();
      const repo = document.getElementById('github-repo-input')?.value.trim();
      const branch = document.getElementById('github-branch-input')?.value.trim() || 'main';
      const token = document.getElementById('github-token-input')?.value.trim();
      const autoSync = document.getElementById('github-autosync-checkbox')?.checked;
      const feedback = document.getElementById('github-sync-feedback');

      if (!token || !owner || !repo) {
        if (feedback) {
          feedback.style.display = 'block';
          feedback.style.background = 'rgba(239, 68, 68, 0.15)';
          feedback.style.color = 'var(--danger)';
          feedback.textContent = '⚠️ Por favor rellena Usuario, Repositorio y Token.';
        }
        return;
      }

      this.githubSync.saveConfig({ owner, repo, branch, token, autoSync });

      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.background = 'rgba(14, 165, 233, 0.15)';
        feedback.style.color = 'var(--primary)';
        feedback.textContent = '⏳ Verificando credenciales con GitHub API...';
      }

      try {
        const res = await this.githubSync.testConnection();
        if (feedback) {
          feedback.style.background = 'rgba(16, 185, 129, 0.15)';
          feedback.style.color = 'var(--success)';
          feedback.textContent = `✅ ¡Conexión con éxito! Repositorio ${res.repoName} (${res.private ? 'Privado' : 'Público'}) verificado.`;
        }
      } catch (err) {
        if (feedback) {
          feedback.style.background = 'rgba(239, 68, 68, 0.15)';
          feedback.style.color = 'var(--danger)';
          feedback.textContent = `❌ Error: ${err.message}`;
        }
      }
    });
  }

  /* ========================================================================
     VISTAS Y NAVEGACIÓN
     ======================================================================== */
  switchView(viewName) {
    // Hide all view sections
    document.querySelectorAll('.view-section').forEach(sec => sec.style.display = 'none');

    // Show target section
    const targetSection = document.getElementById(`view-${viewName}`);
    if (targetSection) targetSection.style.display = 'block';

    // Update Desktop Nav Tabs
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });

    // Update Mobile Nav Tabs
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });

    if (viewName === 'trends') {
      this.renderTrendsView();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  setViewMode(mode) {
    this.filters.viewMode = mode;
    const cardsGrid = document.getElementById('products-grid');
    const tableWrapper = document.getElementById('products-table-wrapper');
    const btnCards = document.getElementById('view-cards-btn');
    const btnTable = document.getElementById('view-table-btn');

    if (mode === 'cards') {
      cardsGrid.style.display = 'grid';
      tableWrapper.style.display = 'none';
      btnCards?.classList.add('active');
      btnTable?.classList.remove('active');
    } else {
      cardsGrid.style.display = 'none';
      tableWrapper.style.display = 'block';
      btnCards?.classList.remove('active');
      btnTable?.classList.add('active');
    }
    this.renderProductsList();
  }

  /* ========================================================================
     RENDER PRINCIPAL
     ======================================================================== */
  renderAll() {
    this.renderStatsBanner();
    this.renderCategoriesChips();
    this.renderProductsList();
    this.renderBasketSidebar();
  }

  renderStatsBanner() {
    const meta = this.data.metadata || {};
    const products = this.data.products || [];

    const totalProdEl = document.getElementById('stat-total-products');
    const subtextProdEl = document.getElementById('stat-products-subtext');
    const totalTicketsEl = document.getElementById('stat-total-tickets');
    const dateRangeEl = document.getElementById('stat-date-range');
    const atMinEl = document.getElementById('stat-at-min');
    const inflationEl = document.getElementById('stat-avg-inflation');

    if (totalProdEl) totalProdEl.textContent = products.length.toLocaleString('es-ES');
    if (subtextProdEl) subtextProdEl.textContent = 'En base de datos';
    if (totalTicketsEl) totalTicketsEl.textContent = (meta.totalTickets || 0).toLocaleString('es-ES');
    
    if (dateRangeEl && meta.dateRange) {
      dateRangeEl.textContent = `${meta.dateRange.first} — ${meta.dateRange.last}`;
    }

    // Calcular cuántos están en su mínimo histórico
    const atMinCount = products.filter(p => p.lastPrice <= p.minPrice).length;
    if (atMinEl) atMinEl.textContent = atMinCount;

    // Calcular inflación media (% de subida respecto a precio inicial/mínimo)
    const validInflation = products.filter(p => p.changeMinPct > 0).map(p => p.changeMinPct);
    const avgInf = validInflation.length > 0 
      ? Math.round((validInflation.reduce((a, b) => a + b, 0) / validInflation.length) * 10) / 10 
      : 0;
    if (inflationEl) inflationEl.textContent = `+${avgInf}%`;
  }

  renderCategoriesChips() {
    const container = document.getElementById('categories-scroll');
    if (!container) return;

    container.innerHTML = '';
    const categories = this.data.categories || ['Todas'];

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `category-chip ${this.filters.category === cat ? 'active' : ''}`;
      
      // Contar productos en esta categoría
      let count = 0;
      if (cat === 'Todas') {
        count = (this.data.products || []).length;
      } else {
        count = (this.data.products || []).filter(p => p.category === cat).length;
      }

      btn.innerHTML = `${cat} <span style="opacity: 0.75; font-size: 0.76rem;">(${count})</span>`;
      btn.addEventListener('click', () => {
        this.filters.category = cat;
        document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        this.renderProductsList();
      });

      container.appendChild(btn);
    });
  }

  getFilteredAndSortedProducts() {
    let list = [...(this.data.products || [])];

    // 1. Filtro por búsqueda
    if (this.filters.search) {
      const q = this.filters.search.toUpperCase();
      const tokens = q.split(/\s+/).filter(Boolean);
      list = list.filter(p => {
        const name = p.name.toUpperCase();
        return tokens.every(tok => name.includes(tok));
      });
    }

    // 2. Filtro por Categoría
    if (this.filters.category && this.filters.category !== 'Todas') {
      list = list.filter(p => p.category === this.filters.category);
    }

    // 3. Filtro por Estado
    if (this.filters.status === 'frequent') {
      list = list.filter(p => p.totalPurchases >= 5);
    } else if (this.filters.status === 'up') {
      list = list.filter(p => p.trend === 'up');
    } else if (this.filters.status === 'down') {
      list = list.filter(p => p.trend === 'down');
    } else if (this.filters.status === 'at-min') {
      list = list.filter(p => p.lastPrice <= p.minPrice);
    }

    // 4. Ordenación
    const sort = this.filters.sort;
    list.sort((a, b) => {
      if (sort === 'frequent-desc') return b.totalPurchases - a.totalPurchases;
      if (sort === 'recent-desc') return (b.lastDateISO || '').localeCompare(a.lastDateISO || '');
      if (sort === 'price-asc') return a.lastPrice - b.lastPrice;
      if (sort === 'price-desc') return b.lastPrice - a.lastPrice;
      if (sort === 'diff-desc') return (b.changeMinPct || 0) - (a.changeMinPct || 0);
      if (sort === 'name-asc') return a.name.localeCompare(b.name, 'es');
      return 0;
    });

    return list;
  }

  renderProductsList() {
    const list = this.getFilteredAndSortedProducts();
    const countEl = document.getElementById('results-count');
    const emptyState = document.getElementById('empty-state');
    const grid = document.getElementById('products-grid');
    const tableBody = document.getElementById('products-table-body');

    if (countEl) countEl.textContent = `Mostrando ${list.length} de ${this.data.products.length} productos`;

    if (list.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (grid) grid.innerHTML = '';
      if (tableBody) tableBody.innerHTML = '';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    if (this.filters.viewMode === 'cards') {
      this.renderCardsGrid(list);
    } else {
      this.renderTableView(list);
    }
  }

  renderCardsGrid(products) {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Renderizado en lotes para máxima fluidez si hay muchos productos
    const slice = products.slice(0, 90);

    slice.forEach(prod => {
      const card = document.createElement('article');
      card.className = 'product-card';
      card.setAttribute('data-id', prod.id);

      // Trend tag
      let trendHtml = '';
      if (prod.trend === 'up') {
        trendHtml = `<span class="price-trend-tag trend-up" title="Ha subido respecto a la compra anterior">🔺 +${Math.abs(prod.changePrev).toFixed(2)}€</span>`;
      } else if (prod.trend === 'down') {
        trendHtml = `<span class="price-trend-tag trend-down" title="Ha bajado respecto a la compra anterior">🔻 -${Math.abs(prod.changePrev).toFixed(2)}€</span>`;
      } else {
        trendHtml = `<span class="price-trend-tag trend-stable" title="Precio estable">Estable</span>`;
      }

      // Range Bar position
      let rangePercent = 50;
      if (prod.maxPrice > prod.minPrice) {
        rangePercent = Math.min(100, Math.max(0, ((prod.lastPrice - prod.minPrice) / (prod.maxPrice - prod.minPrice)) * 100));
      }

      // Format Variants pills
      let variantsHtml = '';
      if (prod.variants && prod.variants.length > 0) {
        const pills = prod.variants.map(v => `<span class="variant-pill" data-variant-name="${v}">${v}</span>`).join('');
        variantsHtml = `
          <div class="card-variants-row">
            <span>Formatos relacionados:</span>
            <div class="variants-pills">${pills}</div>
          </div>
        `;
      }

      card.innerHTML = `
        <div>
          <div class="card-header">
            <span class="card-category-badge" title="${prod.category}">${prod.category}</span>
            <span class="card-purchases-badge" title="Veces comprado">🛒 ${prod.totalPurchases} ${prod.totalPurchases === 1 ? 'ticket' : 'tickets'}</span>
          </div>

          <h3 class="card-title" title="${prod.name}">${prod.name}</h3>

          <div class="card-price-hero">
            <div class="price-main-box">
              <span class="price-main-label">Último Precio (${prod.lastDate})</span>
              <span class="price-main-value">${prod.lastPrice.toFixed(2)} €</span>
            </div>
            ${trendHtml}
          </div>

          <div class="card-stats-triple">
            <div class="stat-mini-item">
              <span class="stat-mini-label">Mínimo</span>
              <span class="stat-mini-val min-val">${prod.minPrice.toFixed(2)} €</span>
            </div>
            <div class="stat-mini-item">
              <span class="stat-mini-label">Media</span>
              <span class="stat-mini-val">${prod.avgPrice.toFixed(2)} €</span>
            </div>
            <div class="stat-mini-item">
              <span class="stat-mini-label">Máximo</span>
              <span class="stat-mini-val max-val">${prod.maxPrice.toFixed(2)} €</span>
            </div>
          </div>

          <div class="card-range-indicator" title="Posición del último precio en el rango histórico">
            <div class="range-bar-track">
              <div class="range-bar-marker" style="left: ${rangePercent}%;"></div>
            </div>
          </div>

          ${variantsHtml}
        </div>

        <div class="card-actions">
          <button class="btn-card-compare" data-action="compare" title="Comparar precio en otro supermercado">
            <span>⚡</span> Comparar en Tienda
          </button>
          <button class="btn-card-history" data-action="history" title="Ver historial de precios y gráfico">
            📈
          </button>
        </div>
      `;

      // Event listeners en la tarjeta
      card.querySelector('[data-action="history"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openProductModal(prod);
      });

      card.querySelector('[data-action="compare"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchView('comparator');
        this.setupComparatorWithProduct(prod);
      });

      // Click general en la tarjeta abre el detalle
      card.addEventListener('click', () => {
        this.openProductModal(prod);
      });

      // Variant pills click
      card.querySelectorAll('.variant-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          const variantName = pill.getAttribute('data-variant-name');
          const found = this.data.products.find(p => p.name === variantName);
          if (found) {
            this.openProductModal(found);
          }
        });
      });

      grid.appendChild(card);
    });
  }

  renderTableView(products) {
    const tbody = document.getElementById('products-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    products.slice(0, 150).forEach(prod => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';

      tr.innerHTML = `
        <td style="font-weight: 700;">${prod.name}</td>
        <td><span class="card-category-badge">${prod.category}</span></td>
        <td style="font-weight: 800; color: var(--primary); font-size: 1rem;">${prod.lastPrice.toFixed(2)} €</td>
        <td style="color: var(--success); font-weight: 600;">${prod.minPrice.toFixed(2)} €</td>
        <td style="color: var(--danger); font-weight: 600;">${prod.maxPrice.toFixed(2)} €</td>
        <td>${prod.avgPrice.toFixed(2)} €</td>
        <td>${prod.totalPurchases}</td>
        <td>${prod.lastDate}</td>
        <td>
          <button class="btn-card-compare" style="padding: 0.35rem 0.65rem;" data-action="compare-table">
            ⚡ Comparar
          </button>
        </td>
      `;

      tr.addEventListener('click', () => this.openProductModal(prod));
      tr.querySelector('[data-action="compare-table"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchView('comparator');
        this.setupComparatorWithProduct(prod);
      });

      tbody.appendChild(tr);
    });
  }

  /* ========================================================================
     MODAL DE DETALLE Y GRÁFICO HISTÓRICO
     ======================================================================== */
  openProductModal(product) {
    this.activeProduct = product;
    const modal = document.getElementById('product-detail-modal');
    if (!modal) return;

    document.getElementById('modal-product-title').textContent = product.name;
    document.getElementById('modal-product-cat').textContent = product.category;

    document.getElementById('modal-stat-last').textContent = `${product.lastPrice.toFixed(2)} €`;
    document.getElementById('modal-stat-last-date').textContent = product.lastDate;

    document.getElementById('modal-stat-min').textContent = `${product.minPrice.toFixed(2)} €`;
    document.getElementById('modal-stat-min-date').textContent = product.minDate;

    document.getElementById('modal-stat-max').textContent = `${product.maxPrice.toFixed(2)} €`;
    document.getElementById('modal-stat-max-date').textContent = product.maxDate;

    document.getElementById('modal-stat-avg').textContent = `${product.avgPrice.toFixed(2)} €`;
    document.getElementById('modal-stat-count').textContent = `${product.totalPurchases} ${product.totalPurchases === 1 ? 'ticket' : 'tickets'}`;

    const changeMin = product.changeMinPct;
    const changeMinEl = document.getElementById('modal-stat-change');
    if (changeMinEl) {
      changeMinEl.textContent = changeMin > 0 ? `+${changeMin}%` : 'En mínimo';
      changeMinEl.style.color = changeMin > 0 ? 'var(--danger)' : 'var(--success)';
    }

    // Renderizar gráfico con Chart.js
    const canvas = document.getElementById('product-price-chart');
    setTimeout(() => {
      renderPriceChart(canvas, product);
    }, 50);

    // Formatos / Variantes en el modal
    const variantsSection = document.getElementById('modal-variants-section');
    const variantsList = document.getElementById('modal-variants-list');
    if (variantsSection && variantsList) {
      if (product.variants && product.variants.length > 0) {
        variantsSection.style.display = 'block';
        variantsList.innerHTML = product.variants.map(v => {
          const related = this.data.products.find(p => p.name === v);
          const priceTag = related ? ` (${related.lastPrice.toFixed(2)} €)` : '';
          return `<button class="variant-pill" data-vname="${v}">${v}${priceTag}</button>`;
        }).join('');

        variantsList.querySelectorAll('.variant-pill').forEach(btn => {
          btn.addEventListener('click', () => {
            const vname = btn.getAttribute('data-vname');
            const found = this.data.products.find(p => p.name === vname);
            if (found) this.openProductModal(found);
          });
        });
      } else {
        variantsSection.style.display = 'none';
      }
    }

    // Tabla del historial de compras
    const tbody = document.getElementById('modal-history-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      const history = [...(product.history || [])].reverse(); // del más reciente al más antiguo

      history.forEach((item, idx) => {
        const tr = document.createElement('tr');
        
        let deltaHtml = '<span style="color: var(--text-muted);">-</span>';
        if (idx < history.length - 1) {
          const prevItem = history[idx + 1];
          const diff = Math.round((item.price - prevItem.price) * 100) / 100;
          if (diff > 0.01) {
            deltaHtml = `<span style="color: var(--danger); font-weight: 600;">+${diff.toFixed(2)} € ↗</span>`;
          } else if (diff < -0.01) {
            deltaHtml = `<span style="color: var(--success); font-weight: 600;">${diff.toFixed(2)} € ↘</span>`;
          } else {
            deltaHtml = `<span style="color: var(--text-muted);">0.00 € =</span>`;
          }
        }

        tr.innerHTML = `
          <td><strong>${item.date}</strong></td>
          <td style="font-weight: 800; color: var(--text-primary); font-size: 0.95rem;">${item.price.toFixed(2)} €</td>
          <td>${deltaHtml}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  closeProductModal() {
    const modal = document.getElementById('product-detail-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    destroyActiveChart();
    this.activeProduct = null;
  }

  /* ========================================================================
     COMPARADOR EN TIENDA
     ======================================================================== */
  setupComparatorEvents() {
    const searchInput = document.getElementById('comp-product-search');
    const dropdown = document.getElementById('comp-product-dropdown');
    const priceInput = document.getElementById('comp-price-input');

    // Tabs de modo de comparativa (Directo, Peso/Volumen, Unidades)
    document.querySelectorAll('.comp-mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.compMode = tab.getAttribute('data-mode') || 'direct';
        this.updateComparatorModeUI();
        this.triggerComparisonCalculation();
      });
    });

    // Supermarket buttons
    document.querySelectorAll('.supermarket-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.supermarket-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedCompetitor = btn.getAttribute('data-name');
        
        // Actualizar textos
        const compTitle = document.getElementById('comp-competitor-title');
        const weightLabel = document.getElementById('label-weight-comp');
        const unitsLabel = document.getElementById('label-units-comp');
        if (compTitle) compTitle.textContent = `Precio en ${this.selectedCompetitor}`;
        if (weightLabel) weightLabel.textContent = `Peso / Volumen en ${this.selectedCompetitor}:`;
        if (unitsLabel) unitsLabel.textContent = `Unidades en el pack ${this.selectedCompetitor}:`;

        this.triggerComparisonCalculation();
      });
    });

    // Product search autocompletion
    searchInput?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toUpperCase();
      if (q.length < 2) {
        if (dropdown) dropdown.style.display = 'none';
        return;
      }

      const matches = this.data.products.filter(p => p.name.toUpperCase().includes(q)).slice(0, 8);
      if (dropdown) {
        if (matches.length > 0) {
          dropdown.style.display = 'block';
          dropdown.innerHTML = matches.map(p => `
            <div class="dropdown-item" data-id="${p.id}" style="padding: 0.65rem 0.85rem; cursor: pointer; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong>${p.name}</strong>
                <div style="font-size: 0.76rem; color: var(--text-muted);">${p.category}</div>
              </div>
              <span style="font-weight: 800; color: var(--primary);">${p.lastPrice.toFixed(2)} €</span>
            </div>
          `).join('');

          dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
              const id = item.getAttribute('data-id');
              const selected = this.data.products.find(p => p.id === id);
              if (selected) {
                this.setupComparatorWithProduct(selected);
              }
              dropdown.style.display = 'none';
            });
          });
        } else {
          dropdown.style.display = 'none';
        }
      }
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!searchInput?.contains(e.target) && !dropdown?.contains(e.target)) {
        if (dropdown) dropdown.style.display = 'none';
      }
    });

    // Inputs que disparan recálculo inmediato
    priceInput?.addEventListener('input', () => this.triggerComparisonCalculation());
    
    // Peso / Volumen inputs
    document.getElementById('merc-weight-qty')?.addEventListener('input', () => this.triggerComparisonCalculation());
    document.getElementById('merc-weight-unit')?.addEventListener('change', () => this.triggerComparisonCalculation());
    document.getElementById('comp-weight-qty')?.addEventListener('input', () => this.triggerComparisonCalculation());
    document.getElementById('comp-weight-unit')?.addEventListener('change', () => this.triggerComparisonCalculation());

    // Unidades inputs
    document.getElementById('merc-units-qty')?.addEventListener('input', () => this.triggerComparisonCalculation());
    document.getElementById('comp-units-qty')?.addEventListener('input', () => this.triggerComparisonCalculation());

    // Save comparison button
    document.getElementById('btn-save-comparison')?.addEventListener('click', async () => {
      const result = this.lastCalcResult;
      if (result && !result.error) {
        const savedItem = this.comparator.saveComparison(result);
        this.renderBasketSidebar();

        if (this.githubSync.config.autoSync && this.githubSync.isConfigured()) {
          try {
            await this.githubSync.syncToGitHub([savedItem]);
            alert(`✅ Guardado en tu cesta y sincronizado automáticamente en GitHub (commit en data/precios_competencia.json):\n${result.product.name} en ${result.competitorName}`);
          } catch (syncErr) {
            console.warn('Error al auto-sincronizar con GitHub:', syncErr);
            alert(`✅ Guardado localmente en tu cesta.\n(Nota: No se pudo subir a GitHub: ${syncErr.message}. Puedes sincronizarlo luego con el botón ☁️).`);
          }
        } else {
          alert(`✅ Guardado en tu cesta: ${result.product.name} (${result.competitorName})`);
        }
      }
    });

    // Subir comparativas a GitHub (Botón manual en la cesta)
    document.getElementById('btn-sync-github')?.addEventListener('click', async () => {
      if (!this.githubSync.isConfigured()) {
        alert('Para subir a GitHub, introduce primero tu Token y Repositorio en Ajustes ⚙️.');
        this.openSettingsModal();
        return;
      }
      const items = this.comparator.savedComparisons;
      if (items.length === 0) {
        alert('No hay comparativas en la cesta para sincronizar.');
        return;
      }
      const btn = document.getElementById('btn-sync-github');
      const originalText = btn.innerHTML;
      try {
        btn.innerHTML = '<span>⏳</span> Subiendo a GitHub...';
        btn.disabled = true;
        const res = await this.githubSync.syncToGitHub(items);
        alert(`🎉 ¡Sincronización completada!\nSe ha creado un commit en tu repositorio en data/precios_competencia.json con ${res.totalSaved} registros guardados.`);
      } catch (err) {
        alert(`❌ Error al sincronizar con GitHub: ${err.message}`);
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });

    // Descargar CSV de las comparativas
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      const items = this.comparator.savedComparisons;
      if (items.length === 0) {
        alert('No hay comparativas en la cesta para exportar.');
        return;
      }
      this.exportComparisonsToCSV(items);
    });

    // Clear basket
    document.getElementById('btn-clear-basket')?.addEventListener('click', () => {
      if (confirm('¿Vaciar la lista de comparativas de esta compra?')) {
        this.comparator.clearComparisons();
        this.renderBasketSidebar();
      }
    });
  }

  updateComparatorModeUI() {
    // Actualizar botones de pestañas
    document.querySelectorAll('.comp-mode-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === this.compMode);
    });

    const controlsMerc = document.getElementById('comp-format-controls-merc');
    const controlsComp = document.getElementById('comp-format-controls-comp');
    const weightMerc = document.getElementById('format-weight-merc');
    const weightComp = document.getElementById('format-weight-comp');
    const unitsMerc = document.getElementById('format-units-merc');
    const unitsComp = document.getElementById('format-units-comp');
    const normSummary = document.getElementById('norm-summary-card');
    const compSubtext = document.getElementById('comp-subtext');

    if (this.compMode === 'direct') {
      if (controlsMerc) controlsMerc.style.display = 'none';
      if (controlsComp) controlsComp.style.display = 'none';
      if (normSummary) normSummary.style.display = 'none';
      if (compSubtext) compSubtext.textContent = 'Precio que ves en la etiqueta';
    } else if (this.compMode === 'weight') {
      if (controlsMerc) controlsMerc.style.display = 'block';
      if (controlsComp) controlsComp.style.display = 'block';
      if (weightMerc) weightMerc.style.display = 'block';
      if (weightComp) weightComp.style.display = 'block';
      if (unitsMerc) unitsMerc.style.display = 'none';
      if (unitsComp) unitsComp.style.display = 'none';
      if (compSubtext) compSubtext.textContent = 'Precio del envase en el competidor';
    } else if (this.compMode === 'units') {
      if (controlsMerc) controlsMerc.style.display = 'block';
      if (controlsComp) controlsComp.style.display = 'block';
      if (weightMerc) weightMerc.style.display = 'none';
      if (weightComp) weightComp.style.display = 'none';
      if (unitsMerc) unitsMerc.style.display = 'block';
      if (unitsComp) unitsComp.style.display = 'block';
      if (compSubtext) compSubtext.textContent = 'Precio del pack completo en el competidor';
    }
  }

  setupComparatorWithProduct(product) {
    this.comparator.selectProduct(product.id);
    const searchInput = document.getElementById('comp-product-search');
    if (searchInput) searchInput.value = product.name;

    const priceEl = document.getElementById('comp-mercadona-price');
    const detailsEl = document.getElementById('comp-mercadona-details');

    if (priceEl) priceEl.textContent = `${product.lastPrice.toFixed(2)} €`;
    if (detailsEl) {
      detailsEl.innerHTML = `
        Último: ${product.lastDate} | Mínimo: <strong>${product.minPrice.toFixed(2)} €</strong> | Media: ${product.avgPrice.toFixed(2)} €
      `;
    }

    // Detección automática de formato a partir del nombre del producto
    const detected = detectProductFormat(product.name);
    this.compMode = detected.mode || 'direct';

    if (detected.mode === 'weight') {
      const mWeightQty = document.getElementById('merc-weight-qty');
      const mWeightUnit = document.getElementById('merc-weight-unit');
      const cWeightQty = document.getElementById('comp-weight-qty');
      const cWeightUnit = document.getElementById('comp-weight-unit');

      if (mWeightQty) mWeightQty.value = detected.qty;
      if (mWeightUnit) mWeightUnit.value = detected.unit;
      if (cWeightQty) cWeightQty.value = detected.qty;
      if (cWeightUnit) cWeightUnit.value = detected.unit;
    } else if (detected.mode === 'units') {
      const mUnitsQty = document.getElementById('merc-units-qty');
      const cUnitsQty = document.getElementById('comp-units-qty');

      if (mUnitsQty) mUnitsQty.value = detected.qty;
      if (cUnitsQty) cUnitsQty.value = detected.qty;
    }

    this.updateComparatorModeUI();

    const priceInput = document.getElementById('comp-price-input');
    if (priceInput) {
      priceInput.focus();
    }

    this.triggerComparisonCalculation();
  }

  triggerComparisonCalculation() {
    const priceInput = document.getElementById('comp-price-input');
    const val = priceInput ? priceInput.value.trim() : '';

    const banner = document.getElementById('verdict-banner');
    const actions = document.getElementById('verdict-actions');
    const normSummary = document.getElementById('norm-summary-card');

    if (!val || !this.comparator.selectedProduct) {
      if (banner) banner.style.display = 'none';
      if (actions) actions.style.display = 'none';
      if (normSummary) normSummary.style.display = 'none';
      return;
    }

    // Parámetros según modo
    const params = {
      mode: this.compMode,
      competitorPrice: val,
      competitorName: this.selectedCompetitor
    };

    if (this.compMode === 'weight') {
      params.mercadonaQty = parseFloat(document.getElementById('merc-weight-qty')?.value || 1);
      params.mercadonaUnit = document.getElementById('merc-weight-unit')?.value || 'g';
      params.competitorQty = parseFloat(document.getElementById('comp-weight-qty')?.value || 1);
      params.competitorUnit = document.getElementById('comp-weight-unit')?.value || 'g';
    } else if (this.compMode === 'units') {
      params.mercadonaUnits = parseFloat(document.getElementById('merc-units-qty')?.value || 1);
      params.competitorUnits = parseFloat(document.getElementById('comp-units-qty')?.value || 1);
    }

    const result = this.comparator.calculate(params);
    this.lastCalcResult = result;

    if (result.error) {
      if (banner) banner.style.display = 'none';
      if (actions) actions.style.display = 'none';
      if (normSummary) normSummary.style.display = 'none';
      return;
    }

    // Actualizar etiquetas de precio unitario en las cajas
    if (this.compMode === 'weight') {
      const uLabel = result.unitLabel;
      const mercPill = document.getElementById('merc-unit-price-display');
      const compPill = document.getElementById('comp-unit-price-display');
      if (mercPill) mercPill.textContent = `${result.mercadonaUnitPrice.toFixed(2)} €/${uLabel}`;
      if (compPill) compPill.textContent = `${result.competitorUnitPrice.toFixed(2)} €/${uLabel}`;

      if (normSummary) {
        normSummary.style.display = 'block';
        document.getElementById('norm-merc-val').textContent = `${result.mercadonaUnitPrice.toFixed(2)} €/${uLabel}`;
        document.getElementById('norm-comp-label').textContent = `${this.selectedCompetitor}:`;
        document.getElementById('norm-comp-val').textContent = `${result.competitorUnitPrice.toFixed(2)} €/${uLabel}`;

        const diffPill = document.getElementById('norm-diff-pill');
        if (diffPill) {
          const isCheaper = result.verdict === 'cheaper';
          const isSame = result.verdict === 'same';
          diffPill.className = `norm-diff-pill ${result.verdictClass.replace('verdict-', '')}`;
          const absDiff = Math.abs(result.diffUnitPrice).toFixed(2);
          if (isCheaper) {
            diffPill.textContent = `Ahorras ${absDiff} €/${uLabel} (${Math.abs(result.diffPct)}%)`;
          } else if (isSame) {
            diffPill.textContent = `Mismo precio por ${uLabel}`;
          } else {
            diffPill.textContent = `+${absDiff} €/${uLabel} más caro (+${result.diffPct}%)`;
          }
        }
      }
    } else if (this.compMode === 'units') {
      const mercPill = document.getElementById('merc-unit-price-display');
      const compPill = document.getElementById('comp-unit-price-display');
      if (mercPill) mercPill.textContent = `${result.mercadonaUnitPrice.toFixed(3)} €/ud`;
      if (compPill) compPill.textContent = `${result.competitorUnitPrice.toFixed(3)} €/ud`;

      if (normSummary) {
        normSummary.style.display = 'block';
        document.getElementById('norm-merc-val').textContent = `${result.mercadonaUnitPrice.toFixed(3)} €/ud`;
        document.getElementById('norm-comp-label').textContent = `${this.selectedCompetitor}:`;
        document.getElementById('norm-comp-val').textContent = `${result.competitorUnitPrice.toFixed(3)} €/ud`;

        const diffPill = document.getElementById('norm-diff-pill');
        if (diffPill) {
          const isCheaper = result.verdict === 'cheaper';
          const isSame = result.verdict === 'same';
          diffPill.className = `norm-diff-pill ${result.verdictClass.replace('verdict-', '')}`;
          const absDiff = Math.abs(result.diffUnitPrice).toFixed(3);
          if (isCheaper) {
            diffPill.textContent = `Ahorras ${absDiff} €/ud (${Math.abs(result.diffPct)}%)`;
          } else if (isSame) {
            diffPill.textContent = `Mismo precio por unidad`;
          } else {
            diffPill.textContent = `+${absDiff} €/ud más caro (+${result.diffPct}%)`;
          }
        }
      }
    } else {
      if (normSummary) normSummary.style.display = 'none';
    }

    // Banner de Veredicto Visual
    if (banner) {
      banner.style.display = 'flex';
      banner.className = `verdict-banner ${result.verdictClass}`;
      
      const iconEl = document.getElementById('verdict-icon');
      const titleEl = document.getElementById('verdict-title');
      const msgEl = document.getElementById('verdict-message');

      if (iconEl) {
        if (result.verdict === 'cheaper') iconEl.textContent = '🎉';
        else if (result.verdict === 'expensive') iconEl.textContent = '⚠️';
        else iconEl.textContent = '⚖️';
      }

      if (titleEl) titleEl.textContent = result.verdictTitle;
      if (msgEl) msgEl.innerHTML = result.verdictMessage;
    }

    if (actions) actions.style.display = 'flex';
  }

  renderBasketSidebar() {
    const listContainer = document.getElementById('basket-items-list');
    const summaryBox = document.getElementById('basket-savings-box');
    const numEl = document.getElementById('basket-savings-num');
    const subEl = document.getElementById('basket-savings-summary');

    if (!listContainer) return;

    const items = this.comparator.savedComparisons;
    const summary = this.comparator.getBasketSavingsSummary();

    if (numEl) {
      if (summary.netSavings >= 0) {
        numEl.textContent = `+${summary.netSavings.toFixed(2)} €`;
        numEl.style.color = '#ffffff';
      } else {
        numEl.textContent = `${summary.netSavings.toFixed(2)} €`;
        numEl.style.color = '#ffcccc';
      }
    }

    if (subEl) {
      subEl.textContent = `${items.length} productos comparados (${summary.cheaperCount} más baratos aquí)`;
    }

    if (items.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 2.5rem 0; font-size: 0.88rem;">
          No has guardado comparativas en esta visita todavía.
        </div>
      `;
      return;
    }

    listContainer.innerHTML = items.map(item => {
      const isCheaper = item.verdict === 'cheaper';
      const badgeColor = isCheaper ? 'var(--success)' : 'var(--danger)';
      const diffSign = isCheaper ? '+' : '-';
      const absSavings = Math.abs(item.packageSavings || 0).toFixed(2);

      return `
        <div class="basket-item">
          <div style="max-width: 68%;">
            <strong style="display: block; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.productName}</strong>
            <span style="font-size: 0.74rem; color: var(--text-muted); display: block;">
              ${item.competitorName}: ${item.competitorPrice.toFixed(2)} € (Mercadona equiv: ${(item.equivalentMercadonaCost || item.mercadonaPrice).toFixed(2)} €)
            </span>
            ${item.detailLabel ? `<span style="font-size: 0.7rem; color: var(--primary); font-weight: 600;">${item.detailLabel}</span>` : ''}
          </div>
          <div style="text-align: right; display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-weight: 800; color: ${badgeColor}; font-size: 0.9rem;" title="Ahorro en este producto">
              ${diffSign}${absSavings} €
            </span>
            <span class="basket-item-del" data-del-id="${item.id}" title="Eliminar de la lista">✕</span>
          </div>
        </div>
      `;
    }).join('');

    listContainer.querySelectorAll('.basket-item-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-id');
        this.comparator.deleteComparison(id);
        this.renderBasketSidebar();
      });
    });
  }

  /* ========================================================================
     VISTA DE TENDENCIAS E INFLACIÓN
     ======================================================================== */
  renderTrendsView() {
    const hikesList = document.getElementById('trends-hikes-list');
    const dropsList = document.getElementById('trends-drops-list');
    if (!hikesList || !dropsList) return;

    const products = [...(this.data.products || [])];

    // Top Subidas (mayor aumento porcentual desde su mínimo histórico)
    const topHikes = products
      .filter(p => p.totalPurchases >= 2 && p.minPrice > 0 && p.changeMinPct > 5)
      .sort((a, b) => b.changeMinPct - a.changeMinPct)
      .slice(0, 10);

    hikesList.innerHTML = topHikes.map(p => `
      <div class="trend-item spike" style="cursor: pointer;" data-id="${p.id}">
        <div>
          <strong style="display: block; font-size: 0.92rem;">${p.name}</strong>
          <span style="font-size: 0.76rem; color: var(--text-muted);">
            Mín: ${p.minPrice.toFixed(2)} € ➔ Último: ${p.lastPrice.toFixed(2)} € (${p.totalPurchases} compras)
          </span>
        </div>
        <div style="text-align: right;">
          <span style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; color: var(--danger);">
            +${p.changeMinPct}%
          </span>
        </div>
      </div>
    `).join('');

    // Top Bajadas o Productos en Mínimo
    const topDrops = products
      .filter(p => p.totalPurchases >= 2 && p.lastPrice <= p.minPrice)
      .sort((a, b) => b.totalPurchases - a.totalPurchases)
      .slice(0, 10);

    dropsList.innerHTML = topDrops.map(p => `
      <div class="trend-item drop" style="cursor: pointer;" data-id="${p.id}">
        <div>
          <strong style="display: block; font-size: 0.92rem;">${p.name}</strong>
          <span style="font-size: 0.76rem; color: var(--text-muted);">
            Máx histórico: ${p.maxPrice.toFixed(2)} € ➔ Ahora: <strong>${p.lastPrice.toFixed(2)} €</strong>
          </span>
        </div>
        <div style="text-align: right;">
          <span style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; color: var(--success);">
            💎 MÍNIMO
          </span>
        </div>
      </div>
    `).join('');

    // Eventos para abrir modal al hacer clic en tendencias
    hikesList.querySelectorAll('.trend-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        const p = this.data.products.find(x => x.id === id);
        if (p) this.openProductModal(p);
      });
    });

    dropsList.querySelectorAll('.trend-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        const p = this.data.products.find(x => x.id === id);
        if (p) this.openProductModal(p);
      });
    });
  }

  /* ========================================================================
     MODAL DE CONFIGURACIÓN & DROPZONE EXCEL
     ======================================================================== */
  openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      const input = document.getElementById('github-url-input');
      if (input) {
        input.value = localStorage.getItem('mercadona_github_url') || '';
      }

      // Cargar configuración de GitHub API (Opción A)
      const conf = this.githubSync.config;
      const ownerInput = document.getElementById('github-owner-input');
      const repoInput = document.getElementById('github-repo-input');
      const branchInput = document.getElementById('github-branch-input');
      const tokenInput = document.getElementById('github-token-input');
      const autoSyncCheck = document.getElementById('github-autosync-checkbox');
      const feedbackEl = document.getElementById('github-sync-feedback');

      if (ownerInput) ownerInput.value = conf.owner || '';
      if (repoInput) repoInput.value = conf.repo || '';
      if (branchInput) branchInput.value = conf.branch || 'main';
      if (tokenInput) tokenInput.value = conf.token || '';
      if (autoSyncCheck) autoSyncCheck.checked = conf.autoSync !== false;

      if (feedbackEl) {
        if (this.githubSync.isConfigured()) {
          feedbackEl.style.display = 'block';
          feedbackEl.style.background = 'rgba(16, 185, 129, 0.12)';
          feedbackEl.style.color = 'var(--success)';
          feedbackEl.textContent = `✓ Configurado para ${conf.owner}/${conf.repo} (${conf.branch})`;
        } else {
          feedbackEl.style.display = 'none';
        }
      }
    }
  }

  closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  setupDropzoneEvents() {
    const dropzone = document.getElementById('excel-dropzone');
    const fileInput = document.getElementById('excel-file-input');

    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });

    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        await this.handleExcelFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        await this.handleExcelFile(e.target.files[0]);
      }
    });
  }

  async handleExcelFile(file) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Por favor selecciona un archivo Excel (.xlsx o .xls)');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseExcelWorkbook(buffer);
      this.data = parsed;
      this.comparator.setProducts(this.data.products);
      localStorage.setItem('mercadona_data_cache', JSON.stringify(this.data));
      this.updateSettingsMeta(`Archivo subido: ${file.name}`);
      this.renderAll();
      this.closeSettingsModal();
      alert(`✅ ¡Excelente! Se cargaron ${parsed.products.length} productos y ${parsed.metadata.totalTickets} tickets desde ${file.name}.`);
    } catch (err) {
      alert(`Error al procesar el Excel: ${err.message}`);
      console.error(err);
    }
  }

  exportComparisonsToCSV(items) {
    if (!items || items.length === 0) return;
    const headers = ['Fecha', 'Producto', 'Competidor', 'Precio_Competidor', 'Equivalente_Mercadona', 'Ahorro_Euros', 'Diferencia_Pct', 'Veredicto', 'Detalles'];
    const rows = items.map(item => [
      `"${item.date || ''}"`,
      `"${(item.productName || '').replace(/"/g, '""')}"`,
      `"${(item.competitorName || '').replace(/"/g, '""')}"`,
      item.competitorPrice != null ? item.competitorPrice.toFixed(2) : '',
      item.equivalentMercadonaCost != null ? item.equivalentMercadonaCost.toFixed(2) : '',
      item.packageSavings != null ? item.packageSavings.toFixed(2) : '',
      item.diffPct != null ? `${item.diffPct}%` : '',
      `"${item.verdict || ''}"`,
      `"${(item.detailLabel || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comparativas_supermercados_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.mercadonaApp = new MercadonaApp();
});
