/* ═══════════════════════════════════════════════════════
   TimeLux — Core JS
   Auth guard · Nav renderers · Cart · Toast · API
═══════════════════════════════════════════════════════ */

const API_BASE = (typeof window !== 'undefined' && window.API_BASE)
  ? window.API_BASE
  : (window.location.hostname === 'localhost'
      ? 'http://localhost:5000/api'
      : 'https://your-backend.railway.app/api');

/* ─── API HELPER ─────────────────────────────────────── */
const api = {
  async get(path) {
    const r = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j.data;
  },
  async post(path, body) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  },
  async patch(path, body) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  },
  async del(path) {
    const r = await fetch(`${API_BASE}${path}`, { method: 'DELETE', credentials: 'include' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  },
  async postForm(path, formData) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'POST', credentials: 'include', body: formData,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  },
  async putForm(path, formData) {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'PUT', credentials: 'include', body: formData,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  },
};

/* ─── AUTH GUARD ─────────────────────────────────────── */
const AuthGuard = {
  _user: null,

  async check() {
    if (this._user) return true;
    try {
      const r = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      if (!r.ok) throw new Error();
      const { data } = await r.json();
      this._user = data;
      window.__user = data;
      return true;
    } catch {
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
    try {
      const r = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      if (!r.ok) throw new Error();
      const { data } = await r.json();
      if (!data.role || !['admin','super_admin','manager'].includes(data.role)) throw new Error();
      this._user = data;
      window.__admin = data;
      return true;
    } catch {
      location.href = '/admin/login.html';
      return false;
    }
  },

  logout() {
    this._user = null;
    window.__user = null;
    fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
      .finally(() => { location.href = '/index.html'; });
  },

  adminLogout() {
    fetch(`${API_BASE}/auth/admin/logout`, { method: 'POST', credentials: 'include' })
      .finally(() => { location.href = '/admin/login.html'; });
  }
};

/* ─── CART ───────────────────────────────────────────── */
const Cart = {
  _key: 'timelux_cart',

  get items() {
    try { return JSON.parse(localStorage.getItem(this._key) || '[]'); }
    catch { return []; }
  },

  save(items) {
    localStorage.setItem(this._key, JSON.stringify(items));
    this.updateBadge();
  },

  get count() { return this.items.reduce((s, i) => s + i.quantity, 0); },
  get total() { return this.items.reduce((s, i) => s + i.price * i.quantity, 0); },

  add(product, qty = 1) {
    const items = this.items;
    const ex = items.find(i => i.id === product.id);
    if (ex) ex.quantity = Math.min(ex.quantity + qty, 10);
    else items.push({ ...product, quantity: qty });
    this.save(items);
    Toast.show('Added to bag');
  },

  remove(id) {
    this.save(this.items.filter(i => i.id !== id));
  },

  updateQty(id, qty) {
    if (qty < 1) { this.remove(id); return; }
    this.save(this.items.map(i => i.id === id ? { ...i, quantity: Math.min(qty, 10) } : i));
  },

  clear() {
    localStorage.removeItem(this._key);
    this.updateBadge();
  },

  updateBadge() {
    const count = this.count;
    document.querySelectorAll('.cart-badge').forEach(b => {
      b.textContent = count;
      b.style.display = count > 0 ? 'flex' : 'none';
    });
  }
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
  show(msg, type = '', duration = 3000) {
    this.init();
    const t = document.createElement('div');
    t.className = `toast${type ? ' toast-' + type : ''}`;
    t.textContent = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = '.25s ease';
      setTimeout(() => t.remove(), 250);
    }, duration);
  }
};

/* ─── FORMAT HELPERS ─────────────────────────────────── */
const fmt = {
  naira: (n) => '₦' + Number(n).toLocaleString('en-NG'),
  date:  (d) => new Date(d).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' }),
  time:  (d) => new Date(d).toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' }),
  datetime: (d) => `${fmt.date(d)} · ${fmt.time(d)}`,
};

