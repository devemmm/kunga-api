import { z } from 'zod';

export const RegisterDto = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const LoginDto = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const GoogleAuthDto = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
});

export const RefreshTokenDto = z.object({
  refreshToken: z.string().min(1),
});

export const ForgotPasswordDto = z.object({
  email: z.string().email(),
});

export const ResetPasswordDto = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const MfaVerifyDto = z.object({
  mfaToken: z.string().min(1),
  otp:      z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export const MfaResendDto = z.object({
  mfaToken: z.string().min(1),
});

export type RegisterInput      = z.infer<typeof RegisterDto>;
export type LoginInput         = z.infer<typeof LoginDto>;
export type GoogleAuthInput    = z.infer<typeof GoogleAuthDto>;
export type RefreshTokenInput  = z.infer<typeof RefreshTokenDto>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordDto>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordDto>;
export type MfaVerifyInput     = z.infer<typeof MfaVerifyDto>;
export type MfaResendInput     = z.infer<typeof MfaResendDto>;
