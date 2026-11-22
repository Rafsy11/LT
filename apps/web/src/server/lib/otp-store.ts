import crypto from 'crypto';
import { OTP_CONFIG, ERROR_CODES } from '@repo/shared';
import { env } from '@/env';
import { redisManager } from './redis';

export interface OtpChallengeRecord {
  challengeId: string;
  userId: string;
  username: string;
  otpHash: string;
  attempts: number;
  createdAt: number;
  expiresAt: number;
  lastSentAt: number;
  deliveryStatus: 'SENT' | 'PENDING_BOT_START';
  telegramChatId: string | null;
}

const CHALLENGE_PREFIX = 'otp_challenge:';
const ACTIVE_USER_CHALLENGE_PREFIX = 'otp_active_user:';

function computeOtpHash(challengeId: string, otpCode: string): string {
  return crypto
    .createHmac('sha256', env.HMAC_ACTION_SECRET)
    .update(`${challengeId}:${otpCode.trim()}`)
    .digest('hex');
}

function generateSixDigitOtp(): string {
  const num = crypto.randomInt(100_000, 1_000_000);
  return String(num);
}

/**
 * Creates a new 6-digit OTP challenge in Redis (with in-memory fallback).
 *
 * @param params - User identity and initial delivery metadata.
 * @returns Generated plaintext OTP code and challenge record.
 * @example
 * const { otpCode, record } = await createOtpChallenge({ userId: 'u1', username: 'superadmin' });
 */
export async function createOtpChallenge(params: {
  userId: string;
  username: string;
  telegramChatId?: string | null;
  deliveryStatus?: 'SENT' | 'PENDING_BOT_START';
}): Promise<{ otpCode: string; record: OtpChallengeRecord }> {
  const challengeId = crypto.randomUUID();
  const otpCode = generateSixDigitOtp();
  const now = Date.now();
  const expiresAt = now + OTP_CONFIG.EXPIRY_SECONDS * 1000;

  const record: OtpChallengeRecord = {
    challengeId,
    userId: params.userId,
    username: params.username,
    otpHash: computeOtpHash(challengeId, otpCode),
    attempts: 0,
    createdAt: now,
    expiresAt,
    lastSentAt: now,
    deliveryStatus: params.deliveryStatus ?? 'PENDING_BOT_START',
    telegramChatId: params.telegramChatId ?? null,
  };

  const prevChallengeId = await redisManager.getKey(`${ACTIVE_USER_CHALLENGE_PREFIX}${params.userId}`);
  if (prevChallengeId) {
    await redisManager.deleteKey(`${CHALLENGE_PREFIX}${prevChallengeId}`);
  }

  await redisManager.setKeyWithTtl(
    `${CHALLENGE_PREFIX}${challengeId}`,
    JSON.stringify(record),
    OTP_CONFIG.EXPIRY_SECONDS,
  );
  await redisManager.setKeyWithTtl(
    `${ACTIVE_USER_CHALLENGE_PREFIX}${params.userId}`,
    challengeId,
    OTP_CONFIG.EXPIRY_SECONDS,
  );

  return { otpCode, record };
}

/**
 * Updates delivery status and resolved Telegram Chat ID on an existing challenge.
 *
 * @param challengeId - Unique challenge UUID.
 * @param updates - Delivery status and resolved chat ID.
 * @returns Updated challenge record or null if expired.
 * @example
 * await updateOtpChallengeDelivery(id, { deliveryStatus: 'SENT', telegramChatId: '123456' });
 */
export async function updateOtpChallengeDelivery(
  challengeId: string,
  updates: { deliveryStatus: 'SENT' | 'PENDING_BOT_START'; telegramChatId: string | null },
): Promise<OtpChallengeRecord | null> {
  const raw = await redisManager.getKey(`${CHALLENGE_PREFIX}${challengeId}`);
  if (!raw) return null;

  const record = JSON.parse(raw) as OtpChallengeRecord;
  const remainingSeconds = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));

  record.deliveryStatus = updates.deliveryStatus;
  record.telegramChatId = updates.telegramChatId;
  record.lastSentAt = Date.now();

  await redisManager.setKeyWithTtl(
    `${CHALLENGE_PREFIX}${challengeId}`,
    JSON.stringify(record),
    remainingSeconds,
  );

  return record;
}

/**
 * Rotates the 6-digit OTP code for an active challenge when the user requests a resend.
 * Enforces cooldown if the previous OTP was already sent to Telegram.
 *
 * @param challengeId - Active challenge UUID.
 * @returns Newly generated plaintext OTP code and updated record.
 * @example
 * const { otpCode, record } = await rotateOtpChallenge(challengeId);
 */
