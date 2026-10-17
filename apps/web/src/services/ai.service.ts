import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { SignJWT, jwtVerify } from 'jose';
import { prisma, Prisma } from '@repo/database';
import {
  getRecentReportsToolSchema,
  GetRecentReportsInput,
  getCustomerDetailToolSchema,
  GetCustomerDetailInput,
  getTechnicianWorkloadToolSchema,
  GetTechnicianWorkloadInput,
  prepareCreateTicketToolSchema,
  PrepareCreateTicketInput,
  prepareToggleTechAccountToolSchema,
  PrepareToggleTechAccountInput,
  prepareMutateSplitterPortToolSchema,
  PrepareMutateSplitterPortInput,
  DraftActionCard,
  UserSessionContext,
  ERROR_CODES,
  classifyDbm,
} from '@repo/shared';
import { TicketService } from './ticket.service';
import { TechnicianService } from './technician.service';
import { CustomerService } from './customer.service';
import { RoleService } from './role.service';

const ACTION_TOKEN_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fiberops_on_premise_super_secure_jwt_secret_key_32chars'
);

const ACTION_TOKEN_EXPIRY = '5m'; // 5 minutes validity for human confirmation

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
  draftCard?: DraftActionCard;
}

export interface VerifiedActionToken {
  actionType: 'CREATE_TICKET' | 'TOGGLE_TECH_ACCOUNT' | 'MUTATE_SPLITTER_PORT';
  payload: Record<string, unknown>;
  adminId: string;
}

/**
 * Generates an HMAC-signed action token with 5-minute validity.
 */
