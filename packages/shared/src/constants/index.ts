export type DbmStatus = 'Normal' | 'Warning' | 'Critical';

// Ambang batas redaman optik (PRD 3.4 & AGENT.md Section 5)
export const ATTENUATION_THRESHOLDS = {
  NORMAL_MIN: -22.0,
  NORMAL_MAX: -15.0,
  WARNING_MIN: -25.0,
  WARNING_MAX: -22.1,
  CRITICAL_BELOW: -25.0, // Di bawah -25 dBm (lebih buruk dari -25.0)
  CRITICAL_ABOVE: -10.0, // Optik terbakar/overpower
} as const;

export function classifyDbm(value: number | string): DbmStatus {
  const v = typeof value === 'number' ? value : Number(value);
  if (isNaN(v)) return 'Warning';
  if (v < ATTENUATION_THRESHOLDS.CRITICAL_BELOW || v > ATTENUATION_THRESHOLDS.CRITICAL_ABOVE) {
    return 'Critical';
  }
  if (v >= ATTENUATION_THRESHOLDS.NORMAL_MIN && v <= ATTENUATION_THRESHOLDS.NORMAL_MAX) {
    return 'Normal';
  }
  return 'Warning';
}

export const dbmTone = (value: number | string): 'green' | 'orange' | 'red' => {
  const status = classifyDbm(value);
  switch (status) {
    case 'Normal':
      return 'green';
    case 'Warning':
      return 'orange';
    case 'Critical':
      return 'red';
  }
};

// Batas toleransi jarak geofencing anti-fake GPS teknisi terhadap ODP (PRD 3.3 & AGENT.md Section 4)
export const MAX_GEOFENCE_RADIUS_METERS = 100;

// Versi minimum aplikasi mobile teknisi (Law 4 - App Version Gate HTTP 426)
export const MIN_MOBILE_APP_VERSION = '1.0.0';
export const CURRENT_MOBILE_APP_VERSION = '1.0.0';

export const TICKET_TYPES = {
  PSB: 'PSB',
  MAINTENANCE: 'MAINTENANCE',
} as const;

export type TicketTypeEnum = (typeof TICKET_TYPES)[keyof typeof TICKET_TYPES];

export const TICKET_STATUSES = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type TicketStatusEnum = (typeof TICKET_STATUSES)[keyof typeof TICKET_STATUSES];

export const CUSTOMER_STATUSES = {
  PENDING_INSTALL: 'PENDING_INSTALL',
  ACTIVE: 'ACTIVE',
  ISOLATED: 'ISOLATED',
  DISMANTLED: 'DISMANTLED',
} as const;

export type CustomerStatusEnum = (typeof CUSTOMER_STATUSES)[keyof typeof CUSTOMER_STATUSES];

export const USER_TYPES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  TECHNICIAN: 'TECHNICIAN',
} as const;

export type UserTypeEnum = (typeof USER_TYPES)[keyof typeof USER_TYPES];

export const HIERARCHY_LEVELS = {
  SUPER_ADMIN: 100,
  ADMIN: 50,
  TECHNICIAN: 10,
} as const;

// Header unbuffered Nginx SSE (AGENT.md Section 5)
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

// Kode error terpusat
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SESSION_REVOKED: 'SESSION_REVOKED',
  UPGRADE_REQUIRED: 'UPGRADE_REQUIRED', // HTTP 426 Upgrade Required
  IDEMPOTENT_REPLAY: 'IDEMPOTENT_REPLAY',
  PORT_OCCUPIED: 'PORT_OCCUPIED',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  TECH_NOT_FOUND: 'TECH_NOT_FOUND',
  TICKET_NOT_FOUND: 'TICKET_NOT_FOUND',
  CLUSTER_NOT_FOUND: 'CLUSTER_NOT_FOUND',
  INVALID_GEOFENCE: 'INVALID_GEOFENCE',
  MOCK_LOCATION_DETECTED: 'MOCK_LOCATION_DETECTED',
  AI_ACTION_EXPIRED: 'AI_ACTION_EXPIRED',
  INVALID_ACTION_TOKEN: 'INVALID_ACTION_TOKEN',
  HIERARCHY_VIOLATION: 'HIERARCHY_VIOLATION',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