/* ─── NAV RENDERERS ──────────────────────────────────── */
const Nav = {
  /* PUBLIC — Logo left, Login right. Nothing else. */
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

  /* AUTH — Logo left, Cart icon right. Nothing else. */
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

  /* BOTTOM MOBILE NAV — 4 icons, auth only */
  renderBottom(active = '') {
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
        ${items.map(it => `
        <a href="${it.href}" class="bottom-nav-item${active === it.key ? ' active' : ''}">
          ${it.icon}
          ${it.label}
        </a>`).join('')}
      </div>
    </nav>`;
  },
};

/* ─── ADMIN SIDEBAR ──────────────────────────────────── */
const AdminNav = {
  render(active = 'dashboard') {
    const items = [
      { key:'dashboard', href:'/admin/dashboard.html', label:'Dashboard',
        icon:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>` },
      { key:'watches', href:'/admin/products.html', label:'Watches',
        icon:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>` },
      { key:'orders', href:'/admin/orders.html', label:'Orders',
        icon:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>` },
      { key:'customers', href:'/admin/customers.html', label:'Customers',
        icon:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>` },
      { key:'reviews', href:'/admin/reviews.html', label:'Reviews',
        icon:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>` },
      { key:'settings', href:'/admin/settings.html', label:'Settings',
        icon:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>` },
    ];
    return `
    <aside class="sidebar">
      <div class="sidebar-brand">
        <p class="sidebar-logo">TimeLux</p>
        <p class="sidebar-subtitle">Admin Portal</p>
      </div>
      <nav class="sidebar-nav">
        ${items.map(it => `
        <a href="${it.href}" class="sidebar-item${active === it.key ? ' active' : ''}">
          ${it.icon} ${it.label}
        </a>`).join('')}
      </nav>
      <div class="sidebar-footer">
        <button class="sidebar-item" onclick="AuthGuard.adminLogout()" style="width:100%;border:none;background:none;cursor:pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Logout
        </button>
      </div>
    </aside>`;
  },
};

/* ─── SIDEBAR CSS (injected once) ────────────────────── */
const SIDEBAR_CSS = `
<style>
.admin-layout{display:flex;min-height:100dvh}
.sidebar{width:220px;flex-shrink:0;background:var(--bg);border-right:1px solid var(--border);display:flex;flex-direction:column;position:sticky;top:0;height:100dvh;overflow-y:auto}
@media(max-width:768px){.sidebar{display:none}}
.sidebar-brand{padding:var(--s6);border-bottom:1px solid var(--border)}
.sidebar-logo{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.sidebar-subtitle{font-size:11px;color:var(--text-tertiary);margin-top:2px}
.sidebar-nav{padding:var(--s3);flex:1}
.sidebar-item{display:flex;align-items:center;gap:var(--s3);padding:var(--s3);border-radius:var(--r-md);font-size:var(--text-sm);color:var(--text-secondary);cursor:pointer;transition:all var(--t-fast);margin-bottom:2px;text-decoration:none}
.sidebar-item:hover{background:var(--bg-secondary);color:var(--text-primary)}
.sidebar-item.active{background:var(--bg-tertiary);color:var(--text-primary);font-weight:500}
.sidebar-footer{padding:var(--s4) var(--s3);border-top:1px solid var(--border)}
.admin-main{flex:1;padding:var(--s8);overflow-x:hidden}
@media(max-width:768px){.admin-main{padding:var(--s5) var(--s4)}}
</style>`;

/* ─── INIT ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  Toast.init();
  Cart.updateBadge();
});

window.API_BASE     = API_BASE;
window.api          = api;
window.AuthGuard    = AuthGuard;
window.Cart         = Cart;
window.Toast        = Toast;
window.fmt          = fmt;
window.Nav          = Nav;
window.AdminNav     = AdminNav;
window.SIDEBAR_CSS  = SIDEBAR_CSS;
