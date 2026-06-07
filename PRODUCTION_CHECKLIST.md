# TIME-NG — Production Readiness Checklist

## ✅ Security Checklist
- [ ] All env vars set in Railway + Vercel (never committed)
- [ ] JWT_SECRET is ≥64 random chars
- [ ] KORAPAY_WEBHOOK_SECRET configured and tested
- [ ] CORS origin locked to production frontend URL
- [ ] Admin password is bcrypt hashed (≥12 rounds)
- [ ] Rate limiters verified on auth + order endpoints
- [ ] Helmet CSP headers reviewed
- [ ] Webhook signature validation tested
- [ ] Payment amount verification tested
- [ ] SQL injection tested (parameterized queries only)

## ✅ Backend Deploy (Railway)
- [ ] NODE_ENV=production set
- [ ] DATABASE_URL pointing to Railway Postgres
- [ ] `npm run migrate` executed against prod DB
- [ ] Health check `/health` returns 200
- [ ] All routes tested with Postman/Bruno
- [ ] Error logs reviewed (no stack traces in prod responses)

## ✅ Frontend Deploy (Vercel)
- [ ] `TIME_NG_CONFIG.apiUrl` pointing to Railway API URL
- [ ] All pages tested on mobile (320px+)
- [ ] Cart flow end-to-end tested
- [ ] Payment flow tested with Korapay test keys
- [ ] Admin panel access tested
- [ ] Images loading from Cloudinary

## ✅ Database Checklist
- [ ] Migrations ran successfully
- [ ] Indexes created (check pg_indexes)
- [ ] At least one admin account seeded
- [ ] Brands seeded
- [ ] Daily backup enabled on Railway

## ✅ Payment Checklist
- [ ] Test payment completed end-to-end
- [ ] Webhook received and processed
- [ ] Order status updated after payment
- [ ] Stock decremented correctly
- [ ] Duplicate webhook handled gracefully
- [ ] Failed payment stock restored

## ✅ Testing Checklist
- [ ] Register new customer
- [ ] Login as customer
- [ ] Browse collection
- [ ] Add to cart
- [ ] Complete checkout with Korapay test card
- [ ] View order tracking
- [ ] Admin login
- [ ] Create/edit/delete a watch
- [ ] Update order status
- [ ] View dashboard stats