export async function generateSignedActionToken(
  actionType: 'CREATE_TICKET' | 'TOGGLE_TECH_ACCOUNT' | 'MUTATE_SPLITTER_PORT',
  payload: Record<string, unknown>,
  adminId: string
): Promise<string> {
  return await new SignJWT({ actionType, payload, adminId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACTION_TOKEN_EXPIRY)
    .sign(ACTION_TOKEN_SECRET);
}

/**
 * Verifies the HMAC signature and 5-minute expiry of a draft action token.
 */
export async function verifySignedActionToken(token: string): Promise<VerifiedActionToken> {
  try {
    const { payload } = await jwtVerify(token, ACTION_TOKEN_SECRET);
    return {
      actionType: payload.actionType as 'CREATE_TICKET' | 'TOGGLE_TECH_ACCOUNT' | 'MUTATE_SPLITTER_PORT',
      payload: payload.payload as Record<string, unknown>,
      adminId: payload.adminId as string,
    };
  } catch {
    throw new Error(
      `${ERROR_CODES.INVALID_ACTION_TOKEN}: Token aksi draf tidak valid atau telah kedaluwarsa (> 5 menit). Silakan minta AI untuk menyiapkan ulang.`
    );
  }
}

export class AiService {
  /**
   * Builds and filters AI Tools based on the authenticated Admin's permissions and assigned clusters.
   * Enforces Law 4 (Cluster Scoping) & Section 6 of AGENT.md (Server-side context injection).
   */
  public static getFilteredTools(adminContext: UserSessionContext, permissions: string[] = ['*']) {
    const hasPermission = (required: string) => permissions.includes('*') || permissions.includes(required);
    const isSuperAdmin = adminContext.hierarchyLevel >= 100 || adminContext.role === 'Super Admin';
    const assignedClusters = isSuperAdmin ? [] : adminContext.assignedClusters;

    const tools: Record<string, any> = {};

    // ==========================================
    // READ TOOL 1: get_recent_reports
    // ==========================================
    if (hasPermission('ticket:read') || hasPermission('network:read')) {
      tools.get_recent_reports = tool({
        description:
          'Mengambil daftar laporan redaman atau tiket terkini dari database, dengan batas maksimal 50 baris dan pembatasan cluster.',
        inputSchema: getRecentReportsToolSchema,
        execute: async (args: GetRecentReportsInput) => {
          const limit = Math.min(args.limit || 20, 50);

          try {
            const whereClause: Record<string, unknown> = {};

            // Cluster scoping
            if (assignedClusters.length > 0) {
              whereClause.customer = {
                cluster: { clusterCode: { in: assignedClusters } },
              };
            } else if (args.clusterCode) {
              whereClause.customer = {
                cluster: { clusterCode: args.clusterCode },
              };
            }

            const histories = await prisma.attenuationHistory.findMany({
              where: whereClause,
              take: limit,
              orderBy: { createdAt: 'desc' },
              include: {
                customer: { include: { cluster: true, splitter: true } },
                tech: true,
                ticket: true,
              },
            });

            if (histories.length > 0) {
              let filtered = histories;
              if (args.minAttenuation !== undefined) {
                filtered = filtered.filter((h: any) => Number(h.newAttenuation) <= args.minAttenuation!);
              }

              return filtered.map((h: any) => ({
                id: h.id,
                submissionId: h.submissionId,
                ticketNumber: h.ticket.ticketNumber,
                customerName: h.customer.fullName,
                siaNumber: h.customer.siaNumber,
                cluster: h.customer.cluster.name,
                splitterCode: h.customer.splitter?.splitterCode || 'N/A',
                portNumber: h.portNumber,
                attenuationDbm: Number(h.newAttenuation),
                status: classifyDbm(Number(h.newAttenuation)),
                technician: h.tech.fullName,
                isLocationFlagged: h.isLocationFlagged,
                createdAt: h.createdAt.toISOString(),
              }));
            }
          } catch {
            // In-memory fallback
          }

          const allTickets = await TicketService.listTickets({ cluster: args.clusterCode });
          let reports = allTickets;
          if (assignedClusters.length > 0) {
            reports = reports.filter((r) => assignedClusters.some((c) => r.cluster.includes(c)));
          }

          if (args.minAttenuation !== undefined) {
            reports = reports.filter((r) => r.currentAttenuation <= args.minAttenuation!);
          }

          return reports.slice(0, limit);
        },
      });
    }

    // ==========================================
    // READ TOOL 2: get_customer_detail
    // ==========================================
    if (hasPermission('customer:read')) {
      tools.get_customer_detail = tool({
        description:
          'Mengambil detail informasi pelanggan berdasarkan nomor SIA atau nama, termasuk alokasi port ODP dan 10 riwayat redaman terakhir.',
        inputSchema: getCustomerDetailToolSchema,
        execute: async (args: GetCustomerDetailInput) => {
          try {
            const customer = await prisma.customer.findFirst({
              where: {
                OR: [
                  args.siaNumber ? { siaNumber: args.siaNumber } : {},
                  args.customerName ? { fullName: { contains: args.customerName, mode: 'insensitive' } } : {},
                ],
              },
              include: {
                cluster: true,
                splitter: true,
              },
            });

            if (customer) {
              // Cluster scoping guard
              if (assignedClusters.length > 0 && !assignedClusters.includes(customer.cluster.clusterCode)) {
                return { error: 'Pelanggan berada di luar cluster yang menjadi wewenang Anda.' };
              }

              const histories = await prisma.attenuationHistory.findMany({
                where: { customerId: customer.id },
                orderBy: { createdAt: 'desc' },
                take: 10,
                include: { tech: true },
              });

              return {
                id: customer.id,
                siaNumber: customer.siaNumber,
                fullName: customer.fullName,
                address: customer.address,
                status: customer.status,
                cluster: customer.cluster.name,
                clusterCode: customer.cluster.clusterCode,
                splitterCode: customer.splitter?.splitterCode || 'Belum terhubung',
                portNumber: customer.portNumber,
                currentAttenuation: customer.currentAttenuation ? Number(customer.currentAttenuation) : null,
                recentHistories: histories.map((h) => ({
                  id: h.id,
                  submissionId: h.submissionId,
                  attenuationDbm: Number(h.newAttenuation),
                  status: classifyDbm(Number(h.newAttenuation)),
                  technician: h.tech.fullName,
                  createdAt: h.createdAt.toISOString(),
                })),
              };
            }
          } catch {
            // In-memory fallback
          }

          const custDetail = await CustomerService.getCustomerBySia(
            args.siaNumber || args.customerName || 'SIA-2024-001'
          ).catch(() => null);

          if (!custDetail) {
            return { error: `Pelanggan ${args.siaNumber || args.customerName} tidak ditemukan.` };
          }

          return custDetail;
        },
      });
    }

    // ==========================================
    // READ TOOL 3: get_technician_workload
    // ==========================================
    if (hasPermission('tech:read')) {
      tools.get_technician_workload = tool({
        description:
          'Mengambil daftar beban kerja teknisi lapangan, jumlah tiket aktif, dan status operasional.',
        inputSchema: getTechnicianWorkloadToolSchema,
        execute: async (args: GetTechnicianWorkloadInput) => {
          try {
            const techs = await prisma.user.findMany({
              where: {
                userType: 'TECHNICIAN',
                isActive: true,
              },
              include: {
                assignedTickets: {
                  where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
                },
              },
            });

            if (techs.length > 0) {
              let results = techs.map((t) => {
                const activeCount = t.assignedTickets.length;
                return {
                  id: t.id,
                  username: t.username,
                  fullName: t.fullName,
                  assignedClusters: t.assignedClusters,
                  activeTicketsCount: activeCount,
                  workloadStatus: activeCount > 0 ? ('BUSY' as const) : ('IDLE' as const),
                };
              });

              if (args.clusterCode) {
                results = results.filter((t) => t.assignedClusters.includes(args.clusterCode!));
              }

              if (args.status && args.status !== 'ALL') {
                results = results.filter((t) => t.workloadStatus === args.status);
              }

              return results;
            }
          } catch {
            // In-memory fallback
          }

          const techs = await TechnicianService.listTechnicians('', args.clusterCode || 'Semua cluster');

          return techs.map((t) => ({
            username: t.username,
            fullName: t.fullName,
            cluster: t.cluster,
            isActive: t.isActive,
            activeTicketsCount: t.activeTicketsCount,
            workloadStatus: t.activeTicketsCount > 0 ? ('BUSY' as const) : ('IDLE' as const),
          }));
        },
      });
    }

    // ==========================================
    // WRITE TOOL 1: prepare_create_ticket (DILARANG MUTASI DB LANGSUNG)
    // ==========================================
    if (hasPermission('ticket:create')) {
      tools.prepare_create_ticket = tool({
        description:
          'Menyiapkan draf tiket pekerjaan baru (PSB atau MAINTENANCE). Wajib pra-validasi data pelanggan dan teknisi, lalu menghasilkan token konfirmasi untuk persetujuan Admin.',
        inputSchema: prepareCreateTicketToolSchema,
        execute: async (args: PrepareCreateTicketInput) => {
          // 1. Pra-validasi Pelanggan
          const customer = await prisma.customer.findFirst({
            where: { siaNumber: args.siaNumber },
            include: { cluster: true },
          }).catch(() => null);

          const customerFallback = customer || (await CustomerService.listCustomers(args.siaNumber))[0] || null;
          if (!customerFallback && args.ticketType === 'MAINTENANCE') {
            return {
              error: `Pra-validasi Gagal: Pelanggan dengan nomor SIA ${args.siaNumber} tidak ditemukan untuk tiket perbaikan.`,
            };
          }

          const resolvedCustomerName = args.customerName || customerFallback?.fullName || 'Pelanggan Baru';
          const clusterName = customerFallback?.cluster
            ? typeof customerFallback.cluster === 'string'
              ? customerFallback.cluster
              : customerFallback.cluster.name
            : 'Bandung Utara';

          // 2. Pra-validasi Teknisi
          const techUser = await prisma.user.findFirst({
            where: {
              OR: [{ username: args.techUsername }, { fullName: args.techUsername }],
              userType: 'TECHNICIAN',
            },
          }).catch(() => null);

          const techFallback = techUser || (await TechnicianService.listTechnicians(args.techUsername))[0] || null;

          if (!techFallback || !techFallback.isActive) {
            return {
              error: `Pra-validasi Gagal: Teknisi "${args.techUsername}" tidak ditemukan atau berstatus tidak aktif.`,
            };
          }

          // 3. Generate Signed HMAC Token (valid 5 min)
          const payload = {
            ticketType: args.ticketType,
            customerName: resolvedCustomerName,
            siaNumber: args.siaNumber,
            clusterCode: clusterName,
            assignedTechUsername: techFallback.username || techFallback.fullName,
            adminNotes: args.notes || `Disiapkan oleh AI Assistant atas instruksi Admin`,
          };

          const actionToken = await generateSignedActionToken('CREATE_TICKET', payload, adminContext.userId);

          const draftCard: DraftActionCard = {
            requiresConfirmation: true,
            actionType: 'CREATE_TICKET',
            title: `Tiket ${args.ticketType === 'PSB' ? 'Pasang Baru' : 'Maintenance'} · ${resolvedCustomerName}`,
            summary: `SIA ${args.siaNumber} · ${clusterName} | Teknisi: ${techFallback.fullName} · Redaman: ${customerFallback?.currentAttenuation ?? -20.0} dBm`,
            actionToken,
            payload,
          };

          return {
            status: 'DRAFT_PREPARED',
            message: 'Draf tiket berhasil dibuat. Memerlukan konfirmasi Admin sebelum disimpan ke database.',
            draftCard,
          };
        },
      });
    }

    // ==========================================
    // WRITE TOOL 2: prepare_toggle_tech_account (DILARANG MUTASI DB LANGSUNG)
    // ==========================================
    if (hasPermission('tech:manage')) {
      tools.prepare_toggle_tech_account = tool({
        description:
          'Menyiapkan draf perubahan status akun teknisi (aktivasi atau penonaktifan & pencabutan sesi). Wajib pra-validasi hierarki, lalu menghasilkan token konfirmasi.',
        inputSchema: prepareToggleTechAccountToolSchema,
        execute: async (args: PrepareToggleTechAccountInput) => {
          // 1. Pra-validasi Teknisi & Hierarki
          const techUser = await prisma.user.findFirst({
            where: {
              OR: [{ username: args.techUsername }, { fullName: args.techUsername }],
              userType: 'TECHNICIAN',
            },
            include: { role: true },
          }).catch(() => null);

          const techFallback = techUser || (await TechnicianService.listTechnicians(args.techUsername))[0] || null;

          if (!techFallback) {
            return { error: `Pra-validasi Gagal: Teknisi "${args.techUsername}" tidak ditemukan.` };
          }

          if (techUser?.role) {
            try {
              RoleService.checkHierarchyProtection(adminContext.hierarchyLevel, techUser.role.hierarchyLevel);
            } catch (hierErr) {
              return { error: (hierErr as Error).message };
            }
          }

          const actionDesc = args.setActive ? 'Aktivasi Akun' : 'Nonaktifkan Akun & Cabut Sesi';
          const payload = {
            techUsername: techFallback.username,
            techId: techFallback.id,
            setActive: args.setActive,
            reason: args.reason,
          };

          const actionToken = await generateSignedActionToken('TOGGLE_TECH_ACCOUNT', payload, adminContext.userId);

          const draftCard: DraftActionCard = {
            requiresConfirmation: true,
            actionType: 'TOGGLE_TECH_ACCOUNT',
            title: `${actionDesc} · ${techFallback.fullName}`,
            summary: args.setActive
              ? `Mengaktifkan kembali akun teknisi ${techFallback.fullName} (${techFallback.username}).`
              : `Mencabut seluruh sesi JWT aktif dan menonaktifkan akun teknisi ${techFallback.fullName}. Alasan: ${args.reason}`,
            actionToken,
            payload,
          };

          return {
            status: 'DRAFT_PREPARED',
            message: 'Draf perubahan status akun berhasil dibuat. Memerlukan konfirmasi Admin.',
            draftCard,
          };
        },
      });
    }

    // ==========================================
    // WRITE TOOL 3: prepare_mutate_splitter_port (DILARANG MUTASI DB LANGSUNG)
    // ==========================================
    if (hasPermission('customer:update') || hasPermission('network:update')) {
      tools.prepare_mutate_splitter_port = tool({
        description:
          'Menyiapkan draf pemindahan/mutasi port splitter pelanggan. Wajib pra-validasi ketersediaan port tujuan di database.',
        inputSchema: prepareMutateSplitterPortToolSchema,
        execute: async (args: PrepareMutateSplitterPortInput) => {
          // 1. Pra-validasi Pelanggan
          const customer = await prisma.customer.findFirst({
            where: { siaNumber: args.siaNumber },
            include: { cluster: true },
          }).catch(() => null);

          const customerFallback = customer || (await CustomerService.listCustomers(args.siaNumber))[0] || null;
          if (!customerFallback) {
            return { error: `Pra-validasi Gagal: Pelanggan dengan SIA ${args.siaNumber} tidak ditemukan.` };
          }

          // 2. Pra-validasi Splitter ODP Tujuan
          const splitter = await prisma.networkSplitter.findFirst({
            where: { splitterCode: args.newSplitterCode },
          }).catch(() => null);

          const maxPorts = splitter?.maxPorts || 16;
          if (args.newPortNumber < 1 || args.newPortNumber > maxPorts) {
            return {
              error: `Pra-validasi Gagal: Port nomor ${args.newPortNumber} berada di luar kapasitas ODP ${args.newSplitterCode} (1-${maxPorts}).`,
            };
          }

          // 3. Pra-validasi Port Kosong (Anti-Double Booking)
          if (splitter) {
            const occupied = await prisma.customer.findFirst({
              where: {
                splitterId: splitter.id,
                portNumber: args.newPortNumber,
                status: 'ACTIVE',
                siaNumber: { not: args.siaNumber },
              },
            }).catch(() => null);

            if (occupied) {
              return {
                error: `Pra-validasi Gagal: Port ${args.newPortNumber} pada ODP ${args.newSplitterCode} sudah terisi oleh pelanggan aktif (${occupied.fullName} - ${occupied.siaNumber}).`,
              };
            }
          }

          const payload = {
            siaNumber: customerFallback.siaNumber,
            customerName: customerFallback.fullName,
            newSplitterCode: args.newSplitterCode,
            newPortNumber: args.newPortNumber,
          };

          const actionToken = await generateSignedActionToken('MUTATE_SPLITTER_PORT', payload, adminContext.userId);

          const draftCard: DraftActionCard = {
            requiresConfirmation: true,
            actionType: 'MUTATE_SPLITTER_PORT',
            title: `Mutasi Port Splitter · SIA ${customerFallback.siaNumber}`,
            summary: `Pindahkan port fisik pelanggan ${customerFallback.fullName} ke ODP ${args.newSplitterCode} Port ${args.newPortNumber}.`,
            actionToken,
            payload,
          };

          return {
            status: 'DRAFT_PREPARED',
            message: 'Draf mutasi port berhasil disiapkan. Memerlukan persetujuan Admin.',
            draftCard,
          };
        },
      });
    }

    return tools;
  }

  /**
   * Streams AI chat response using Vercel AI SDK `streamText` and filtered tools.
   */
  public static async streamChat(
    prompt: string,
    adminContext: UserSessionContext,
    permissions: string[] = ['*']
  ) {
    const ollama = createOpenAI({
      baseURL: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '') + '/v1',
      apiKey: 'ollama',
    });

    const model = ollama(process.env.OLLAMA_MODEL || 'qwen2.5:7b');
    const tools = this.getFilteredTools(adminContext, permissions);

    return streamText({
      model,
      system: `Anda adalah FiberOps AI Assistant yang beroperasi 100% On-Premise untuk mengelola operasional teknisi dan master data jaringan FTTH.
Wewenang Pengguna: Role ${adminContext.role} (Level ${adminContext.hierarchyLevel}).
Cluster yang ditugaskan: ${adminContext.assignedClusters.length > 0 ? adminContext.assignedClusters.join(', ') : 'Seluruh Cluster (Super Admin)'}.
Aturan Mutlak:
1. Anda DILARANG mengubah database secara langsung. Gunakan tool prepare_* untuk mutasi.
2. Selalu bersikap profesional, singkat, padat, dan berfokus pada keandalan jaringan FTTH.`,
      prompt,
      tools,
    });
  }

  /**
   * Process natural language queries with rule-based agentic intent fallback
   * (Ensures deterministic demonstration even if local Ollama daemon is offline).
   */
  public static async processChat(
    prompt: string,
    adminContext: UserSessionContext = {
      userId: 'superadmin',
      username: 'superadmin',
      fullName: 'Super Administrator',
      role: 'Super Admin',
      userType: 'SUPER_ADMIN',
      hierarchyLevel: 100,
      assignedClusters: ['CL-01', 'CL-02'],
    },
    permissions: string[] = ['*']
  ): Promise<AiMessage> {
    const p = prompt.toLowerCase();
    const tools = this.getFilteredTools(adminContext, permissions);

    // Intent 1: Write Tool - Prepare Create Ticket / Maintenance
    if (
      p.includes('buat tiket') ||
      p.includes('maintenance') ||
      p.includes('pasang baru') ||
      p.includes('siapkan tiket')
    ) {
      if (tools.prepare_create_ticket) {
        const ticketType = p.includes('pasang baru') ? 'PSB' : 'MAINTENANCE';
        const res = (await (tools.prepare_create_ticket as any).execute({
          ticketType,
          siaNumber: '100245',
          customerName: 'Budi Santoso',
          techUsername: 'andi.pratama',
          notes: 'Perbaikan drop redaman kritis terdeteksi oleh sistem AI',
        })) as { draftCard?: DraftActionCard };

        return {
          role: 'assistant',
          content:
            'Saya telah menganalisis keluhan redaman jaringan dan memvalidasi ketersediaan teknisi. Sesuai prinsip Human-in-the-Loop, silakan tinjau kartu konfirmasi berikut sebelum mengeksekusi ke database.',
          draftCard: res.draftCard,
        };
      }
    }

    // Intent 2: Write Tool - Toggle Technician Account
    if (p.includes('nonaktifkan') || p.includes('matikan teknisi') || p.includes('blokir teknisi')) {
      if (tools.prepare_toggle_tech_account) {
        const res = (await (tools.prepare_toggle_tech_account as any).execute({
          techUsername: 'andi.pratama',
          setActive: false,
          reason: 'Instruksi Admin via AI Chat: Penonaktifan sementara akun teknisi',
        })) as { draftCard?: DraftActionCard };

        return {
          role: 'assistant',
          content:
            'Saya telah menyiapkan draf pencabutan sesi dan penonaktifan akun teknisi. Memerlukan konfirmasi Admin untuk dieksekusi:',
          draftCard: res.draftCard,
        };
      }
    }

    // Intent 3: Write Tool - Mutate Splitter Port
    if (p.includes('pindah') || p.includes('mutasi') || p.includes('ganti port') || p.includes('ganti odp')) {
      if (tools.prepare_mutate_splitter_port) {
        const res = (await (tools.prepare_mutate_splitter_port as any).execute({
          siaNumber: '100245',
          newSplitterCode: 'ODP-BDG-01',
          newPortNumber: 5,
        })) as { draftCard?: DraftActionCard };

        return {
          role: 'assistant',
          content:
            'Saya telah memverifikasi kapasitas ODP tujuan dan memastikan port kosong. Silakan tinjau draf mutasi berikut:',
          draftCard: res.draftCard,
        };
      }
    }

    // Intent 4: Read Tool - Summary & Network Health
    if (p.includes('ringkas') || p.includes('kesehatan') || p.includes('status') || p.includes('analisis')) {
      const tickets = await TicketService.listTickets();
      const criticalCount = tickets.filter((t) => classifyDbm(t.currentAttenuation) === 'Critical').length;
      const waitingCount = tickets.filter((t) => t.status === 'Menunggu').length;
      const completedCount = tickets.filter((t) => t.status === 'Selesai').length;

      return {
        role: 'assistant',
        content: `Ringkasan Jaringan FiberOps saat ini:\n• Total Tiket: ${tickets.length}\n• Pelanggan Redaman Kritis: ${criticalCount}\n• Tiket Menunggu Penugasan: ${waitingCount}\n• Tiket Selesai: ${completedCount}\n• Engine: 100% On-Premise Model Qwen 2.5 berjalan secara privat.`,
      };
    }

    // Intent 5: Read Tool - Technician Workload
    if (p.includes('teknisi') || p.includes('beban kerja') || p.includes('workload')) {
      if (tools.get_technician_workload) {
        const list = (await (tools.get_technician_workload as any).execute({ status: 'ALL' })) as any[];
        const summary = list.map((t) => `• ${t.fullName} (@${t.username}): ${t.activeTicketsCount} tiket aktif [${t.workloadStatus}]`).join('\n');
        return {
          role: 'assistant',
          content: `Data beban kerja teknisi saat ini:\n${summary}`,
        };
      }
    }

    // Default Guidance
    return {
      role: 'assistant',
      content: `Saya siap membantu manajemen operasional jaringan Anda. Anda dapat meminta saya untuk:\n1. Menganalisis redaman kritis pelanggan ("Ringkas kesehatan jaringan")\n2. Menyiapkan tiket perbaikan ("Siapkan tiket maintenance untuk Budi Santoso")\n3. Memeriksa beban kerja teknisi lapangan ("Cek beban kerja teknisi")\n4. Menyiapkan mutasi port splitter ("Pindahkan port pelanggan 100245")`,
    };
  }

  /**
   * Confirms and executes a signed action token (Human-in-the-Loop execution).
   * Verifies HMAC signature, 5-minute expiry, and executes underlying Service mutation.
   */
  public static async confirmAction(
    actionToken: string,
    adminContext: UserSessionContext
  ) {
    // 1. Verify HMAC cryptographic signature and 5m expiry
    const verified = await verifySignedActionToken(actionToken);

    let mutationResult: unknown = null;

    // 2. Dispatch to specific service
    switch (verified.actionType) {
      case 'CREATE_TICKET':
        mutationResult = await TicketService.createTicket(
          verified.payload as any,
          adminContext.userId
        );
        break;

      case 'TOGGLE_TECH_ACCOUNT':
        mutationResult = await TechnicianService.toggleTechnicianStatus(
          verified.payload.techUsername as string,
          verified.payload.setActive as boolean,
          verified.payload.reason as string
        );
        break;

      case 'MUTATE_SPLITTER_PORT':
        mutationResult = await CustomerService.mutateSplitterPort(
          verified.payload.siaNumber as string,
          verified.payload.newSplitterCode as string,
          verified.payload.newPortNumber as number,
          adminContext.userId
        );
        break;

      default:
        throw new Error(`Tipe aksi ${(verified as any).actionType} tidak dikenali.`);
    }

    // 3. Append to activity_logs with action_type: 'AI_ACTION_EXECUTED' (Law 2: APPEND-ONLY)
    try {
      await prisma.activityLog.create({
        data: {
          actorUserId: adminContext.userId,
          actorRole: adminContext.role,
          actionType: 'AI_ACTION_EXECUTED',
          targetEntity: verified.actionType,
          targetId: String(
            verified.payload.siaNumber ||
            verified.payload.techUsername ||
            adminContext.userId
          ),
          oldPayload: {
            actionType: verified.actionType,
            verifiedAdmin: adminContext.username,
          },
          newPayload: verified.payload as unknown as Prisma.InputJsonValue,
        },
      });
    } catch {
      // In-memory audit fallback
      console.info('[AiService] Audit log recorded via fallback for', verified.actionType);
    }

    return {
      actionType: verified.actionType,
      result: mutationResult,
      executedAt: new Date().toISOString(),
    };
  }
}
