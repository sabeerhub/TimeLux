// v2
/* ═══════════════════════════════════════════════════════
   TimeLux — Core JS
   Token stored in localStorage — works cross-domain
═══════════════════════════════════════════════════════ */

const API_BASE = (typeof window !== 'undefined' && window.API_BASE)
  ? window.API_BASE
  : 'https://timelux-production.up.railway.app/api';

/* ─── TOKEN STORAGE ──────────────────────────────────── */
const Token = {
  get()          { return localStorage.getItem('timelux_token'); },
  set(t)         { localStorage.setItem('timelux_token', t); },
  remove()       { localStorage.removeItem('timelux_token'); },
  getAdmin()     { return localStorage.getItem('timelux_admin_token'); },
  setAdmin(t)    { localStorage.setItem('timelux_admin_token', t); },
  removeAdmin()  { localStorage.removeItem('timelux_admin_token'); },
};

/* ─── API HELPER ─────────────────────────────────────── */
const api = {
  _isAdminPath(path) {
    return path.startsWith('/admin/') || path.includes('/orders/admin/') || window.location.pathname.includes('/admin/');
  },
  _headers(isAdmin = false) {
    const token = isAdmin ? Token.getAdmin() : Token.get();
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  },
  _headersAuto(path) {
    const isAdmin = this._isAdminPath(path);
    const token = isAdmin ? Token.getAdmin() : Token.get();
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  },
  async get(path, isAdmin = false) {
    const r = await fetch(`${API_BASE}${path}`, {
      headers: this._headersAuto(path),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j.data;
  },
  async post(path, body, isAdmin = false) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: this._headersAuto(path),
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  },
  async patch(path, body, isAdmin = false) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers: this._headersAuto(path),
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  },
  async del(path, isAdmin = false) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      headers: this._headers(isAdmin),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  },
  async postForm(path, formData, isAdmin = false) {
    const isAdminPath = this._isAdminPath(path);
    const token = (isAdmin || isAdminPath) ? Token.getAdmin() : Token.get();
    const h = {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'POST', headers: h, body: formData,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  },
  async putForm(path, formData, isAdmin = false) {
    const isAdminPath = this._isAdminPath(path);
    const token = (isAdmin || isAdminPath) ? Token.getAdmin() : Token.get();
    const h = {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'PUT', headers: h, body: formData,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  },
};

/* ─── AUTH GUARD ─────────────────────────────────────── */
const AuthGuard = {
  _user: null,
  _admin: null,

  async check() {
    const token = Token.get();
    if (!token) return false;
    try {
      const r = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) { Token.remove(); return false; }
      const { data } = await r.json();
      this._user = data;
      window.__user = data;
      return true;
    } catch {
      Token.remove();
      return false;
    }
  },

  async require() {
    const ok = await this.check();
    if (!ok) {
      const dest = encodeURIComponent(location.pathname + location.search);
      location.href = `/auth.html?redirect=${dest}`;
      return false;
    }
    return true;
  },

  async requireAdmin() {
    const token = Token.getAdmin();
    if (!token) { location.href = '/admin/login.html'; return false; }
    try {
      const r = await fetch(`${API_BASE}/auth/admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) { Token.removeAdmin(); location.href = '/admin/login.html'; return false; }
      const { data } = await r.json();
      if (!data.role || !['admin','super_admin','manager'].includes(data.role)) {
        Token.removeAdmin(); location.href = '/admin/login.html'; return false;
      }
      this._admin = data;
      window.__admin = data;
      return true;
    } catch {
      Token.removeAdmin();
      location.href = '/admin/login.html';
      return false;
    }
  },

  logout() {
    Token.remove();
    this._user = null;
    window.__user = null;
    location.href = '/index.html';
  },

  adminLogout() {
    Token.removeAdmin();
    this._admin = null;
    window.__admin = null;
    location.href = '/admin/login.html';
  },
};

/* ─── CART ───────────────────────────────────────────── */
const Cart = {
  _key: 'timelux_cart',
  get items() {
    try { return JSON.parse(localStorage.getItem(this._key) || '[]'); } catch { return []; }
  },
  save(items) { localStorage.setItem(this._key, JSON.stringify(items)); this.updateBadge(); },
  get count() { return this.items.reduce((s,i) => s+i.quantity, 0); },
  get total() { return this.items.reduce((s,i) => s+(i.price*i.quantity), 0); },
  add(product, qty=1) {
    const items = this.items;
    const ex = items.find(i => i.id===product.id);
    if (ex) ex.quantity = Math.min(ex.quantity+qty, 10);
    else items.push({...product, quantity:qty});
    this.save(items);
    Toast.show('Added to bag');
  },
  remove(id) { this.save(this.items.filter(i => i.id!==id)); },
  updateQty(id, qty) {
    if (qty<1) { this.remove(id); return; }
    this.save(this.items.map(i => i.id===id ? {...i, quantity:Math.min(qty,10)} : i));
  },
  clear() { localStorage.removeItem(this._key); this.updateBadge(); },
  updateBadge() {
    const count = this.count;
    document.querySelectorAll('.cart-badge').forEach(b => {
      b.textContent = count;
      b.style.display = count>0 ? 'flex' : 'none';
    });
  },
};

/* ─── TOAST ──────────────────────────────────────────── */
const Toast = {
  init() {
    if (!document.getElementById('toast-container')) {
      const el = document.createElement('div');
      el.id = 'toast-container';
      document.body.appendChild(el);
    }
  },
  show(msg, type='', duration=3000) {
    this.init();
    const t = document.createElement('div');
    t.className = `toast${type?' toast-'+type:''}`;
    t.textContent = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transition='.25s ease'; setTimeout(()=>t.remove(),250); }, duration);
  },
};

/* ─── FORMAT HELPERS ─────────────────────────────────── */
const fmt = {
  naira:    (n) => '₦'+Number(n).toLocaleString('en-NG'),
  date:     (d) => new Date(d).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'}),
  time:     (d) => new Date(d).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'}),
  datetime: (d) => `${fmt.date(d)} · ${fmt.time(d)}`,
};

/* ─── NAV RENDERERS ──────────────────────────────────── */
const Nav = {
  renderPublic() {
    return `
    <nav class="nav-public">
      <div class="container">
        <div class="nav-inner">
          <a href="/index.html" class="nav-brand">TimeLux</a>
          <a href="/auth.html" class="btn btn-primary btn-sm">Login</a>
        </div>
      </div>
    </nav>`;
  },
  renderAuth() {
    return `
    <nav class="nav-auth">
      <div class="container">
        <div class="nav-inner">
          <a href="/shop.html" class="nav-brand">TimeLux</a>
          <a href="/cart.html" class="nav-icon-btn" aria-label="Cart">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            <span class="cart-badge" style="display:none">0</span>
          </a>
        </div>
      </div>
    </nav>`;
  },
  renderBottom(active='') {
    const items = [
      { key:'home',       href:'/shop.html',        label:'Home',
        icon:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>` },
      { key:'collection', href:'/shop.html',        label:'Collection',
        icon:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>` },
      { key:'orders',     href:'/track-order.html', label:'Orders',
        icon:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>` },
      { key:'account',    href:'/account.html',     label:'Account',
        icon:`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>` },
    ];
    return `
    <nav class="bottom-nav">
      <div class="bottom-nav-inner">
        ${items.map(it=>`
        <a href="${it.href}" class="bottom-nav-item${active===it.key?' active':''}">
          ${it.icon}${it.label}
        </a>`).join('')}
      </div>
    </nav>`;
  },
};

/* ─── ADMIN NAV ──────────────────────────────────────── */
const AdminNav = { render(active='') { return AdminLayout?.render(active) || ''; } };

/* ─── INIT ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  Toast.init();
  Cart.updateBadge();
});

window.API_BASE  = API_BASE;
window.Token     = Token;
window.api       = api;
window.AuthGuard = AuthGuard;
window.Cart      = Cart;
window.Toast     = Toast;
window.fmt       = fmt;
window.Nav       = Nav;
window.AdminNav  = AdminNav;
