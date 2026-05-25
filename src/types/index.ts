import type { FastifyRequest } from 'fastify';

// ─── AUTH CONTEXT ─────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  subscriptionStatus: string;
  avatarUrl?: string | null;
  passwordHash?: string | null;
}

export interface AuthRequest extends FastifyRequest {
  currentUser: AuthUser;
}

// ─── PAGINATION ──────────────────────────────────────────────────────────────

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── API RESPONSE ────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ─── PAYMENT ────────────────────────────────────────────────────────────────

export type PaymentPlatform =
  | 'apple_iap'
  | 'google_play'
  | 'stripe'
  | 'flutterwave'
  | 'scholarship';

export type MobileMoneyProvider =
  | 'mpesa'
  | 'mtn_momo'
  | 'airtel_money'
  | 'vodacom_mpesa';

export type SubscriptionStatus =
  | 'NONE'
  | 'TRIAL'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'SCHOLARSHIP';

// ─── MODULE ──────────────────────────────────────────────────────────────────

export type ModuleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type VideoType = 'EXPLANATION' | 'PRACTICE' | 'TASTER' | 'DEMONSTRATION' | 'ASSESSMENT';

// ─── ANNOUNCEMENT ───────────────────────────────────────────────────────────

export type AnnouncementType = 'PUSH' | 'BANNER' | 'BOTH';
export type AnnouncementTarget =
  | 'ALL_SUBSCRIBERS'
  | 'ACTIVE_ONLY'
  | 'ALL_REGISTERED'
  | 'SPEECH_MODULE_USERS';
