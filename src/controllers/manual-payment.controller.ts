import type { FastifyRequest, FastifyReply } from 'fastify';
import * as ManualPaymentService from '../services/manual-payment.service.js';
import { uploadToMinio } from '../lib/minio.js';

export const ManualPaymentController = {

  // ── User: submit a new manual payment ─────────────────────────────────────
  async submit(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;

    // Multipart: receipt file (optional) + JSON fields
    const parts = await (req as any).parts();

    let receiptUrl: string | undefined;
    let receiptKey: string | undefined;
    let plan = '';
    let amount = 0;
    let currency = 'RWF';
    let notes = '';

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'receipt') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        if (buffer.length > 0) {
          const ext = part.filename?.split('.').pop()?.toLowerCase() ?? 'jpg';
          const key = `receipts/${user.id}/${Date.now()}.${ext}`;
          try {
            receiptUrl = await uploadToMinio(key, buffer, part.mimetype);
            receiptKey = key;
          } catch (uploadErr) {
            // MinIO failure must not block the submission — record is still
            // created; admin can request the receipt separately if needed.
            req.log.error({ err: uploadErr }, 'manual-payment: receipt upload failed, continuing without receipt');
          }
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'plan')     plan     = String(part.value);
        if (part.fieldname === 'amount')   amount   = Number(part.value);
        if (part.fieldname === 'currency') currency = String(part.value);
        if (part.fieldname === 'notes')    notes    = String(part.value);
      }
    }

    if (!plan)   throw Object.assign(new Error('plan is required'),   { status: 400 });
    if (!amount) throw Object.assign(new Error('amount is required'), { status: 400 });

    const payment = await ManualPaymentService.submitManualPayment({
      userId: user.id, plan, amount, currency, notes, receiptUrl, receiptKey,
    });

    return reply.status(201).send(payment);
  },

  // ── User: list my submissions ──────────────────────────────────────────────
  async myPayments(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const payments = await ManualPaymentService.getMyManualPayments(user.id);
    return reply.send({ payments });
  },

  // ── Admin: list all manual payments ───────────────────────────────────────
  async list(req: FastifyRequest, reply: FastifyReply) {
    const query = req.query as any;
    const result = await ManualPaymentService.listManualPayments({
      status: query.status,
      search: query.search,
      page:   query.page   ? Number(query.page)  : 1,
      limit:  query.limit  ? Number(query.limit) : 20,
    });
    return reply.send(result);
  },

  // ── Admin: get single ──────────────────────────────────────────────────────
  async getById(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const payment = await ManualPaymentService.getManualPaymentById(id);
    return reply.send({ payment });
  },

  // ── Admin: approve ─────────────────────────────────────────────────────────
  async approve(req: FastifyRequest, reply: FastifyReply) {
    const admin = (req as any).currentUser;
    const { id } = req.params as { id: string };
    const { adminNotes } = (req.body as any) ?? {};
    const result = await ManualPaymentService.approveManualPayment(id, admin.id, adminNotes);
    return reply.send(result);
  },

  // ── Admin: reject ──────────────────────────────────────────────────────────
  async reject(req: FastifyRequest, reply: FastifyReply) {
    const admin = (req as any).currentUser;
    const { id } = req.params as { id: string };
    const { reason, adminNotes } = (req.body as any) ?? {};
    const result = await ManualPaymentService.rejectManualPayment(id, admin.id, reason, adminNotes);
    return reply.send(result);
  },

  // ── Admin: pending count (for badge) ──────────────────────────────────────
  async pendingCount(req: FastifyRequest, reply: FastifyReply) {
    const count = await ManualPaymentService.getPendingCount();
    return reply.send({ count });
  },

  // ── Admin/User: plan options ───────────────────────────────────────────────
  async planOptions(req: FastifyRequest, reply: FastifyReply) {
    return reply.send({ plans: ManualPaymentService.PLAN_OPTIONS });
  },
};
