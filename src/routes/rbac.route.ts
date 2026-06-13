import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../middleware/auth.js';
import { RolesController } from '../controllers/roles.controller.js';
import { SupportTeamController } from '../controllers/support-team.controller.js';

export async function rolesRoutes(server: FastifyInstance) {
  server.get('/', {
    schema: { tags: ['Roles'], summary: '[Admin] List roles', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_ROLES')],
  }, RolesController.list);

  server.post('/', {
    schema: { tags: ['Roles'], summary: '[Admin] Create role', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_ROLES')],
  }, RolesController.create);

  server.patch('/:id', {
    schema: { tags: ['Roles'], summary: '[Admin] Update role', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_ROLES')],
  }, RolesController.update);

  server.delete('/:id', {
    schema: { tags: ['Roles'], summary: '[Admin] Delete role (non-system, unused only)', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_ROLES')],
  }, RolesController.remove);

  server.get('/:id/users', {
    schema: { tags: ['Roles'], summary: '[Admin] List users assigned to a role', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_ROLES')],
  }, RolesController.getUsers);

  server.patch('/:id/permissions', {
    schema: { tags: ['Roles'], summary: '[Admin] Update permissions for a role', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_ROLES')],
  }, RolesController.updatePermissions);
}

export async function permissionsRoutes(server: FastifyInstance) {
  server.get('/', {
    schema: { tags: ['Permissions'], summary: '[Admin] List all permissions grouped by category', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_ROLES', 'MANAGE_PERMISSIONS')],
  }, RolesController.listPermissions);
}

export async function supportTeamRoutes(server: FastifyInstance) {
  server.get('/', {
    schema: { tags: ['Support Team'], summary: '[Admin] List support team members', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_SUPPORT_TEAM', 'VIEW_SUPPORT_TEAM')],
  }, SupportTeamController.list);

  server.post('/', {
    schema: { tags: ['Support Team'], summary: '[Admin] Create support team member', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_SUPPORT_TEAM')],
  }, SupportTeamController.create);

  server.patch('/:id', {
    schema: { tags: ['Support Team'], summary: '[Admin] Update support team member', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_SUPPORT_TEAM')],
  }, SupportTeamController.update);

  server.post('/:id/deactivate', {
    schema: { tags: ['Support Team'], summary: '[Admin] Deactivate member', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_SUPPORT_TEAM')],
  }, SupportTeamController.deactivate);

  server.post('/:id/activate', {
    schema: { tags: ['Support Team'], summary: '[Admin] Reactivate member', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_SUPPORT_TEAM')],
  }, SupportTeamController.activate);

  server.post('/:id/reset-password', {
    schema: { tags: ['Support Team'], summary: '[Admin] Send password reset email', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_SUPPORT_TEAM')],
  }, SupportTeamController.resetPassword);

  server.post('/:id/regenerate-password', {
    schema: { tags: ['Support Team'], summary: '[Admin] Regenerate a one-time temporary password', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_SUPPORT_TEAM')],
  }, SupportTeamController.regeneratePassword);

  server.patch('/:id/roles', {
    schema: { tags: ['Support Team'], summary: '[Admin] Assign roles to member', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_SUPPORT_TEAM')],
  }, SupportTeamController.updateRoles);

  server.patch('/:id/permissions', {
    schema: { tags: ['Support Team'], summary: '[Admin] Assign direct permission overrides', security: [{ bearerAuth: [] }] },
    preHandler: [requirePermission('MANAGE_SUPPORT_TEAM')],
  }, SupportTeamController.updatePermissions);
}
