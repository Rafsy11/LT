// Explicitly allow standalone / offline mode for security audit test suite
process.env.STRICT_LIVE_DATA = 'false';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TicketService } from '@/server/services/ticket.service';
import { ERROR_CODES, SubmitTicketInput } from '@repo/shared';

describe('Tier 1: Feature 7 - Security Audit Offline Compatibility (ticket.service.ts)', () => {
  beforeEach(() => {
    process.env.STRICT_LIVE_DATA = 'false';
  });

  it('provides fallback ticket WO-2025-0842 assigned to tech.andi in offline environment', async () => {
    const ticket = await TicketService.getTicketById('WO-2025-0842');
    assert.ok(ticket, 'Fallback ticket WO-2025-0842 must be available offline');
    assert.strictEqual(ticket.ticketNumber, 'WO-2025-0842');
    assert.strictEqual(ticket.assignedTechUsername, 'tech.andi');
    assert.strictEqual(ticket.clusterCode, 'PLB-01');
  });

  it('provides fallback ticket WO-2025-0841 with customer CV Musi Digital', async () => {
    const ticket = await TicketService.getTicketById('WO-2025-0841');
    assert.ok(ticket, 'Fallback ticket WO-2025-0841 must be available offline');
    assert.strictEqual(ticket.ticketNumber, 'WO-2025-0841');
    assert.strictEqual(ticket.customerName, 'CV Musi Digital');
  });

  it('enforces IDOR protection when an unauthorized technician attempts ticket submission', async () => {
    const fakePayload: SubmitTicketInput = {
      submissionId: `audit_idor_sub_${Date.now()}`,
      splitterId: 'ODP-PLB-034',
      portNumber: 2,
      attenuationDbm: -19.5,
      photoObjectKey: 'proofs/audit_photo.jpg',
      submittedLat: -2.976383,
      submittedLng: 104.741487,
      isMockLocation: false,
    };

    let idorBlocked = false;
    try {
      // WO-2025-0842 is assigned to tech.andi; tech.rizky should be rejected
      await TicketService.submitTicketByTechnician('WO-2025-0842', fakePayload, {
        id: 'unauthorized_tech_id',
        username: 'tech.rizky',
      });
    } catch (ticketErr: unknown) {
      const msg = (ticketErr as Error).message || '';
      idorBlocked =
        msg.includes(ERROR_CODES.IDOR_VIOLATION) || msg.includes('bukan teknisi yang ditugaskan');
    }

    assert.ok(
      idorBlocked,
      'Cross-technician ticket submission must be rejected with IDOR_VIOLATION'
    );
  });

  it('flags identical GPS coordinates as anomaly to prevent spoofing', async () => {
    const identicalCoordsPayload: SubmitTicketInput = {
      submissionId: `audit_gps_sub_${Date.now()}`,
      splitterId: 'ODP-PLB-034',
      portNumber: 1,
      attenuationDbm: -18.5,
      photoObjectKey: 'proofs/gps_test.jpg',
      submittedLat: -2.976383,
      submittedLng: 104.741487,
      isMockLocation: false,
    };

    const submissionResult = await TicketService.submitTicketByTechnician(
      'WO-2025-0842',
      identicalCoordsPayload,
      {
        username: 'tech.andi',
      }
    );

    assert.strictEqual(
      submissionResult.isLocationFlagged,
      true,
      'Coordinates identical to target splitter must be flagged (isLocationFlagged === true)'
    );
  });

  it('guarantees submission idempotency on same ticket and blocks cross-ticket replay to WO-2025-0841', async () => {
    const sharedSubmissionId = `cross_idempotent_test_${Date.now()}`;
    const payloadForTicket1: SubmitTicketInput = {
      submissionId: sharedSubmissionId,
      splitterId: 'ODP-PLB-034',
      portNumber: 2,
      attenuationDbm: -19.2,
      photoObjectKey: 'proofs/cross_test_1.jpg',
      submittedLat: -2.9764,
      submittedLng: 104.7415,
      isMockLocation: false,
    };

    // 1. Initial submission to WO-2025-0842
    await TicketService.submitTicketByTechnician('WO-2025-0842', payloadForTicket1, {
      username: 'tech.andi',
    });

    // 2. Replay same submissionId to same ticket -> returns alreadyProcessed: true
    const replayResult = await TicketService.submitTicketByTechnician(
      'WO-2025-0842',
      payloadForTicket1,
      {
        username: 'tech.andi',
      }
    );
    assert.strictEqual(
      replayResult.alreadyProcessed,
      true,
      'Duplicate submissionId to same ticket must be idempotent (alreadyProcessed: true)'
    );

    // 3. Replay same submissionId to different ticket (WO-2025-0841) -> must throw IDOR error
    let crossTicketBlocked = false;
    try {
      const payloadForTicket2: SubmitTicketInput = {
        ...payloadForTicket1,
        splitterId: 'ODP-PLB-034',
        portNumber: 3,
      };
      await TicketService.submitTicketByTechnician('WO-2025-0841', payloadForTicket2, {
        username: 'tech.andi',
      });
    } catch (crossErr: unknown) {
      const msg = (crossErr as Error).message || '';
      crossTicketBlocked = msg.includes(ERROR_CODES.IDOR_VIOLATION);
    }

    assert.ok(
      crossTicketBlocked,
      'Cross-ticket submission with reused submissionId must be blocked with IDOR_VIOLATION'
    );
  });
});
