/**
 * Cliente de conexión a Supabase para Mercadona Tracker Multi-Tienda
 * Soporta operaciones REST en tiempo real con fallback a caché local
 */

export const DEFAULT_SUPABASE_CONFIG = {
  url: 'https://blxmcvaotrabcibzsduh.supabase.co',
  anonKey: 'sb_publishable_37n5COslCzzF3xstXup2Gg_rYum-T4M'
};

export class SupabaseClient {
  constructor() {
    this.config = this.loadConfig();
    this.authToken = null;
  }

  setAuthToken(token) {
    this.authToken = token || null;
  }

  loadConfig() {
    try {
      const customUrl = localStorage.getItem('mercadona_supabase_url');
      const customKey = localStorage.getItem('mercadona_supabase_key');
      return {
        url: (customUrl || DEFAULT_SUPABASE_CONFIG.url).replace(/\/$/, ''),
        anonKey: customKey || DEFAULT_SUPABASE_CONFIG.anonKey
      };
    } catch (e) {
      return { ...DEFAULT_SUPABASE_CONFIG };
    }
  }

  saveConfig(url, anonKey) {
    this.config.url = (url || '').replace(/\/$/, '').trim();
    this.config.anonKey = (anonKey || '').trim();
    try {
      localStorage.setItem('mercadona_supabase_url', this.config.url);
      localStorage.setItem('mercadona_supabase_key', this.config.anonKey);
    } catch (e) {
      console.warn('Error guardando configuración Supabase en localStorage', e);
    }
  }

  getHeaders(extra = {}) {
    const authBearer = this.authToken || this.config.anonKey;
    return {
      'apikey': this.config.anonKey,
      'Authorization': `Bearer ${authBearer}`,
      'Content-Type': 'application/json',
      ...extra
    };
  }

  async testConnection() {
    const url = `${this.config.url}/rest/v1/supermarkets?select=id,name&limit=1`;
    const resp = await fetch(url, { headers: this.getHeaders() });
    if (!resp.ok) {
      throw new Error(`Error ${resp.status}: no se pudo conectar con Supabase.`);
    }
    const data = await resp.json();
    return Array.isArray(data);
  }

  async getSupermarkets() {
    try {
      const url = `${this.config.url}/rest/v1/supermarkets?select=*&order=name.asc`;
      const resp = await fetch(url, { headers: this.getHeaders() });
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('Fallo cargando supermarkets de Supabase, usando local:', e);
    }
    return [];
  }

  async getCanonicalProducts() {
    try {
      const url = `${this.config.url}/rest/v1/canonical_products?select=*&order=name.asc`;
      const resp = await fetch(url, { headers: this.getHeaders() });
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('Fallo cargando canonical_products de Supabase:', e);
    }
    return [];
  }

  async getStoreProducts() {
    try {
      const url = `${this.config.url}/rest/v1/store_products?select=*&order=last_date.desc`;
      const resp = await fetch(url, { headers: this.getHeaders() });
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('Fallo cargando store_products de Supabase:', e);
    }
    return [];
  }

