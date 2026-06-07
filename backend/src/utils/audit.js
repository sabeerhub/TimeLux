import { query } from '../config/database.js';

export const logAudit = async ({
  actorId = null, actorType, actorEmail = null,
  action, entity = null, entityId = null,
  ip = null, userAgent = null, metadata = {}
}) => {
  try {
    await query(`
      INSERT INTO audit_logs (actor_id, actor_type, actor_email, action, entity, entity_id, ip_address, user_agent, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [actorId, actorType, actorEmail, action, entity, entityId, ip, userAgent, JSON.stringify(metadata)]);
  } catch (err) {
    // Never let audit logging break the main flow
    console.error('Audit log error:', err.message);
  }
};
