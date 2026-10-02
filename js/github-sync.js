/**
 * Módulo de Sincronización con GitHub API
 * Permite guardar las comparativas de precios de otros supermercados
 * directamente en tu repositorio de GitHub (en data/precios_competencia.json)
 * mediante commits automáticos desde el navegador.
 */

const CONFIG_KEY = 'mercadona_github_sync_config';
const LOCAL_STORAGE_COMP_KEY = 'mercadona_saved_comparisons';

// Puente seguro de sincronización multi-dispositivo sin tokens en el cliente
export const GOOGLE_BRIDGE_URL = 'https://script.google.com/macros/s/AKfycbwMnqBS7ILVgfbw45bTWpkNZYdJw94jZGTXWUFQpEoOoN-BbiqiPdma4RHXLB0Rgg0Lyw/exec';

// Helper para codificar en Base64 con soporte para caracteres especiales/tildes en UTF-8
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// Helper para decodificar Base64 a UTF-8
function base64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str.replace(/\s/g, ''))));
}

export class GitHubSyncManager {
  constructor() {
    this.bridgeUrl = GOOGLE_BRIDGE_URL;
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          token: parsed.token || '',
          owner: parsed.owner || 'AlbertPoloMolina',
          repo: parsed.repo || 'Mercadona_Tracker',
          branch: parsed.branch || 'main',
          filePath: parsed.filePath || 'data/precios_competencia.json',
          autoSync: parsed.autoSync !== false
        };
      }
      return {
        token: '',
        owner: 'AlbertPoloMolina',
        repo: 'Mercadona_Tracker',
        branch: 'main',
        filePath: 'data/precios_competencia.json',
        autoSync: true
      };
    } catch (e) {
      return {
        token: '',
        owner: 'AlbertPoloMolina',
        repo: 'Mercadona_Tracker',
        branch: 'main',
        filePath: 'data/precios_competencia.json',
        autoSync: true
      };
    }
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.warn('Error guardando configuración de GitHub', e);
    }
    return this.config;
  }

  isConfigured() {
    // Si tenemos puente activo o token directo, está configurado
    return Boolean(this.bridgeUrl || (this.config.token && this.config.owner && this.config.repo));
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.config.token.trim()}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Verifica la conexión y permisos con el repositorio de GitHub
   */
  async testConnection() {
    if (!this.isConfigured()) {
      throw new Error('Faltan campos obligatorios (Token, Usuario o Repositorio).');
    }

    const { owner, repo } = this.config;
    const url = `https://api.github.com/repos/${owner}/${repo}`;

    const resp = await fetch(url, { headers: this.getHeaders() });
    if (!resp.ok) {
      if (resp.status === 401) throw new Error('Token no válido o expirado.');
      if (resp.status === 404) throw new Error(`El repositorio "${owner}/${repo}" no existe o el token no tiene permisos de lectura.`);
      throw new Error(`Error ${resp.status} al conectar con GitHub.`);
    }

    const data = await resp.json();
    return {
      success: true,
      repoName: data.full_name,
      private: data.private,
      permissions: data.permissions
    };
  }

  /**
   * Carga el archivo data/precios_competencia.json existente en GitHub o localmente
   */
  async fetchCompetitorHistory() {
    // 1. Intentar cargar data/precios_competencia.json local o de GitHub Pages (rápido y funciona sin token)
    try {
      const resp = await fetch('data/precios_competencia.json?t=' + Date.now());
      if (resp.ok) {
        const localData = await resp.json();
        if (localData && Array.isArray(localData.records)) {
          return localData;
        }
      }
    } catch (e) {
      // continuar
    }

    // 2. Si hay token directo de GitHub configurado, consultar API de GitHub
    if (this.config.token && this.config.owner && this.config.repo) {
      const { owner, repo, branch, filePath } = this.config;
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}&t=${Date.now()}`;

      try {
        const resp = await fetch(url, { headers: this.getHeaders() });
        if (resp.status === 404) {
          return { sha: null, data: { lastUpdated: null, records: [] } };
        }
        if (resp.ok) {
          const fileJson = await resp.json();
          const contentStr = base64ToUtf8(fileJson.content);
          const parsedData = JSON.parse(contentStr);
          return {
            sha: fileJson.sha,
            data: parsedData
          };
        }
      } catch (err) {
        console.warn('Error al obtener histórico de competencia de GitHub API:', err);
      }
    }

    return { lastUpdated: null, records: [] };
  }

  /**
   * Sincroniza y hace commit de las comparativas a GitHub
   * @param {Array} newItems - Lista de comparativas a guardar
   */
  async syncToGitHub(newItems = []) {
    if (!newItems || newItems.length === 0) {
      return { success: true, message: 'No hay elementos nuevos para sincronizar.' };
    }

    // 1. Sincronización multi-dispositivo sin tokens mediante puente seguro
    if (this.bridgeUrl) {
      try {
        const resp = await fetch(this.bridgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(newItems)
        });

        const data = await resp.json();
        if (data.success) {
          localStorage.setItem('mercadona_last_github_sync', new Date().toISOString());
          return {
            success: true,
            totalSaved: data.count || newItems.length,
            newAdded: newItems.length,
            viaBridge: true
          };
        } else {
          console.warn('El puente devolvió error:', data.error);
        }
      } catch (bridgeErr) {
        console.warn('Fallo comunicando con el puente, comprobando método directo:', bridgeErr);
      }
    }

    if (!this.config.token) {
      throw new Error('No se pudo sincronizar automáticamente con el puente en la nube ni hay token configurado.');
    }

    const { owner, repo, branch, filePath } = this.config;
    const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    // 1. Obtener el archivo actual y su SHA
    let existingSha = null;
    let existingRecords = [];

    try {
      const getResp = await fetch(`${fileUrl}?ref=${branch}&t=${Date.now()}`, {
        headers: this.getHeaders()
      });

      if (getResp.ok) {
        const fileInfo = await getResp.json();
        existingSha = fileInfo.sha;
        const decoded = base64ToUtf8(fileInfo.content);
        const parsed = JSON.parse(decoded);
        existingRecords = parsed.records || [];
      }
    } catch (e) {
      console.log('El archivo aún no existe en GitHub o ocurrió un fallo al leerlo. Se creará de nuevo.');
    }

    // 2. Fusionar registros sin duplicar IDs
    const existingIds = new Set(existingRecords.map(r => r.id));
    const mergedRecords = [...existingRecords];

    for (const item of newItems) {
      if (!existingIds.has(item.id)) {
        mergedRecords.push(item);
        existingIds.add(item.id);
      }
    }

    // Ordenar de más reciente a más antiguo
    mergedRecords.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    const updatedPayload = {
      lastUpdated: new Date().toISOString(),
      totalRecords: mergedRecords.length,
      records: mergedRecords
    };

    const contentBase64 = utf8ToBase64(JSON.stringify(updatedPayload, null, 2));

    // 3. Crear commit en GitHub vía PUT
    const commitMessage = `Actualizar precios de competencia (${newItems.length} reg.) [skip ci]`;

    const bodyData = {
      message: commitMessage,
      content: contentBase64,
      branch: branch
    };

    if (existingSha) {
      bodyData.sha = existingSha;
    }

    const putResp = await fetch(fileUrl, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(bodyData)
    });

    if (!putResp.ok) {
      const errText = await putResp.text();
      throw new Error(`Error en commit (${putResp.status}): ${errText}`);
    }

    const result = await putResp.json();

    // Actualizar timestamp local
    localStorage.setItem('mercadona_last_github_sync', new Date().toISOString());

    return {
      success: true,
      commitSha: result.commit ? result.commit.sha : null,
      totalSaved: mergedRecords.length,
      newAdded: newItems.length
    };
  }
}
