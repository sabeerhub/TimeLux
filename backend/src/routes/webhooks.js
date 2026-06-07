import express from 'express';
import { korapayWebhook } from '../webhooks/korapay.js';

const router = express.Router();

// Raw body already set in server.js for /api/webhooks
router.post('/korapay', korapayWebhook);

export default router;
