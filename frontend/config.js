/* ─────────────────────────────────────────────────────────
   TimeLux — Runtime Configuration
   Update PROD_API_URL before deploying to production.
───────────────────────────────────────────────────────── */

(function () {
  const PROD_API_URL = 'https://timelux-production.up.railway.app/api';
  const DEV_API_URL  = 'http://localhost:5000/api';

  const isLocal = window.location.hostname === 'localhost'
               || window.location.hostname === '127.0.0.1'
               || window.location.hostname.endsWith('.local');

  window.API_BASE = isLocal ? DEV_API_URL : PROD_API_URL;
  window.TIMELUX_ENV = isLocal ? 'development' : 'production';
})();
