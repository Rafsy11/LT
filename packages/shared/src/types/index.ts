import { ErrorCode, UserTypeEnum } from '../constants/index';

export type ApiResponse<T> =
  | { success: true; data: T; meta?: Record<string, unknown> }
  | { success: false; error: { code: ErrorCode | string; message: string; details?: unknown } };

export interface UserSessionContext {
  userId: string;
  username: string;
  fullName: string;
  role: string;
  userType: UserTypeEnum;
  hierarchyLevel: number;
  assignedClusters: string[];
  deviceId?: string;
}

export interface JwtTokenPayload {
  sub: string;
  username: string;
  role: string;
  userType: UserTypeEnum;
  hierarchyLevel: number;
  assignedClusters: string[];
  deviceId?: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  deviceId: string;
  iat?: number;
  exp?: number;
}

export interface OverviewStats {
  activeCustomers: number;
  activeCustomersChange: string;
  activeTickets: number;
  pendingTicketsCount: number;
  fieldTechnicians: number;
  totalTechnicians: number;
  networkHealth: number;
  networkHealthChange: string;
}

export interface ActivityFeedItem {
  id: string;
  ticketNumber: string;
  title: string;
  customerName: string;
  siaNumber: string;
  clusterName: string;
  technicianName: string;
  techInitials: string;
  attenuationDbm: number;
  status: 'Normal' | 'Warning' | 'Critical';
  type: 'Pasang baru' | 'Maintenance' | 'Tiket ditugaskan';
  timestamp: string;
  isUnread?: boolean;
}

export interface SplitterPortState {
  portNumber: number;
  isOccupied: boolean;
  customerId?: string;
  customerName?: string;
  siaNumber?: string;
}

export interface SignedActionToken {
  token: string;
  actionType: 'CREATE_TICKET' | 'TOGGLE_TECH_ACCOUNT' | 'MUTATE_SPLITTER_PORT';
  payload: Record<string, unknown>;
  issuedAt: number;
  expiresAt: number;
}

export interface DraftActionCardData {
  requiresConfirmation: true;
  actionType: 'CREATE_TICKET' | 'TOGGLE_TECH_ACCOUNT' | 'MUTATE_SPLITTER_PORT';
  title: string;
  summary: string;
  actionToken: string;
  payload: Record<string, unknown>;
}
