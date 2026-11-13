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

export interface SplitterPortActivity {
  type: 'PEMASANGAN' | 'MAINTENANCE' | 'PENARIKAN';
  date: string;
  technician: string;
  ticketNumber?: string;
  notes?: string;
}

export interface SplitterPortState {
  portNumber: number;
  isOccupied: boolean;
  customerId?: string;
  customerName?: string;
  siaNumber?: string;
  attenuation?: number;
  attenuationHistory?: number[];
  lastActivity?: SplitterPortActivity;
  status?: string;
}

export interface ClusterListItem {
  id: string;
  clusterCode: string;
  name: string;
  splitterCode: string;
  usedPorts: number;
  maxPorts: number;
  lat: number;
  lng: number;
  ports: SplitterPortState[];
}

export interface NetworkStats {
  totalClusters: number;
  totalSplitters: number;
  totalCapacity: number;
  usedCapacity: number;
  availableCapacity: number;
}

export interface CustomerListItem {
  id: string;
  siaNumber: string;
  fullName: string;
  address: string;
  lat?: number;
  lng?: number;
  kecamatan?: string;
  kelurahan?: string;
  street?: string;
  cluster: string;
  clusterCode: string;
  splitterCode: string;
  portNumber: number;
  currentAttenuation: number;
  status: string;
  updatedAt: string;
}

export interface DbTicketPendingSubmission {
  submissionId: string;
  splitterId: string;
  splitterCode: string;
  portNumber: number;
  attenuationDbm: number;
  photoObjectKey: string;
  photoUrl?: string;
  submittedLat: number;
  submittedLng: number;
  distanceToSplitterM: number;
  isLocationFlagged: boolean;
  clientRecordedAt?: string;
  technicianNotes?: string;
  channel?: 'WEB' | 'MOBILE' | 'TELEGRAM';
  submittedAt: string;
  techUsername: string;
  techFullName: string;
}

export interface DbTicket {
  id: string;
  ticketNumber: string;
  customerName: string;
  siaNumber: string;
  ticketType: 'Pasang baru' | 'Perbaikan' | 'Maintenance' | 'Instalasi';
  cluster: string;
  clusterCode?: string;
  assignedTech: string;
  assignedTechUsername?: string;
  vendorName?: string;
  techInitials: string;
  status: 'Menunggu' | 'Dalam proses' | 'Menunggu verifikasi' | 'Selesai' | 'Dibatalkan';
  priority?: 'Normal' | 'High' | 'Low';
  currentAttenuation: number;
  complaintSummary?: string;
  customerPhone?: string;
  serviceAddress?: string;
  locationPlace?: string;
  targetLat?: number;
  targetLng?: number;
  adminNotes?: string;
  rejectionReason?: string;
  dispatchedAt?: string;
  startedAt?: string;
  createdAt: string;
  completedAt?: string;
  splitterCode?: string;
  portNumber?: number;
  distanceToSplitterM?: number;
  isLocationFlagged?: boolean;
  pendingSubmission?: DbTicketPendingSubmission;
}

export interface TechnicianListItem {
  id: string;
  nik?: string | null;
  username: string;
  fullName: string;
  vendorCompany?: string | null;
  telegramBound?: boolean;
  cluster: string;
  initials: string;
  isActive: boolean;
  activeTicketsCount: number;
  completedTicketsCount: number;
  phoneNumber?: string;
  deviceModel?: string;
  deviceId?: string;
  appVersion?: string;
  sessionStatus?: 'ACTIVE_SESSION' | 'REVOKED' | 'NO_SESSION';
  lastActiveAt?: string;
  isMockLocationDetected?: boolean;
  activeWorkOrders?: {
    ticketNumber: string;
    customerName: string;
    ticketType: string;
    splitterCode?: string;
  }[];
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

export interface ClusterOptionItem {
  id: string;
  clusterCode: string;
  name: string;
  centerLat: number;
  centerLng: number;
  isActive: boolean;
  splittersCount: number;
}

export interface OdpHistoryEntry {
  id: string;
  ticketNumber: string;
  customerName: string;
  siaNumber: string;
  splitterCode: string;
  portNumber: number;
  actionType: 'PEMASANGAN' | 'MAINTENANCE' | 'PENARIKAN' | 'AUDIT';
  oldAttenuation: number | null;
  newAttenuation: number;
  technicianName: string;
  distanceToSplitterM: number | null;
  isLocationFlagged: boolean;
  notes?: string;
  timestamp: string;
}

export interface NetworkAuditFinding {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'CAPACITY' | 'ATTENUATION' | 'DOUBLE_BOOKING' | 'GEOFENCE';
  clusterCode: string;
  splitterCode: string;
  title: string;
  description: string;
}

export interface NetworkAuditResult {
  auditedAt: string;
  totalClusters: number;
  totalSplitters: number;
  totalPorts: number;
  usedPorts: number;
  warningSplitters: number;
  criticalAttenuationCount: number;
  doubleBookedPorts: number;
  geofenceAnomalies: number;
  findings: NetworkAuditFinding[];
}

export interface AdminUserItem {
  id: string;
  nik: string | null;
  username: string;
  fullName: string;
  vendorCompany?: string | null;
  role: string;
  roleId: string;
  userType: UserTypeEnum;
  hierarchyLevel: number;
  assignedClusters: string[];
  isActive: boolean;
  twoFactorEnabled: boolean;
  telegramChatId: string | null;
  lastActiveAt: string | null;
  createdAt: string;
}
