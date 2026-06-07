# TimeLux — Luxury Watch E-Commerce Platform
> Precision. Elegance. Legacy.

## Quick Start

### 1. Backend Setup
```bash
cd backend
npm install
cp .env.example .env     # fill in all values
npm run migrate          # create DB tables
node scripts/seed-admin.js  # create first admin
npm run dev
```

### 2. Frontend
Open `frontend/index.html` with Live Server (VS Code) or deploy to Vercel.
Edit `frontend/config.js` — set your Railway API URL.

## User Flow
```
/index.html  →  /auth.html  →  /shop.html  →  /product.html
→  /cart.html  →  /checkout.html  →  Korapay
→  /payment-success.html  OR  /payment-failed.html
→  /track-order.html
```

## Protected Pages (require login)
- `/shop.html` `/product.html` `/cart.html`
- `/checkout.html` `/payment-success.html` `/payment-failed.html`
- `/track-order.html` `/account.html`

## Admin (hidden — URL only, never linked in UI)
- `/admin/login.html`
- `/admin/dashboard.html`
- `/admin/products.html`
- `/admin/orders.html`
- `/admin/customers.html`
- `/admin/reviews.html`
- `/admin/settings.html`

## Environment Variables
```
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://your-site.vercel.app
BACKEND_URL=https://your-api.railway.app
DATABASE_URL=postgresql://...
JWT_SECRET=<64+ random chars>
JWT_EXPIRES_IN=7d
JWT_ADMIN_EXPIRES_IN=4h
KORAPAY_PUBLIC_KEY=pk_...
KORAPAY_SECRET_KEY=sk_...
KORAPAY_WEBHOOK_SECRET=...
KORAPAY_BASE_URL=https://api.korapay.com/merchant/api/v1
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
APPLE_CLIENT_ID=com.timelux.signin
```

## Deploy
- **Backend** → Railway (connect GitHub, add Postgres plugin)
- **Frontend** → Vercel (deploy `frontend/` folder)
- **Images** → Cloudinary (auto via upload API)

## API Endpoints
```
POST  /api/auth/register
POST  /api/auth/login
POST  /api/auth/logout
GET   /api/auth/me
POST  /api/auth/admin/login
GET   /api/auth/google
GET   /api/auth/apple

GET   /api/products           ?brand&sort&order&limit
GET   /api/products/:slug
POST  /api/products           (admin)
PUT   /api/products/:id       (admin)
DELETE /api/products/:id      (admin)

GET   /api/brands

POST  /api/orders
GET   /api/orders/my-orders
GET   /api/orders/:ref
POST  /api/orders/:ref/retry-payment
GET   /api/orders/admin/all   (admin)
PATCH /api/orders/admin/:id/status  (admin)

GET   /api/admin/dashboard
GET   /api/admin/dashboard/recent-orders
GET   /api/admin/customers

POST  /api/webhooks/korapay
```

## Security
- JWT in httpOnly cookies (no localStorage)
- Timing-safe login (prevents user enumeration)
- SELECT FOR UPDATE on stock (prevents race conditions)
- Price snapshots in order_items
- Webhook HMAC-SHA256 + double verify with Korapay API
- Idempotency table (duplicate webhooks ignored)
- RBAC on all admin routes
- Audit log on all sensitive actions
- noindex/nofollow on all admin pages
