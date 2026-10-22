/**
 * Gestor de Autenticación con Supabase Auth
 * Soporta Email/Contraseña y Enlace Mágico (Magic Link)
 * Gestión de sesión multiusuario y verificación de rol Administrador
 */

export class AuthManager {
  constructor(supabaseConfig) {
    this.config = supabaseConfig;
    this.session = null;
    this.user = null;
    this.adminEmails = this.loadAdminEmails();
    this.listeners = [];
    this.initSession();
    // Procesar enlace de confirmación o Magic Link si viene en la URL
    this.processAuthHash();
  }

  normalizeEmail(email) {
    if (!email) return '';
    const clean = email.toLowerCase().trim();
    const parts = clean.split('@');
    if (parts.length !== 2) return clean;
    let [user, domain] = parts;
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      user = user.replace(/\./g, '');
    }
    return `${user}@${domain}`;
  }

  loadAdminEmails() {
    try {
      const stored = localStorage.getItem('mercadona_admin_emails');
      if (stored) {
        return JSON.parse(stored).map(e => e.toLowerCase().trim());
      }
    } catch (e) { }
    // Emails por defecto con permisos de administrador (incluyendo variantes con y sin puntos)
    return [
      'albert.polo.molina@gmail.com',
      'apolomo@uoc.edu'
    ];
  }

  setAdminEmail(email) {
    if (!email) return;
    const clean = email.toLowerCase().trim();
    if (!this.adminEmails.includes(clean)) {
      this.adminEmails.push(clean);
      localStorage.setItem('mercadona_admin_emails', JSON.stringify(this.adminEmails));
    }
  }

  /**
   * Captura y procesa los tokens de Supabase cuando el usuario abre el enlace de correo
   * Formato: #access_token=...&refresh_token=...&type=signup
   */
  processAuthHash() {
    try {
      const hash = window.location.hash || '';
      if (!hash || !hash.includes('access_token=')) return null;

      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = params.get('expires_in');
      const type = params.get('type') || 'login';

      if (accessToken) {
        let user = null;
        try {
          const payloadBase64 = accessToken.split('.')[1];
          const decodedJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(decodedJson);
          user = {
            id: payload.sub,
            email: payload.email,
            user_metadata: payload.user_metadata || {},
            app_metadata: payload.app_metadata || {},
            role: payload.role
          };
        } catch (e) {
          console.warn('No se pudo decodificar el payload JWT localmente:', e);
        }

        const session = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: expiresIn ? parseInt(expiresIn, 10) : 3600,
          token_type: params.get('token_type') || 'bearer',
          type: type,
          user: user
        };

        this.saveSession(session);

        // Limpiar el hash de la URL de forma limpia
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }

        return { success: true, type, user };
      }
    } catch (err) {
      console.warn('Error procesando fragmento hash de Supabase:', err);
    }
    return null;
  }

  initSession() {
    try {
      const stored = localStorage.getItem('mercadona_auth_session');
      if (stored) {
        this.session = JSON.parse(stored);
        this.user = this.session.user || null;
      }
    } catch (e) {
      this.session = null;
      this.user = null;
    }
  }

  saveSession(sessionData) {
    this.session = sessionData;
    this.user = sessionData?.user || null;
    if (sessionData) {
      localStorage.setItem('mercadona_auth_session', JSON.stringify(sessionData));
    } else {
      localStorage.removeItem('mercadona_auth_session');
    }
    this.notifyStateChange();
  }

  isAuthenticated() {
    return Boolean(this.user && this.session?.access_token);
  }

  isAdmin() {
    if (!this.isAuthenticated()) return false;
    const rawEmail = (this.user.email || '').toLowerCase().trim();
    const normEmail = this.normalizeEmail(rawEmail);

    // 1. Coincide con la lista de correos administradores (exacto o normalizado para gmail)
    for (const admin of this.adminEmails) {
      if (admin === rawEmail || this.normalizeEmail(admin) === normEmail) {
        return true;
      }
    }
    // 2. Metadata del usuario en Supabase
    if (this.user.app_metadata?.role === 'admin' || this.user.user_metadata?.is_admin === true) return true;
    // 3. Fallback al custom admin si se configuró
    const customAdmin = localStorage.getItem('mercadona_custom_admin_email');
    if (customAdmin && this.normalizeEmail(customAdmin) === normEmail) return true;
    return false;
  }

  getAccessToken() {
    return this.session?.access_token || null;
  }

  getUserId() {
    return this.user?.id || null;
  }

  getUserEmail() {
    return this.user?.email || null;
  }

  getUserDisplayName() {
    if (!this.user) return 'Invitado';
    return this.user.user_metadata?.name || this.user.email.split('@')[0];
  }

  onAuthStateChange(callback) {
    this.listeners.push(callback);
    // Ejecutar de inmediato con el estado actual
    callback({
      user: this.user,
      session: this.session,
      isAuthenticated: this.isAuthenticated(),
      isAdmin: this.isAdmin()
    });
  }

  notifyStateChange() {
    const state = {
      user: this.user,
      session: this.session,
      isAuthenticated: this.isAuthenticated(),
      isAdmin: this.isAdmin()
    };
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('Error en listener de autenticación:', err);
      }
    }
    window.dispatchEvent(new CustomEvent('mercadona:auth-changed', { detail: state }));
  }

  /**
   * Registro con Email y Contraseña
   */
  async signUp(email, password, displayName = '') {
    const url = `${this.config.url}/auth/v1/signup`;
    const payload = {
      email: email.trim(),
      password: password,
      data: {
        name: displayName.trim() || email.split('@')[0]
      }
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': this.config.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error_description || data.msg || data.message || 'Error al crear la cuenta.');
    }

    // Si Supabase devuelve sesión activa directa (auto-confirm)
    if (data.session && data.user) {
      this.saveSession(data.session);
    } else if (data.access_token) {
      this.saveSession(data);
    }

    return data;
  }

  /**
   * Inicio de sesión con Email y Contraseña
   */
  async signInWithPassword(email, password) {
    const url = `${this.config.url}/auth/v1/token?grant_type=password`;
    const payload = {
      email: email.trim(),
      password: password
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': this.config.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error_description || data.msg || data.message || 'Email o contraseña incorrectos.');
    }

    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      user: data.user
    };

    this.saveSession(session);
    return session;
  }

  /**
   * Inicio de sesión con Magic Link (Enlace al correo sin contraseña)
   */
  async signInWithOtp(email) {
    const url = `${this.config.url}/auth/v1/otp`;
    const payload = {
      email: email.trim(),
      create_user: true
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': this.config.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error_description || data.msg || data.message || 'Error al enviar el enlace mágico.');
    }

    return true;
  }

  /**
   * Cerrar Sesión
   */
  async signOut() {
    try {
      if (this.session?.access_token) {
        const url = `${this.config.url}/auth/v1/logout`;
        await fetch(url, {
          method: 'POST',
          headers: {
            'apikey': this.config.anonKey,
            'Authorization': `Bearer ${this.session.access_token}`
          }
        });
      }
    } catch (e) {
      console.warn('Error llamando a logout en Supabase:', e);
    } finally {
      this.saveSession(null);
    }
  }
}
