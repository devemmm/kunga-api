import type { FastifyRequest, FastifyReply } from 'fastify';
import { UserService, EmailService } from '../services/user.service.js';
import { UpdateProfileDto, ChildProfileDto, ChangePasswordDto, UserListQueryDto } from '../models/user.model.js';

export const UserController = {
  async getMe(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    return reply.send(await UserService.getProfile(user.id));
  },

  async updateMe(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const data = UpdateProfileDto.parse(req.body);
    return reply.send(await UserService.updateProfile(user.id, data));
  },

  async changePassword(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const data = ChangePasswordDto.parse(req.body);
    return reply.send(await UserService.changePassword(user.id, data));
  },

  async upsertChildProfile(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const data = ChildProfileDto.parse(req.body);
    return reply.status(201).send(await UserService.upsertChildProfile(user.id, data));
  },

  async exportData(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    const data = await UserService.exportData(user.id);
    reply.header('Content-Disposition', 'attachment; filename="kunga-data-export.json"');
    return reply.send(data);
  },

  async deleteAccount(req: FastifyRequest, reply: FastifyReply) {
    const user = (req as any).currentUser;
    return reply.send(await UserService.deleteAccount(user.id));
  },

  // ─── Admin ────────────────────────────────────────────────────────────────

  async list(req: FastifyRequest, reply: FastifyReply) {
    const query = UserListQueryDto.parse(req.query);
    return reply.send(await UserService.listUsers(query));
  },

  async getById(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as { id: string };
    return reply.send(await UserService.getUserById(id));
  },

  async sendEmail(req: FastifyRequest, reply: FastifyReply) {
    const admin = (req as any).currentUser;
    const { id } = req.params as { id: string };
    const { subject, message } = req.body as { subject: string; message: string };
    return reply.send(await EmailService.sendToUser(id, subject, message, admin.id));
  },

  async exportCSV(req: FastifyRequest, reply: FastifyReply) {
    const csv = await EmailService.exportUsersCSV(req.query);
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="kunga-users.csv"');
    return reply.send(csv);
  },
};