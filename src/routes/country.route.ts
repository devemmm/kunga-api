import { FastifyInstance } from 'fastify';
import { requirePermission } from '../middleware/auth.js';
import { CountryService } from '../services/country.service';
import { getClientIp, lookupGeo } from '../lib/geo';

export async function countryRoutes(server: FastifyInstance) {

  // ── Public: check availability for caller's IP ────────────────────────────
  server.get('/check', {
    schema: { tags: ['Country'], summary: 'Check app availability for caller country' },
  }, async (req, reply) => {
    const result = await CountryService.checkAccess(req);
    return reply.send(result);
  });

  // ── Admin: list all countries ─────────────────────────────────────────────
  server.get('/admin', {
    schema: { tags: ['Country'], summary: '[Admin] List all countries', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('VIEW_COUNTRIES')],
  }, async (req, reply) => {
    return reply.send(await CountryService.listAll(req.query));
  });

  // ── Admin: get analytics ──────────────────────────────────────────────────
  server.get('/admin/analytics', {
    schema: { tags: ['Country'], summary: '[Admin] Country analytics', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('VIEW_COUNTRIES')],
  }, async (req, reply) => {
    return reply.send(await CountryService.getAnalytics());
  });

  // ── Admin: get audit log for a country ───────────────────────────────────
  server.get('/admin/:id/audit', {
    schema: { tags: ['Country'], summary: '[Admin] Audit log for a country', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('VIEW_COUNTRIES')],
  }, async (req: any, reply) => {
    return reply.send({ audit: await CountryService.getAuditLog(req.params.id) });
  });

  // ── Admin: update one country ─────────────────────────────────────────────
  server.patch('/admin/:id', {
    schema: { tags: ['Country'], summary: '[Admin] Update country availability', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_COUNTRIES')],
  }, async (req: any, reply) => {
    const updated = await CountryService.updateOne(req.params.id, req.body as any, req.user.id);
    return reply.send({ country: updated });
  });

  // ── Admin: bulk update ────────────────────────────────────────────────────
  server.post('/admin/bulk', {
    schema: { tags: ['Country'], summary: '[Admin] Bulk update countries', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_COUNTRIES')],
  }, async (req: any, reply) => {
    const { ids, ...data } = req.body as any;
    const result = await CountryService.bulkUpdate(ids, data, req.user.id);
    return reply.send(result);
  });
}