  // =========================================================================
  // ORGANIZADOR DE LA COMPRA MULTIUSUARIO (SHOPPING LIST)
  // =========================================================================
  async getShoppingList(userId = null) {
    const cacheKey = userId ? `mercadona_shopping_list_${userId}` : 'mercadona_shopping_list_cache';
    try {
      let url = `${this.config.url}/rest/v1/shopping_list_items?select=*&order=created_at.desc`;
      if (userId) {
        url = `${this.config.url}/rest/v1/shopping_list_items?user_id=eq.${userId}&order=created_at.desc`;
      }
      const resp = await fetch(url, { headers: this.getHeaders() });
      if (resp.ok) {
        const list = await resp.json();
        localStorage.setItem(cacheKey, JSON.stringify(list));
        return list;
      } else if (resp.status === 400 && userId) {
        // Fallback si la columna user_id aun no existe en Supabase antes de correr el SQL
        const fallbackUrl = `${this.config.url}/rest/v1/shopping_list_items?select=*&order=created_at.desc`;
        const fResp = await fetch(fallbackUrl, { headers: this.getHeaders() });
        if (fResp.ok) {
          const list = await fResp.json();
          return list;
        }
      }
    } catch (e) {
      console.warn('Fallo leyendo lista de Supabase, usando caché local:', e);
    }
    try {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  }

  async addShoppingListItem(canonicalProductId, targetQty = 1, notes = '', userId = null) {
    const payload = {
      canonical_product_id: canonicalProductId,
      target_quantity: parseFloat(targetQty) || 1,
      checked: false,
      notes: notes || null
    };
    if (userId) {
      payload.user_id = userId;
    }

    try {
      const url = `${this.config.url}/rest/v1/shopping_list_items`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders({ 'Prefer': 'return=representation' }),
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        const data = await resp.json();
        return Array.isArray(data) ? data[0] : data;
      }
    } catch (e) {
      console.warn('Error guardando en Supabase, guardando local:', e);
    }

    // Fallback local
    const item = {
      id: 'local_' + Date.now(),
      ...payload,
      created_at: new Date().toISOString()
    };
    return item;
  }

  async toggleShoppingListItem(itemId, checked) {
    try {
      const url = `${this.config.url}/rest/v1/shopping_list_items?id=eq.${itemId}`;
      const resp = await fetch(url, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ checked: Boolean(checked), updated_at: new Date().toISOString() })
      });
      return resp.ok;
    } catch (e) {
      console.warn('Error actualizando check en Supabase:', e);
      return false;
    }
  }

  async removeShoppingListItem(itemId) {
    try {
      const url = `${this.config.url}/rest/v1/shopping_list_items?id=eq.${itemId}`;
      const resp = await fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      return resp.ok;
    } catch (e) {
      console.warn('Error eliminando item en Supabase:', e);
      return false;
    }
  }

  async clearShoppingList(userId = null) {
    try {
      let url = `${this.config.url}/rest/v1/shopping_list_items?id=neq.00000000-0000-0000-0000-000000000000`;
      if (userId) {
        url = `${this.config.url}/rest/v1/shopping_list_items?user_id=eq.${userId}`;
      }
      const resp = await fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      return resp.ok;
    } catch (e) {
      console.warn('Error vaciando lista en Supabase:', e);
      return false;
    }
  }

  // =========================================================================
  // GESTIÓN Y ADMINISTRACIÓN DEL CATÁLOGO (SOLO ADMIN)
  // =========================================================================
  async updateCanonicalProduct(canonicalId, updates = {}) {
    try {
      const url = `${this.config.url}/rest/v1/canonical_products?id=eq.${canonicalId}`;
      const resp = await fetch(url, {
        method: 'PATCH',
        headers: this.getHeaders({ 'Prefer': 'return=representation' }),
        body: JSON.stringify({
          ...updates,
          updated_at: new Date().toISOString()
        })
      });
      return resp.ok;
    } catch (e) {
      console.warn('Error actualizando canonical en Supabase:', e);
      return false;
    }
  }

  async updateStoreProduct(storeProductId, updates = {}) {
    try {
      const url = `${this.config.url}/rest/v1/store_products?id=eq.${storeProductId}`;
      const resp = await fetch(url, {
        method: 'PATCH',
        headers: this.getHeaders({ 'Prefer': 'return=representation' }),
        body: JSON.stringify({
          ...updates,
          updated_at: new Date().toISOString()
        })
      });
      return resp.ok;
    } catch (e) {
      console.warn('Error actualizando store_product en Supabase:', e);
      return false;
    }
  }

  async reassignStoreProductCanonical(storeProductId, newCanonicalId) {
    return this.updateStoreProduct(storeProductId, { canonical_product_id: newCanonicalId });
  }
}
