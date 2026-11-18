import { NextResponse } from 'next/server';
import {
  ERROR_CODES,
  ERROR_MESSAGES_MAP,
  STANDARD_ERROR_MESSAGES,
} from '@repo/shared';
import { isPrismaConnectionError } from '@repo/database';
import { ServiceUnavailableError } from './live-data';

export interface SanitizeServerErrorOptions {
  context?: string;
  route?: string;
  defaultCode?: string;
  defaultMessage?: string;
}

interface ErrorLike {
  name?: string;
  code?: unknown;
  statusCode?: unknown;
  status?: unknown;
  message?: unknown;
  stack?: unknown;
  retryAfter?: unknown;
  errors?: Array<{ message?: unknown }>;
  issues?: Array<{ message?: unknown }>;
}

const PRISMA_ERROR_NAMES = new Set([
  'PrismaClientKnownRequestError',
  'PrismaClientUnknownRequestError',
  'PrismaClientRustPanicError',
  'PrismaClientInitializationError',
  'PrismaClientValidationError',
]);

const PRISMA_OR_SYSTEM_CODE_RE =
  /^(?:P\d{4}|(?:08|22|23|42|53|54|57|58|XX)[0-9A-Z]{3}|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|EHOSTUNREACH|EPIPE|EAI_AGAIN|ENOENT|EACCES|EPERM)$/;

