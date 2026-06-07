// ─── TIME-NG API Service Layer ────────────────────────────
// All fetch calls go through here. Never call fetch directly in pages.

const BASE_URL = window.TIME_NG_CONFIG?.apiUrl || 'http://localhost:5000/api';

class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const request = async (method, endpoint, data = null, options = {}) => {
  const config = {
    method,
    credentials: 'include', // always send cookies
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  };

  if (data && method !== 'GET') {
    config.body = JSON.stringify(data);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, config);
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      json.error || 'Something went wrong.',
      response.status,
      json.details || null
    );
  }

  return json;
};

// ─── PRODUCTS ─────────────────────────────────────────────
export const ProductsAPI = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request('GET', `/products${query ? `?${query}` : ''}`);
  },
  getBySlug: (slug) => request('GET', `/products/${slug}`),
};

// ─── ORDERS ───────────────────────────────────────────────
export const OrdersAPI = {
  create: (data) => request('POST', '/orders', data),
  getByRef: (ref) => request('GET', `/orders/${ref}`),
  getMyOrders: () => request('GET', '/orders/my-orders'),
};

// ─── AUTH ─────────────────────────────────────────────────
export const AuthAPI = {
  register: (data) => request('POST', '/auth/register', data),
  login: (data) => request('POST', '/auth/login', data),
  logout: () => request('POST', '/auth/logout'),
  getMe: () => request('GET', '/auth/me'),
  adminLogin: (data) => request('POST', '/auth/admin/login', data),
  adminLogout: () => request('POST', '/auth/admin/logout'),
};

// ─── ADMIN ────────────────────────────────────────────────
export const AdminAPI = {
  getDashboard: () => request('GET', '/admin/dashboard'),
  getRevenueChart: () => request('GET', '/admin/dashboard/revenue-chart'),
  getRecentOrders: () => request('GET', '/admin/dashboard/recent-orders'),
  getCustomers: (params) => {
    const query = new URLSearchParams(params).toString();
    return request('GET', `/admin/customers${query ? `?${query}` : ''}`);
  },

  // Products (admin)
  createProduct: (formData) => fetch(`${BASE_URL}/products`, {
    method: 'POST', credentials: 'include', body: formData,
  }).then(r => r.json()),

  updateProduct: (id, formData) => fetch(`${BASE_URL}/products/${id}`, {
    method: 'PUT', credentials: 'include', body: formData,
  }).then(r => r.json()),

  deleteProduct: (id) => request('DELETE', `/products/${id}`),

  // Orders (admin)
  getAllOrders: (params) => {
    const query = new URLSearchParams(params).toString();
    return request('GET', `/orders/admin/all${query ? `?${query}` : ''}`);
  },
  updateOrderStatus: (id, data) => request('PATCH', `/orders/admin/${id}/status`, data),
};

export { ApiError };
