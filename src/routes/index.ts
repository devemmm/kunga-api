import type { FastifyInstance } from 'fastify';
import { requireAuth, requirePermission, requireSubscription } from '../middleware/auth.js';
import { ModuleController } from '../controllers/module.controller.js';
import { ManualPaymentController } from '../controllers/manual-payment.controller.js';
import { VideoController, SubscriptionController, PaymentController, DonationController, AskGadController, AnnouncementController, AdminController, AnalyticsController, SiteAnalyticsController, PricingController } from '../controllers/index.js';
import { NotificationService } from '../services/admin.service.js';

export async function modulesRoutes(server: FastifyInstance) {
  server.get('/groups', { schema: { tags: ['Modules'], summary: 'List all module groups', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, ModuleController.getGroups);
  server.get('/groups/list', { schema: { tags: ['Modules'], summary: '[Admin] List groups for dropdowns', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_CONTENT', 'MANAGE_CONTENT')] }, ModuleController.listGroups);
  server.post('/groups', { schema: { tags: ['Modules'], summary: '[Admin] Create module group', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.createGroup);
  server.patch('/groups/:id', { schema: { tags: ['Modules'], summary: '[Admin] Update module group', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.updateGroup);
  server.delete('/groups/:id', { schema: { tags: ['Modules'], summary: '[Admin] Delete module group', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.deleteGroup);
  server.patch('/groups/reorder', { schema: { tags: ['Modules'], summary: '[Admin] Reorder module groups', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.reorderGroups);
  server.patch('/reorder', { schema: { tags: ['Modules'], summary: '[Admin] Reorder modules', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.reorderModules);
  server.patch('/videos/reorder', { schema: { tags: ['Modules'], summary: '[Admin] Reorder videos within a module', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT', 'MANAGE_VIDEOS')] }, ModuleController.reorderVideos);
  server.patch('/:moduleId/resources/reorder', { schema: { tags: ['Modules'], summary: '[Admin] Reorder resources within a module', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.reorderResources);
  server.delete('/groups/:id/permanent', { schema: { tags: ['Modules'], summary: '[Admin] Permanently delete group + all modules + all videos', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.permanentDeleteGroup);
  server.delete('/:id/permanent', { schema: { tags: ['Modules'], summary: '[Admin] Permanently delete module + all its videos', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.permanentDeleteModule);
  server.post('/groups/:id/archive', { schema: { tags: ['Modules'], summary: '[Admin] Archive module group', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.archiveGroup);
  server.post('/groups/:id/unarchive', { schema: { tags: ['Modules'], summary: '[Admin] Restore an archived module group', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.unarchiveGroup);
  server.get('/', { schema: { tags: ['Modules'], summary: 'List modules with search & filter', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, ModuleController.list);
  server.get('/:id', { schema: { tags: ['Modules'], summary: 'Get module detail', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, ModuleController.getById);
  server.get('/:id/details', { schema: { tags: ['Modules'], summary: '[Admin] Get module full details', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_CONTENT', 'MANAGE_CONTENT')] }, ModuleController.getAdminDetails);
  server.post('/', { schema: { tags: ['Modules'], summary: '[Admin] Create module', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.create);
  server.patch('/:id', { schema: { tags: ['Modules'], summary: '[Admin] Update module', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.update);
  server.post('/:id/publish', { schema: { tags: ['Modules'], summary: '[Admin] Publish module', security: [{ bearerAuth: [] }], body: { type: 'object' } }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.publish);
  server.post('/:id/unpublish', { schema: { tags: ['Modules'], summary: '[Admin] Unpublish module', security: [{ bearerAuth: [] }], body: { type: 'object' } }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.unpublish);
  server.delete('/:id', { schema: { tags: ['Modules'], summary: '[Admin] Archive module', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.remove);
  server.post('/:moduleId/feedback', { schema: { tags: ['Modules'], summary: 'Submit module feedback', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, ModuleController.submitFeedback);
  server.get('/:moduleId/resources', { schema: { tags: ['Modules'], summary: 'List module resources (auth users)', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, ModuleController.listResources);
  server.post('/:moduleId/resources', { schema: { tags: ['Modules'], summary: '[Admin] Add resource to module', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.createResource);
  server.patch('/resources/:id', { schema: { tags: ['Modules'], summary: '[Admin] Update resource', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.updateResource);
  server.delete('/resources/:id', { schema: { tags: ['Modules'], summary: '[Admin] Delete resource', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.deleteResource);
  server.get('/resources/upload-url', { schema: { tags: ['Modules'], summary: '[Admin] Get presigned R2 upload URL for a resource file', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.getResourceUploadUrl);
  server.post('/resources/upload-server', { schema: { tags: ['Modules'], summary: '[Admin] Upload resource file to server local storage', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_CONTENT')] }, ModuleController.uploadResourceToServer);
}

export async function videosRoutes(server: FastifyInstance) {
  server.get('/', { schema: { tags: ['Videos'], summary: '[Admin] List all videos', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_VIDEOS')] }, VideoController.list);
  server.post('/', { schema: { tags: ['Videos'], summary: '[Admin] Create video record', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_VIDEOS')] }, VideoController.create);
  server.patch('/:id', { schema: { tags: ['Videos'], summary: '[Admin] Update video', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_VIDEOS')] }, VideoController.update);
  server.delete('/:id', { schema: { tags: ['Videos'], summary: '[Admin] Archive video', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_VIDEOS')] }, VideoController.remove);
  server.delete('/:id/permanent', { schema: { tags: ['Videos'], summary: '[Admin] Permanently delete video + MinIO file', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_VIDEOS')] }, ModuleController.permanentDeleteVideo);
  server.post('/upload-url', { schema: { tags: ['Videos'], summary: '[Admin] Get Cloudflare Stream upload URL', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_VIDEOS')] }, VideoController.getUploadUrl);
  // Presigned MinIO PUT — browser uploads directly, no buffering through API
  server.get('/minio-upload-url', { schema: { tags: ['Videos'], summary: '[Admin] Get presigned MinIO PUT URL for direct video upload', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_VIDEOS')] }, VideoController.getMinioUploadUrl);
  server.get('/:id/stream', { schema: { tags: ['Videos'], summary: 'Get signed HLS stream URL (preview clips free, full content requires subscription)', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, VideoController.getStreamUrl);
  server.post('/:id/bookmark', { schema: { tags: ['Videos'], summary: 'Toggle bookmark', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, VideoController.bookmark);
  server.get('/:id/notes',          { schema: { tags: ['Videos'], summary: 'Get video notes',    security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, VideoController.getNotes);
  server.post('/:id/notes',         { schema: { tags: ['Videos'], summary: 'Add video note',     security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, VideoController.addNote);
  server.patch('/notes/:noteId',    { schema: { tags: ['Videos'], summary: 'Update video note',  security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, VideoController.updateNote);
  server.delete('/notes/:noteId',   { schema: { tags: ['Videos'], summary: 'Delete video note',  security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, VideoController.deleteNote);
}

export async function subscriptionsRoutes(server: FastifyInstance) {
  server.get('/status', { schema: { tags: ['Subscriptions'], summary: 'Get my subscription status', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, SubscriptionController.getStatus);
  server.get('/', { schema: { tags: ['Subscriptions'], summary: '[Admin] List subscriptions with search & filter', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_SUBSCRIPTIONS', 'MANAGE_SUBSCRIPTIONS')] }, SubscriptionController.list);
  server.get('/:userId/details', { schema: { tags: ['Subscriptions'], summary: '[Admin] Get subscription + user details', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_SUBSCRIPTIONS', 'MANAGE_SUBSCRIPTIONS')] }, async (req: any, reply: any) => { const { SubscriptionService } = await import('../services/subscription.service.js'); return reply.send(await SubscriptionService.getById(req.params.userId)); });
  server.post('/:userId/override', { schema: { tags: ['Subscriptions'], summary: '[Admin] Override subscription', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_SUBSCRIPTIONS')] }, SubscriptionController.override);
  server.post('/:userId/cancel', { schema: { tags: ['Subscriptions'], summary: '[Admin] Cancel subscription', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_SUBSCRIPTIONS')] }, SubscriptionController.cancel);
  server.post('/:userId/restore', { schema: { tags: ['Subscriptions'], summary: '[Admin] Restore subscription', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_SUBSCRIPTIONS')] }, SubscriptionController.restore);
  server.post('/revenuecat/sync', { schema: { tags: ['Subscriptions'], summary: 'Sync from RevenueCat after IAP', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, SubscriptionController.syncRevenueCat);
}

export async function paymentsRoutes(server: FastifyInstance) {
  server.post('/flutterwave/initiate', { schema: { tags: ['Payments'], summary: 'Create Flutterwave hosted payment link', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, PaymentController.initiateFlutterwave);
  server.get('/flutterwave/verify', { schema: { tags: ['Payments'], summary: 'Verify Flutterwave payment by tx_ref', security: [{ bearerAuth: [] }], querystring: { type: 'object', required: ['tx_ref'], properties: { tx_ref: { type: 'string' } } } }, preHandler: [requireAuth] }, PaymentController.verifyFlutterwave);
  server.get('/flutterwave/callback', { schema: { tags: ['Payments'], summary: 'Flutterwave browser redirect callback' } }, PaymentController.flutterwaveCallback);
  server.post('/stripe/create-checkout', { schema: { tags: ['Payments'], summary: 'Create Stripe checkout session', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, PaymentController.stripeCheckout);
  server.get('/mobile-money', { schema: { tags: ['Payments'], summary: '[Admin] List Flutterwave transactions', security: [{ bearerAuth: [] }], querystring: { type: 'object', properties: { provider: { type: 'string' }, status: { type: 'string' }, plan: { type: 'string' }, page: { type: 'integer' }, limit: { type: 'integer' } } } }, preHandler: [requirePermission('VIEW_MOBILE_MONEY')] }, PaymentController.listMobileMoney);
  server.post('/mobile-money/:txId/activate', { schema: { tags: ['Payments'], summary: '[Admin] Manual activation', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_SUBSCRIPTIONS')] }, PaymentController.manualActivate);
  server.get('/transactions', { schema: { tags: ['Payments'], summary: '[Admin] List all payment transactions', security: [{ bearerAuth: [] }], querystring: { type: 'object', properties: { platform: { type: 'string' }, status: { type: 'string' }, plan: { type: 'string' }, search: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, page: { type: 'integer' }, limit: { type: 'integer' } } } }, preHandler: [requirePermission('VIEW_SUBSCRIPTIONS', 'MANAGE_SUBSCRIPTIONS')] }, PaymentController.listTransactions);
  server.get('/my-history', { schema: { tags: ['Payments'], summary: 'Get my payment history', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, PaymentController.myHistory);
  server.get('/receipt/:id', { schema: { tags: ['Payments'], summary: 'Download receipt PDF', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, PaymentController.receiptPdf);
  server.get('/history/export', { schema: { tags: ['Payments'], summary: 'Export full payment history as PDF', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, PaymentController.exportHistory);
}

export async function manualPaymentsRoutes(server: FastifyInstance) {
  // Plan options (public, no auth needed — shown on pricing/upgrade page)
  server.get('/plans', { schema: { tags: ['Manual Payments'], summary: 'List available plans' } }, ManualPaymentController.planOptions);

  // User routes
  server.post('/',    { schema: { tags: ['Manual Payments'], summary: 'Submit a manual payment receipt', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, ManualPaymentController.submit);
  server.get('/my',   { schema: { tags: ['Manual Payments'], summary: 'Get my manual payment submissions', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, ManualPaymentController.myPayments);

  // Admin routes
  server.get('/pending-count', { schema: { tags: ['Manual Payments'], summary: '[Admin] Count of pending submissions', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_SUBSCRIPTIONS')] }, ManualPaymentController.pendingCount);
  server.get('/',              { schema: { tags: ['Manual Payments'], summary: '[Admin] List all manual payments', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_SUBSCRIPTIONS', 'VIEW_SUBSCRIPTIONS')] }, ManualPaymentController.list);
  server.get('/:id',           { schema: { tags: ['Manual Payments'], summary: '[Admin] Get single manual payment', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_SUBSCRIPTIONS', 'VIEW_SUBSCRIPTIONS')] }, ManualPaymentController.getById);
  server.post('/:id/approve',  { schema: { tags: ['Manual Payments'], summary: '[Admin] Approve manual payment', security: [{ bearerAuth: [] }], body: { type: 'object', properties: { adminNotes: { type: 'string' } } } }, preHandler: [requirePermission('MANAGE_SUBSCRIPTIONS')] }, ManualPaymentController.approve);
  server.post('/:id/reject',   { schema: { tags: ['Manual Payments'], summary: '[Admin] Reject manual payment', security: [{ bearerAuth: [] }], body: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' }, adminNotes: { type: 'string' } } } }, preHandler: [requirePermission('MANAGE_SUBSCRIPTIONS')] }, ManualPaymentController.reject);
}

export async function donationsRoutes(server: FastifyInstance) {
  server.post('/initiate', { schema: { tags: ['Donations'], summary: 'Initiate a donation' } }, DonationController.initiate);
  server.get('/', { schema: { tags: ['Donations'], summary: '[Admin] List donations', security: [{ bearerAuth: [] }], querystring: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, status: { type: 'string' } } } }, preHandler: [requirePermission('VIEW_DONATIONS')] }, DonationController.list);
  server.get('/stats', { schema: { tags: ['Donations'], summary: '[Admin] Donation stats', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_DONATIONS')] }, DonationController.getStats);
  server.get('/donor-wall', { schema: { tags: ['Donations'], summary: 'Public donor wall' } }, DonationController.getDonorWall);
  server.post('/scholarships/grant', { schema: { tags: ['Donations'], summary: '[Admin] Grant scholarship', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_DONATIONS')] }, DonationController.grantScholarship);
  server.get('/scholarships', { schema: { tags: ['Donations'], summary: '[Admin] List scholarships', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_DONATIONS')] }, DonationController.listScholarships);
}

export async function askGadRoutes(server: FastifyInstance) {
  server.get('/', { schema: { tags: ['Ask Dr. Gad'], summary: 'My submissions', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, AskGadController.list);
  server.post('/', { schema: { tags: ['Ask Dr. Gad'], summary: 'Submit question (2/month)', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth, requireSubscription] }, AskGadController.submit);
  server.get('/upload-url', { schema: { tags: ['Ask Dr. Gad'], summary: 'Get R2 upload URL', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, AskGadController.getUploadUrl);
  server.post('/upload', { schema: { tags: ['Ask Dr. Gad'], summary: 'Proxy upload: browser → API → MinIO (avoids CORS)', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, AskGadController.uploadMedia);
  server.get('/admin/queue', { schema: { tags: ['Ask Dr. Gad'], summary: '[Admin] Submission queue with search & filter', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_QUESTIONS')] }, AskGadController.getQueue);
  server.get('/admin/:id', { schema: { tags: ['Ask Dr. Gad'], summary: '[Admin] Get single submission with full user details', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_QUESTIONS')] }, AskGadController.getById);
  server.post('/admin/:id/respond', { schema: { tags: ['Ask Dr. Gad'], summary: '[Admin] Respond to submission', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('ANSWER_QUESTIONS')] }, AskGadController.respond);
  server.get('/admin/response-upload-url', { schema: { tags: ['Ask Dr. Gad'], summary: '[Admin] Get response video upload URL', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('ANSWER_QUESTIONS')] }, AskGadController.getResponseUploadUrl);
  server.get('/admin/assignees', { schema: { tags: ['Ask Dr. Gad'], summary: '[Admin] List assignable support agents', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('ASSIGN_QUESTIONS')] }, AskGadController.getAssignableAgents);
  server.post('/admin/:id/assign', { schema: { tags: ['Ask Dr. Gad'], summary: '[Admin] Assign submission to an agent', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('ASSIGN_QUESTIONS')] }, AskGadController.assign);
  server.post('/admin/:id/escalate', { schema: { tags: ['Ask Dr. Gad'], summary: '[Admin] Escalate submission to Super Admins', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('ESCALATE_QUESTIONS')] }, AskGadController.escalate);
  server.post('/credits/purchase', { schema: { tags: ['Ask Dr. Gad'], summary: 'Purchase a Question Credit (1 extra question this month)', security: [{ bearerAuth: [] }], body: { type: 'object' } }, preHandler: [requireSubscription] }, AskGadController.purchaseCredit);
  server.get('/credits/verify', { schema: { tags: ['Ask Dr. Gad'], summary: 'Verify question credit payment', security: [{ bearerAuth: [] }], querystring: { type: 'object', required: ['tx_ref'], properties: { tx_ref: { type: 'string' } } } }, preHandler: [requireAuth] }, AskGadController.verifyCredit);
}

export async function announcementsRoutes(server: FastifyInstance) {
  // ── Mobile app routes ──────────────────────────────────────────────────────
  server.get('/', { schema: { tags: ['Announcements'], summary: 'Get active announcements', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, AnnouncementController.getActive);
  server.get('/active-banner', { schema: { tags: ['Announcements'], summary: 'Get current in-app banner', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, AnnouncementController.getActiveBanner);
  server.post('/:id/dismiss', { schema: { tags: ['Announcements'], summary: 'Dismiss announcement', security: [{ bearerAuth: [] }] }, preHandler: [requireAuth] }, AnnouncementController.dismiss);

  // ── Admin static routes (must be before /:id parameterized routes) ─────────
  server.get('/admin', { schema: { tags: ['Announcements'], summary: '[Admin] List all announcements', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_CONTENT', 'MANAGE_ANNOUNCEMENTS')] }, AnnouncementController.list);
  server.post('/admin', { schema: { tags: ['Announcements'], summary: '[Admin] Create announcement', security: [{ bearerAuth: [] }], body: { type: 'object', required: ['title', 'body'], properties: { title: { type: 'string' }, body: { type: 'string' }, targetAudience: { type: 'string' }, deepLink: { type: 'string' }, scheduledAt: { type: 'string' } } } }, preHandler: [requirePermission('MANAGE_ANNOUNCEMENTS')] }, AnnouncementController.create);
  server.get('/admin/stats', { schema: { tags: ['Announcements'], summary: '[Admin] Announcement statistics', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_CONTENT', 'MANAGE_ANNOUNCEMENTS')] }, async (_req: any, reply: any) => { const { AnnouncementService } = await import('../services/announcement.service.js'); return reply.send(await AnnouncementService.getStats()); });

  // ── Admin parameterized routes (must be after static routes) ───────────────
  server.patch('/admin/:id', { schema: { tags: ['Announcements'], summary: '[Admin] Update announcement', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_ANNOUNCEMENTS')] }, AnnouncementController.update);
  server.delete('/admin/:id', { schema: { tags: ['Announcements'], summary: '[Admin] Delete announcement', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_ANNOUNCEMENTS')] }, AnnouncementController.remove);
  server.get('/admin/:id/viewers', { schema: { tags: ['Announcements'], summary: '[Admin] Who viewed an announcement', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_CONTENT', 'MANAGE_ANNOUNCEMENTS')] }, async (req: any, reply: any) => { const { AnnouncementService } = await import('../services/announcement.service.js'); return reply.send(await AnnouncementService.getViewers(req.params.id)); });
  server.post('/admin/:id/publish', { schema: { tags: ['Announcements'], summary: '[Admin] Publish + send push', security: [{ bearerAuth: [] }], body: { type: 'object' } }, preHandler: [requirePermission('MANAGE_ANNOUNCEMENTS')] }, AnnouncementController.publish);
}

export async function adminRoutes(server: FastifyInstance) {
  server.get('/dashboard', { schema: { tags: ['Admin'], summary: 'Dashboard stats', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_DASHBOARD')] }, AdminController.getDashboard);
  server.get('/activity-log', { schema: { tags: ['Admin'], summary: 'Activity log', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_AUDIT_LOGS')] }, AdminController.getActivityLog);
  server.get('/audit-log', { schema: { tags: ['Admin'], summary: 'RBAC audit log', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_AUDIT_LOGS')] }, AdminController.getAuditLog);
  server.get('/module-stats', { schema: { tags: ['Admin'], summary: 'Module completion rates', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS', 'VIEW_DASHBOARD')] }, AdminController.getModuleStats);
  server.get('/payment-stats', { schema: { tags: ['Admin'], summary: 'Revenue by platform', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS', 'VIEW_DASHBOARD')] }, AdminController.getPaymentStats);
  server.get('/revenue', { schema: { tags: ['Admin'], summary: 'Revenue stats with optional date range (?from=&to=)', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS', 'VIEW_DASHBOARD')] }, AdminController.getRevenueStats);
  server.get('/signup-trend', { schema: { tags: ['Admin'], summary: '8-week signup trend', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS', 'VIEW_DASHBOARD')] }, AdminController.getSignupTrend);
  server.get('/signin-trend', { schema: { tags: ['Admin'], summary: '8-week active user trend', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS', 'VIEW_DASHBOARD')] }, AdminController.getSigninTrend);
  server.get('/notifications', { schema: { tags: ['Admin'], summary: 'Admin notifications', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_DASHBOARD')] }, async (_req, reply) => reply.send(await NotificationService.getAdminNotifications()));
  server.get('/live-users', { schema: { tags: ['Admin'], summary: 'Last 6 logged-in users', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_DASHBOARD')] }, AdminController.getLiveUsers);
  // Pricing config
  server.get('/pricing', { schema: { tags: ['Admin'], summary: '[Admin] Get all subscription pricing config', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_DASHBOARD')] }, PricingController.getAll);
  server.patch('/pricing', { schema: { tags: ['Admin'], summary: '[Admin] Update a pricing config value', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('MANAGE_PRICING')] }, PricingController.set);

  // SMTP test
  server.post('/test-email', {
    schema: {
      tags: ['Admin'], summary: '[Admin] Send a test email to verify SMTP configuration', security: [{ bearerAuth: [] }],
      body: { type: 'object', required: ['to'], properties: { to: { type: 'string', format: 'email' } } },
    },
    preHandler: [requirePermission('VIEW_DASHBOARD')],
  }, async (req: any, reply: any) => {
    const { to } = req.body as { to: string };
    const { sendAdminEmail } = await import('../lib/email.js');
    try {
      await sendAdminEmail(
        to,
        'Admin',
        '✅ Kunga Basics SMTP Test',
        `This is a test email sent from the Kunga Basics Admin Portal.\n\nIf you received this, your SMTP configuration is working correctly.\n\nSent at: ${new Date().toISOString()}`,
      );
      return reply.send({ success: true, message: `Test email sent to ${to}` });
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to send email: ${err?.message ?? 'Unknown error'}` });
    }
  });
}

export async function analyticsRoutes(server: FastifyInstance) {
  server.get('/overview', { schema: { tags: ['Analytics'], summary: 'DAU, MAU, stickiness', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS')] }, AnalyticsController.getOverview);
  server.get('/funnel', { schema: { tags: ['Analytics'], summary: 'Subscription funnel', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS')] }, AnalyticsController.getFunnel);
  server.get('/retention', { schema: { tags: ['Analytics'], summary: 'Cohort retention', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS')] }, AnalyticsController.getRetention);
  server.get('/mobile-money', { schema: { tags: ['Analytics'], summary: 'Mobile Money breakdown', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS')] }, AnalyticsController.getMobileMoney);

  // ── Site / visitor analytics ────────────────────────────────────────────
  // Public tracking beacon — called from the portal site, admin portal, and
  // mobile app. No auth required (anonymous visitors), rate-limited to
  // prevent abuse. If a bearer token is present it's used to attach the user.
  server.post('/track', {
    schema: { tags: ['Analytics'], summary: 'Record a visitor tracking beacon (pageview / event)' },
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, SiteAnalyticsController.track);

  server.get('/site/overview', { schema: { tags: ['Analytics'], summary: '[Admin] Visitor overview (totals, bounce rate, avg duration)', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS')] }, SiteAnalyticsController.getOverview);
  server.get('/site/geo',      { schema: { tags: ['Analytics'], summary: '[Admin] Visitors by country/city/continent', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS')] }, SiteAnalyticsController.getGeo);
  server.get('/site/devices',  { schema: { tags: ['Analytics'], summary: '[Admin] Browser/OS/device breakdown', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS')] }, SiteAnalyticsController.getDevices);
  server.get('/site/pages',    { schema: { tags: ['Analytics'], summary: '[Admin] Most-visited pages', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS')] }, SiteAnalyticsController.getPages);
  server.get('/site/sources',  { schema: { tags: ['Analytics'], summary: '[Admin] Traffic source breakdown', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS')] }, SiteAnalyticsController.getSources);
  server.get('/site/trends',   { schema: { tags: ['Analytics'], summary: '[Admin] Visitor trends over time', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS')] }, SiteAnalyticsController.getTrends);
  server.get('/site/realtime', { schema: { tags: ['Analytics'], summary: '[Admin] Visitors active right now', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS')] }, SiteAnalyticsController.getRealtime);
  server.get('/site/export',   { schema: { tags: ['Analytics'], summary: '[Admin] Export visitor sessions as CSV', security: [{ bearerAuth: [] }] }, preHandler: [requirePermission('VIEW_ANALYTICS')] }, SiteAnalyticsController.exportCsv);

  // Public — headline numbers (families supported, satisfaction, etc.) for the
  // marketing site's stats section. No auth, no PII.
  server.get('/site/public-stats', {
    schema: { tags: ['Analytics'], summary: 'Public headline stats for the marketing site' },
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, SiteAnalyticsController.getPublicStats);
}