const SERVER_LEAK_RE =
  /prisma|postgresql|postgres|\bpg_[a-z_]+|sqlstate|\bsql\b|\bselect\s+|\binsert\s+into\b|\bupdate\s+\S+\s+set\b|\bdelete\s+from\b|\bdrop\s+|\balter\s+|\brelation\s+"|column\s+"|unique constraint|foreign key constraint|syntax error|invocation:|invalid\s+`[^`]*`\s+invocation|violates\s+|queryraw|executeraw|schema\s+"|docker|redis|minio|ollama|database_url|jwt_secret|hmac_action_secret|node_modules|econnrefused|etimedout|enotfound|econnreset|ehostunreach|socket hang up|127\.0\.0\.1|localhost|172\.\d+\.|192\.168\.|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b0\.0\.0\.0\b|process\.env|typeerror|referenceerror|rangeerror|cannot read propert|is not a function|\bat\s+\S+\s*\(|\.[tj]sx?:\d+|checked:\s|[A-Za-z]:\\/i;

function isPrismaOrSystemLeak(error: unknown, errObj: ErrorLike | null, msg: string): boolean {
  if (errObj?.name && PRISMA_ERROR_NAMES.has(errObj.name)) {
    return true;
  }
  if (typeof errObj?.code === 'string' && PRISMA_OR_SYSTEM_CODE_RE.test(errObj.code)) {
    return true;
  }
  if (error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError) {
    return true;
  }
  if (msg.includes('\n') || SERVER_LEAK_RE.test(msg)) {
    return true;
  }
  return false;
}

function buildErrorResponse(
  status: number,
  code: string,
  message: string,
  extra?: { retryAfter?: number },
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(extra?.retryAfter !== undefined ? { retryAfter: extra.retryAfter } : {}),
      },
    },
    { status },
  );
}

const CODE_TO_STATUS_MAP: Record<string, number> = {
  [ERROR_CODES.INVALID_CREDENTIALS]: 401,
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.SESSION_REVOKED]: 401,
  [ERROR_CODES.TOKEN_REUSE_DETECTED]: 401,
  [ERROR_CODES.TOKEN_EXPIRED]: 401,
  [ERROR_CODES.OTP_INVALID]: 401,
  [ERROR_CODES.OTP_EXPIRED]: 401,
  [ERROR_CODES.OTP_MAX_ATTEMPTS]: 401,
  [ERROR_CODES.OTP_COOLDOWN_ACTIVE]: 429,
  [ERROR_CODES.RATE_LIMITED]: 429,
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 429,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.HIERARCHY_VIOLATION]: 403,
  [ERROR_CODES.IDOR_VIOLATION]: 403,
  [ERROR_CODES.MOCK_LOCATION_DETECTED]: 403,
  [ERROR_CODES.CLUSTER_ACCESS_DENIED]: 403,
  [ERROR_CODES.GPS_ANOMALY_DETECTED]: 403,
  [ERROR_CODES.CUSTOMER_NOT_FOUND]: 404,
  [ERROR_CODES.TECH_NOT_FOUND]: 404,
  [ERROR_CODES.TICKET_NOT_FOUND]: 404,
  [ERROR_CODES.CLUSTER_NOT_FOUND]: 404,
  [ERROR_CODES.PORT_OCCUPIED]: 409,
  [ERROR_CODES.TICKET_ALREADY_CLOSED]: 409,
  [ERROR_CODES.ACTION_TOKEN_REPLAYED]: 409,
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.INVALID_ACTION_TOKEN]: 400,
  [ERROR_CODES.AI_ACTION_EXPIRED]: 400,
  [ERROR_CODES.INVALID_GEOFENCE]: 400,
  [ERROR_CODES.UPGRADE_REQUIRED]: 426,
};

export function sanitizeAndLogServerError(
  error: unknown,
  options: SanitizeServerErrorOptions = {},
): NextResponse {
  const errObj =
    typeof error === 'object' && error !== null ? (error as ErrorLike) : null;
  const rawMessage = typeof errObj?.message === 'string' ? errObj.message : String(error ?? '');
  const logLabel = options.route || options.context || 'SERVER';

  // Always preserve full server-side diagnostic logging
  console.error(`[API Error:${logLabel}]`, {
    name: errObj?.name,
    code: errObj?.code,
    statusCode: errObj?.statusCode ?? errObj?.status,
    message: rawMessage,
    stack: errObj?.stack,
  });

  // 1. ServiceUnavailableError or Prisma TCP/connection failure -> 503 SYSTEM_PROCESSING_ERROR
  if (error instanceof ServiceUnavailableError || errObj?.name === 'ServiceUnavailableError') {
    return buildErrorResponse(
      503,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
    );
  }
  if (isPrismaConnectionError(error)) {
    return buildErrorResponse(
      503,
      ERROR_CODES.SERVICE_UNAVAILABLE,
      STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
    );
  }

  // 2. AuthHttpError / TechHttpError (safe explicit HTTP errors)
  if (errObj?.name === 'AuthHttpError' || errObj?.name === 'TechHttpError') {
    const status = typeof errObj.status === 'number' ? errObj.status : 401;
    const code = typeof errObj.code === 'string' ? errObj.code : ERROR_CODES.UNAUTHORIZED;
    const safeMsg = isPrismaOrSystemLeak(error, errObj, rawMessage)
      ? STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR
      : rawMessage || ERROR_MESSAGES_MAP[code] || STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR;
    return buildErrorResponse(status, code, safeMsg);
  }

  // 3. Zod validation error -> 400 VALIDATION_ERROR (omit raw Zod details array)
  if (errObj?.name === 'ZodError') {
    const firstIssue = errObj.errors?.[0]?.message ?? errObj.issues?.[0]?.message;
    const candidate = typeof firstIssue === 'string' ? firstIssue.trim() : '';
    const safeMsg =
      candidate && !isPrismaOrSystemLeak(error, null, candidate)
        ? candidate
        : 'Validasi input gagal.';
    return buildErrorResponse(400, ERROR_CODES.VALIDATION_ERROR, safeMsg);
  }

  // 4. Malformed JSON request body -> 400 VALIDATION_ERROR
  if (error instanceof SyntaxError) {
    return buildErrorResponse(400, ERROR_CODES.VALIDATION_ERROR, 'Format payload JSON tidak valid.');
  }

  // 5. Explicit Prisma known error code mapping without leaking codes, targets, or queries
  const errCode = typeof errObj?.code === 'string' ? errObj.code.trim().toUpperCase() : '';
  if (errCode === 'P2002') {
    return buildErrorResponse(
      409,
      'CONFLICT',
      'Data dengan identitas yang sama sudah terdaftar dalam sistem.',
    );
  }
  if (errCode === 'P2025') {
    return buildErrorResponse(404, 'NOT_FOUND', 'Data yang diminta tidak ditemukan.');
  }
  if (errCode === 'P2003' || errCode === 'P2023') {
    return buildErrorResponse(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Referensi atau format identitas data tidak valid.',
    );
  }

  // 6. Hard Prisma/PG/System/Stack Leak Gate (BEFORE domain string matching or caller status)
  const isPrismaInstance = Boolean(errObj?.name && PRISMA_ERROR_NAMES.has(errObj.name));
  const hasSystemCode = Boolean(errCode && PRISMA_OR_SYSTEM_CODE_RE.test(errCode));
  if (isPrismaInstance || hasSystemCode) {
    return buildErrorResponse(
      500,
      ERROR_CODES.INTERNAL_ERROR,
      STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
    );
  }

  // Normalize known safe service "tidak ditemukan di PostgreSQL/DB" before leak regex
  const cleanedDomainMsg = /(?:tidak ditemukan|belum tersedia)/i.test(rawMessage)
    ? rawMessage.replace(/\s+(?:di|dari)\s+(?:postgresql|db)\b/gi, '').trim()
    : rawMessage.trim();

  if (isPrismaOrSystemLeak(error, errObj, cleanedDomainMsg)) {
    return buildErrorResponse(
      500,
      ERROR_CODES.INTERNAL_ERROR,
      STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
    );
  }

  // 7. Explicit Telegram 502 gateway error (no internal details)
  if (errObj?.code === ERROR_CODES.TELEGRAM_DELIVERY_FAILED && errObj?.statusCode === 502) {
    return buildErrorResponse(
      502,
      ERROR_CODES.TELEGRAM_DELIVERY_FAILED,
      cleanedDomainMsg || ERROR_MESSAGES_MAP[ERROR_CODES.TELEGRAM_DELIVERY_FAILED],
    );
  }

  // 8. Explicit 4xx statusCode or registered ERROR_CODES property on domain errors
  const retryAfter = typeof errObj?.retryAfter === 'number' ? errObj.retryAfter : undefined;
  const explicitStatus = typeof errObj?.statusCode === 'number' ? errObj.statusCode : undefined;
  const explicitCode = typeof errObj?.code === 'string' ? errObj.code : undefined;

  if (explicitStatus && explicitStatus >= 400 && explicitStatus < 500) {
    const resolvedCode = explicitCode || options.defaultCode || ERROR_CODES.VALIDATION_ERROR;
    return buildErrorResponse(
      explicitStatus,
      resolvedCode,
      cleanedDomainMsg || ERROR_MESSAGES_MAP[resolvedCode] || STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
      { retryAfter },
    );
  }

  if (explicitCode && CODE_TO_STATUS_MAP[explicitCode]) {
    return buildErrorResponse(
      CODE_TO_STATUS_MAP[explicitCode],
      explicitCode,
      cleanedDomainMsg || ERROR_MESSAGES_MAP[explicitCode],
      { retryAfter },
    );
  }

  // 9. Known plain-Error domain strings thrown by services
  if (cleanedDomainMsg.includes(ERROR_CODES.FORBIDDEN)) {
    return buildErrorResponse(403, ERROR_CODES.FORBIDDEN, cleanedDomainMsg);
  }
  if (cleanedDomainMsg.includes(ERROR_CODES.HIERARCHY_VIOLATION)) {
    return buildErrorResponse(403, ERROR_CODES.HIERARCHY_VIOLATION, cleanedDomainMsg);
  }
  if (cleanedDomainMsg.includes(ERROR_CODES.IDOR_VIOLATION)) {
    return buildErrorResponse(403, ERROR_CODES.IDOR_VIOLATION, cleanedDomainMsg);
  }
  if (cleanedDomainMsg.includes(ERROR_CODES.MOCK_LOCATION_DETECTED)) {
    return buildErrorResponse(403, ERROR_CODES.MOCK_LOCATION_DETECTED, cleanedDomainMsg);
  }
  if (/simulasi demo dinonaktifkan/i.test(cleanedDomainMsg)) {
    return buildErrorResponse(403, ERROR_CODES.FORBIDDEN, cleanedDomainMsg);
  }
  if (cleanedDomainMsg.includes(ERROR_CODES.PORT_OCCUPIED)) {
    return buildErrorResponse(409, ERROR_CODES.PORT_OCCUPIED, cleanedDomainMsg);
  }
  if (cleanedDomainMsg.includes(ERROR_CODES.ACTION_TOKEN_REPLAYED)) {
    return buildErrorResponse(409, ERROR_CODES.ACTION_TOKEN_REPLAYED, cleanedDomainMsg);
  }
  if (
    cleanedDomainMsg.includes(ERROR_CODES.TICKET_ALREADY_CLOSED) ||
    cleanedDomainMsg.includes('tidak dapat dimutasi') ||
    cleanedDomainMsg.includes('bisa dimulai kembali')
  ) {
    return buildErrorResponse(409, ERROR_CODES.TICKET_ALREADY_CLOSED, cleanedDomainMsg);
  }
  if (cleanedDomainMsg.includes(ERROR_CODES.TOKEN_REUSE_DETECTED)) {
    return buildErrorResponse(
      401,
      ERROR_CODES.TOKEN_REUSE_DETECTED,
      ERROR_MESSAGES_MAP[ERROR_CODES.TOKEN_REUSE_DETECTED],
    );
  }
  if (cleanedDomainMsg.includes(ERROR_CODES.SESSION_REVOKED)) {
    return buildErrorResponse(
      401,
      ERROR_CODES.SESSION_REVOKED,
      ERROR_MESSAGES_MAP[ERROR_CODES.SESSION_REVOKED],
    );
  }
  if (cleanedDomainMsg.includes(ERROR_CODES.UNAUTHORIZED)) {
    return buildErrorResponse(
      401,
      ERROR_CODES.UNAUTHORIZED,
      ERROR_MESSAGES_MAP[ERROR_CODES.UNAUTHORIZED],
    );
  }
  if (cleanedDomainMsg.includes(ERROR_CODES.OTP_EXPIRED)) {
    return buildErrorResponse(
      401,
      ERROR_CODES.OTP_EXPIRED,
      ERROR_MESSAGES_MAP[ERROR_CODES.OTP_EXPIRED],
    );
  }
  if (
    cleanedDomainMsg.includes(ERROR_CODES.AI_ACTION_EXPIRED) ||
    cleanedDomainMsg.includes('kedaluwarsa')
  ) {
    return buildErrorResponse(400, ERROR_CODES.AI_ACTION_EXPIRED, cleanedDomainMsg);
  }
  if (
    cleanedDomainMsg.includes(ERROR_CODES.INVALID_ACTION_TOKEN) ||
    cleanedDomainMsg.includes('manipulasi')
  ) {
    return buildErrorResponse(400, ERROR_CODES.INVALID_ACTION_TOKEN, cleanedDomainMsg);
  }
  if (cleanedDomainMsg.includes(ERROR_CODES.CLUSTER_NOT_FOUND)) {
    return buildErrorResponse(404, ERROR_CODES.CLUSTER_NOT_FOUND, cleanedDomainMsg);
  }
  if (/tidak ditemukan/i.test(cleanedDomainMsg)) {
    const notFoundCode = /tiket/i.test(cleanedDomainMsg)
      ? ERROR_CODES.TICKET_NOT_FOUND
      : /pelanggan/i.test(cleanedDomainMsg)
        ? ERROR_CODES.CUSTOMER_NOT_FOUND
        : /teknisi/i.test(cleanedDomainMsg)
          ? ERROR_CODES.TECH_NOT_FOUND
          : /cluster/i.test(cleanedDomainMsg)
            ? ERROR_CODES.CLUSTER_NOT_FOUND
            : options.defaultCode || 'NOT_FOUND';
    return buildErrorResponse(404, notFoundCode, cleanedDomainMsg);
  }
  if (
    /sudah terdaftar/i.test(cleanedDomainMsg) ||
    /masih terisi pelanggan aktif/i.test(cleanedDomainMsg)
  ) {
    return buildErrorResponse(409, options.defaultCode || 'CONFLICT', cleanedDomainMsg);
  }
  if (/melebihi.*kapasitas|tidak dikenali/i.test(cleanedDomainMsg)) {
    return buildErrorResponse(400, ERROR_CODES.VALIDATION_ERROR, cleanedDomainMsg);
  }

  // 10. Unrecognized / internal errors MUST default to 500 SYSTEM_PROCESSING_ERROR
  return buildErrorResponse(
    500,
    ERROR_CODES.INTERNAL_ERROR,
    STANDARD_ERROR_MESSAGES.SYSTEM_PROCESSING_ERROR,
  );
}
