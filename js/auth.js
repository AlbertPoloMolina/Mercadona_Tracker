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
  }

  loadAdminEmails() {
    try {
      const stored = localStorage.getItem('mercadona_admin_emails');
      if (stored) {
        return JSON.parse(stored).map(e => e.toLowerCase().trim());
      }
    } catch (e) {}
    // Emails por defecto con permisos de administrador
    return ['albert@polomolina.com', 'albertpolomolina@gmail.com', 'admin@mercadonatracker.com'];
  }

  setAdminEmail(email) {
    if (!email) return;
    const clean = email.toLowerCase().trim();
    if (!this.adminEmails.includes(clean)) {
      this.adminEmails.push(clean);
      localStorage.setItem('mercadona_admin_emails', JSON.stringify(this.adminEmails));
    }
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
    const email = (this.user.email || '').toLowerCase().trim();
    // 1. Coincide con la lista de correos administradores
    if (this.adminEmails.includes(email)) return true;
    // 2. Metadata del usuario en Supabase
    if (this.user.app_metadata?.role === 'admin' || this.user.user_metadata?.is_admin === true) return true;
    // 3. Fallback al primer usuario registrado si se configuró
    const customAdmin = localStorage.getItem('mercadona_custom_admin_email');
    if (customAdmin && customAdmin.toLowerCase().trim() === email) return true;
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
