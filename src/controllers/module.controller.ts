import type { FastifyRequest, FastifyReply } from 'fastify';
import { ModuleService } from '../services/module.service.js';
import { CreateModuleDto, UpdateModuleDto, CreateModuleGroupDto, ModuleFeedbackDto, CreateResourceDto, UpdateResourceDto } from '../models/module.model.js';
import { randomUUID } from 'crypto';
import { uploadToMinio } from '../lib/minio.js';

export const ModuleController = {
  async getGroups(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const hasSubscription = ['ACTIVE', 'TRIAL', 'SCHOLARSHIP'].includes(user.subscriptionStatus);
    const groups = await ModuleService.getGroups(user.id, hasSubscription, req);
    return reply.send({ groups });
  },

  async list(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { search, status, groupId } = req.query as any;
    const modules = await ModuleService.listModules({ isAdmin: user.role === 'ADMIN', search, status, groupId, req });
    return reply.send({ modules });
  },

  async getById(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const user = (req as any).currentUser;
    const hasSubscription = ['ACTIVE', 'TRIAL', 'SCHOLARSHIP'].includes(user.subscriptionStatus);
    return reply.send(await ModuleService.getModuleById(id, user.id, hasSubscription, req));
  },

  async getAdminDetails(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await ModuleService.getModuleAdmin(id));
  },

  async create(req: FastifyRequest, reply: FastifyReply) {
    const data = CreateModuleDto.parse(req.body);
    return reply.status(201).send(await ModuleService.createModule(data));
  },

  async update(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const data = UpdateModuleDto.parse(req.body);
    return reply.send(await ModuleService.updateModule(id, data));
  },

  async publish(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await ModuleService.publishModule(id));
  },

  async unpublish(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await ModuleService.unpublishModule(id));
  },

  async remove(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await ModuleService.archiveModule(id));
  },

  async listGroups(_req: FastifyRequest, reply: FastifyReply) {
    const groups = await ModuleService.listGroups();
    return reply.send({ groups });
  },

  async createGroup(req: FastifyRequest, reply: FastifyReply) {
    const data = CreateModuleGroupDto.parse(req.body);
    return reply.status(201).send(await ModuleService.createGroup(data));
  },

  async updateGroup(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const data = CreateModuleGroupDto.partial().parse(req.body);
    return reply.send(await ModuleService.updateGroup(id, data));
  },

  async deleteGroup(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await ModuleService.deleteGroup(id));
  },

  async archiveGroup(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await ModuleService.archiveGroup(id));
  },

  async unarchiveGroup(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await ModuleService.unarchiveGroup(id));
  },

  async submitFeedback(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const { moduleId } = req.params as { moduleId: string };
    const data = ModuleFeedbackDto.parse(req.body);
    return reply.status(201).send(await ModuleService.submitFeedback(moduleId, user.id, data));
  },

  async listResources(req: FastifyRequest, reply: FastifyReply) {
    const { moduleId } = req.params as { moduleId: string };
    const user = (req as any).currentUser;
    const isAdmin = user?.role === 'ADMIN';
    const hasSubscription = ['ACTIVE', 'TRIAL', 'SCHOLARSHIP'].includes(user?.subscriptionStatus);
    return reply.send(await ModuleService.listResources(moduleId, isAdmin, hasSubscription));
  },

  async createResource(req: FastifyRequest, reply: FastifyReply) {
    const { moduleId } = req.params as { moduleId: string };
    const data = CreateResourceDto.parse(req.body);
    return reply.status(201).send(await ModuleService.createResource(moduleId, data));
  },

  async updateResource(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    const data = UpdateResourceDto.parse(req.body);
    return reply.send(await ModuleService.updateResource(id, data));
  },

  async deleteResource(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await ModuleService.deleteResource(id));
  },

  async getResourceUploadUrl(req: FastifyRequest, reply: FastifyReply) {
    const { filename, contentType } = req.query as { filename: string; contentType: string };
    if (!filename || !contentType) {
      return reply.status(400).send({ error: 'filename and contentType are required' });
    }
    return reply.send(await ModuleService.getResourceUploadUrl(filename, contentType));
  },

  async reorderGroups(req: FastifyRequest, reply: FastifyReply) {
    const { items } = req.body as { items: { id: string; sortOrder: number }[] };
    return reply.send(await ModuleService.reorderGroups(items));
  },

  async reorderModules(req: FastifyRequest, reply: FastifyReply) {
    const { items } = req.body as { items: { id: string; sortOrder: number }[] };
    return reply.send(await ModuleService.reorderModules(items));
  },

  async reorderVideos(req: FastifyRequest, reply: FastifyReply) {
    const { items } = req.body as { items: { id: string; sortOrder: number }[] };
    return reply.send(await ModuleService.reorderVideos(items));
  },

  async reorderResources(req: FastifyRequest, reply: FastifyReply) {
    const { items } = req.body as { items: { id: string; sortOrder: number }[] };
    return reply.send(await ModuleService.reorderResources(items));
  },

  /** Upload a resource file to MinIO object storage. */
  async uploadResourceToServer(req: FastifyRequest, reply: FastifyReply) {
    const data = await (req as any).file();
    if (!data) return reply.status(400).send({ error: 'No file provided' });

    const ext = (data.filename?.split('.').pop() ?? '').toLowerCase();
    const key = `resources/${randomUUID()}${ext ? '.' + ext : ''}`;

    // Read stream into buffer
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const contentType = data.mimetype || 'application/octet-stream';
    const fileUrl = await uploadToMinio(key, buffer, contentType);

    return reply.send({ fileUrl, key, filename: data.filename, size: buffer.length });
  },
};