export async function rotateOtpChallenge(
  challengeId: string,
): Promise<{ otpCode: string; record: OtpChallengeRecord }> {
  const raw = await redisManager.getKey(`${CHALLENGE_PREFIX}${challengeId}`);
  if (!raw) {
    const err = new Error('Sesi verifikasi OTP telah kedaluwarsa. Silakan login kembali.');
    (err as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.OTP_EXPIRED;
    (err as Error & { code?: string; statusCode?: number }).statusCode = 401;
    throw err;
  }

  const record = JSON.parse(raw) as OtpChallengeRecord;
  const now = Date.now();

  if (now > record.expiresAt) {
    await redisManager.deleteKey(`${CHALLENGE_PREFIX}${challengeId}`);
    const err = new Error('Sesi verifikasi OTP telah kedaluwarsa. Silakan login kembali.');
    (err as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.OTP_EXPIRED;
    (err as Error & { code?: string; statusCode?: number }).statusCode = 401;
    throw err;
  }

  if (record.deliveryStatus === 'SENT') {
    const elapsedSeconds = Math.floor((now - record.lastSentAt) / 1000);
    if (elapsedSeconds < OTP_CONFIG.RESEND_COOLDOWN_SECONDS) {
      const retryAfter = OTP_CONFIG.RESEND_COOLDOWN_SECONDS - elapsedSeconds;
      const err = new Error(
        `Harap tunggu ${retryAfter} detik sebelum meminta pengiriman ulang kode OTP.`,
      );
      (err as Error & { code?: string; statusCode?: number; retryAfter?: number }).code =
        ERROR_CODES.OTP_COOLDOWN_ACTIVE;
      (err as Error & { code?: string; statusCode?: number; retryAfter?: number }).statusCode = 429;
      (err as Error & { code?: string; statusCode?: number; retryAfter?: number }).retryAfter =
        retryAfter;
      throw err;
    }
  }

  const otpCode = generateSixDigitOtp();
  record.otpHash = computeOtpHash(challengeId, otpCode);
  record.attempts = 0;
  record.lastSentAt = now;
  record.expiresAt = now + OTP_CONFIG.EXPIRY_SECONDS * 1000;

  await redisManager.setKeyWithTtl(
    `${CHALLENGE_PREFIX}${challengeId}`,
    JSON.stringify(record),
    OTP_CONFIG.EXPIRY_SECONDS,
  );
  await redisManager.setKeyWithTtl(
    `${ACTIVE_USER_CHALLENGE_PREFIX}${record.userId}`,
    challengeId,
    OTP_CONFIG.EXPIRY_SECONDS,
  );

  return { otpCode, record };
}

/**
 * Verifies a 6-digit OTP code against the stored HMAC-SHA256 digest using constant-time comparison.
 * Consumes and deletes the challenge immediately upon success (single-use anti-replay).
 *
 * @param challengeId - Active challenge UUID.
 * @param submittedOtp - 6-digit numeric OTP entered by the operator.
 * @returns Verified challenge record.
 * @example
 * const record = await verifyAndConsumeOtpChallenge(challengeId, '123456');
 */
export async function verifyAndConsumeOtpChallenge(
  challengeId: string,
  submittedOtp: string,
  expectedUserId?: string,
): Promise<OtpChallengeRecord> {
  const key = `${CHALLENGE_PREFIX}${challengeId}`;
  const expectedHash = computeOtpHash(challengeId, submittedOtp);
  const res = await redisManager.consumeOtpChallengeAtomic(key, {
    expectedHash,
    expectedUserId,
    maxAttempts: OTP_CONFIG.MAX_ATTEMPTS,
    nowMs: Date.now(),
  });

  if (res.status === 'NOT_FOUND') {
    const err = new Error(
      'Kode OTP telah kedaluwarsa atau sudah digunakan. Silakan masuk kembali.',
    );
    (err as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.OTP_EXPIRED;
    (err as Error & { code?: string; statusCode?: number }).statusCode = 401;
    throw err;
  }

  if (res.status === 'EXPIRED') {
    const err = new Error('Kode OTP telah melewati batas waktu 5 menit. Silakan minta OTP baru.');
    (err as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.OTP_EXPIRED;
    (err as Error & { code?: string; statusCode?: number }).statusCode = 401;
    throw err;
  }

  if (res.status === 'USER_MISMATCH') {
    const err = new Error('Tantangan OTP tidak cocok dengan identitas akun.');
    (err as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.FORBIDDEN;
    (err as Error & { code?: string; statusCode?: number }).statusCode = 403;
    throw err;
  }

  if (res.status === 'MAX_ATTEMPTS') {
    const err = new Error(
      'Batas maksimal 3x percobaan OTP salah telah terlampaui. Silakan login ulang.',
    );
    (err as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.OTP_MAX_ATTEMPTS;
    (err as Error & { code?: string; statusCode?: number }).statusCode = 401;
    throw err;
  }

  if (res.status === 'INVALID') {
    const remainingAttempts = res.remainingAttempts ?? 0;
    const invalidErr = new Error(
      `Kode OTP tidak sesuai. Sisa kesempatan percobaan: ${remainingAttempts}x.`,
    );
    (invalidErr as Error & { code?: string; statusCode?: number }).code = ERROR_CODES.OTP_INVALID;
    (invalidErr as Error & { code?: string; statusCode?: number }).statusCode = 401;
    throw invalidErr;
  }

  const record = JSON.parse(res.record!) as OtpChallengeRecord;
  const activeKey = `${ACTIVE_USER_CHALLENGE_PREFIX}${record.userId}`;
  const activeId = await redisManager.getKey(activeKey);
  if (activeId === challengeId) {
    await redisManager.deleteKey(activeKey);
  }
  return record;
}

