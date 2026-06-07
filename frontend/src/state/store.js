// ─── TIME-NG State Management (Vanilla JS) ────────────────
// Simple pub/sub store. No framework needed.

const createStore = (initialState) => {
  let state = { ...initialState };
  const subscribers = new Map();

  const get = (key) => key ? state[key] : { ...state };

  const set = (updates) => {
    const prev = { ...state };
    state = { ...state, ...updates };
    subscribers.forEach((callback, key) => {
      if (!key || state[key] !== prev[key]) callback(state[key], prev[key]);
    });
  };

  const subscribe = (key, callback) => {
    if (typeof key === 'function') {
      // Global subscription
      subscribers.set(Symbol(), key);
    } else {
      subscribers.set(key + '_' + Date.now(), callback);
    }
  };

  return { get, set, subscribe };
};

// ─── CART STORE ───────────────────────────────────────────
const loadCart = () => {
  try { return JSON.parse(sessionStorage.getItem('tng_cart') || '[]'); } catch { return []; }
};

const cartStore = createStore({ items: loadCart() });

const persistCart = () => {
  sessionStorage.setItem('tng_cart', JSON.stringify(cartStore.get('items')));
};

export const Cart = {
  getItems: () => cartStore.get('items'),
  getCount: () => cartStore.get('items').reduce((sum, i) => sum + i.quantity, 0),
  getTotal: () => cartStore.get('items').reduce((sum, i) => sum + i.price * i.quantity, 0),

  add: (product, quantity = 1) => {
    const items = cartStore.get('items');
    const existing = items.find(i => i.id === product.id);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, 10);
      cartStore.set({ items: [...items] });
    } else {
      cartStore.set({ items: [...items, { ...product, quantity }] });
    }
    persistCart();
    Events.emit('cart:updated', Cart.getCount());
  },

  remove: (productId) => {
    const items = cartStore.get('items').filter(i => i.id !== productId);
    cartStore.set({ items });
    persistCart();
    Events.emit('cart:updated', Cart.getCount());
  },

  updateQuantity: (productId, quantity) => {
    if (quantity < 1) return Cart.remove(productId);
    const items = cartStore.get('items').map(i =>
      i.id === productId ? { ...i, quantity: Math.min(quantity, 10) } : i
    );
    cartStore.set({ items });
    persistCart();
  },

  clear: () => {
    cartStore.set({ items: [] });
    sessionStorage.removeItem('tng_cart');
    Events.emit('cart:updated', 0);
  },

  subscribe: (callback) => cartStore.subscribe('items', callback),
};

// ─── AUTH STORE ───────────────────────────────────────────
const authStore = createStore({ user: null, admin: null, initialized: false });

export const Auth = {
  getUser: () => authStore.get('user'),
  getAdmin: () => authStore.get('admin'),
  isAuthenticated: () => !!authStore.get('user'),
  isAdmin: () => !!authStore.get('admin'),

  setUser: (user) => authStore.set({ user, initialized: true }),
  setAdmin: (admin) => authStore.set({ admin }),
  clear: () => authStore.set({ user: null, admin: null }),

  subscribe: (callback) => authStore.subscribe('user', callback),
};

// ─── UI STORE ─────────────────────────────────────────────
const uiStore = createStore({ loading: false, toast: null });

export const UI = {
  setLoading: (loading) => uiStore.set({ loading }),
  
  toast: (message, type = 'success', duration = 3500) => {
    uiStore.set({ toast: { message, type, id: Date.now() } });
    setTimeout(() => uiStore.set({ toast: null }), duration);
  },

  subscribe: (key, callback) => uiStore.subscribe(key, callback),
};

// ─── EVENT BUS ────────────────────────────────────────────
const eventHandlers = {};

export const Events = {
  on: (event, handler) => {
    if (!eventHandlers[event]) eventHandlers[event] = [];
    eventHandlers[event].push(handler);
  },
  off: (event, handler) => {
    if (eventHandlers[event]) {
      eventHandlers[event] = eventHandlers[event].filter(h => h !== handler);
    }
  },
  emit: (event, data) => {
    (eventHandlers[event] || []).forEach(h => h(data));
  },
};

// ─── UTILS ────────────────────────────────────────────────
export const formatNaira = (amount) =>
  `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
