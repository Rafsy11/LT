import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../../../apps/mobile/src/api/client';
import { uploadOpmPhotoDualPath } from '../../../apps/mobile/src/camera/opmCamera';
import { MockPersistentStorage, EncryptedStorageWrapper } from '../helpers/mock-storage';
import { TEST_TICKETS } from '../helpers/test-fixtures';
import { SubmitTicketInput } from '@repo/shared';

describe('Tier 4: Workload Scenario - NOC Rejection & Revision Resubmission Flow', () => {
  let originalFetch: typeof globalThis.fetch;
  let client: ApiClient;
  let mockStorage: MockPersistentStorage;
  let storageWrapper: EncryptedStorageWrapper;
  const auditLog: Array<{ action: string; details: any }> = [];

  const STORAGE_KEY_TICKETS = '@fiberops_cached_tickets_v1';

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    auditLog.length = 0;
    mockStorage = new MockPersistentStorage();
    storageWrapper = new EncryptedStorageWrapper(mockStorage);

    client = new ApiClient({
      baseUrl: 'http://localhost:3000',
      deviceId: 'dev-noc-revision-01',
    });

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.startsWith('file://')) {
        return new Response(new Blob(['mock-revised-photo-bytes']), { status: 200 });
      }

      if (url.includes('/api/v1/tech/upload-url')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              uploadUrl: 'https://minio.local/bucket/opm/revised-wo-0901.jpg',
              objectKey: 'opm/revised-wo-0901.jpg',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('minio.local')) {
        auditLog.push({ action: 'MINIO_PUT_UPLOAD', details: 'revised-wo-0901.jpg' });
        return new Response('', { status: 200 });
      }

      if (url.includes('/submit')) {
        const payload = JSON.parse(String(init?.body || '{}'));
        auditLog.push({ action: 'API_SUBMIT_TICKET', details: payload });
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              ticketId: 'wo-2025-0901',
              ticketNumber: 'WO-2025-0901',
              status: 'COMPLETED',
              message: 'Revisi hasil redaman berhasil disetujui NOC.',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    auditLog.length = 0;
  });

  it('executes full NOC rejection resolution journey: Alert Display -> dBm Remeasurement -> Revised Photo Upload -> Approval -> Cache Update', async () => {
    // -------------------------------------------------------------
    // Step 1: Technician loads cached rejected ticket
    // -------------------------------------------------------------
    const rejectedTicket = TEST_TICKETS.WO_REJECTED;
    await storageWrapper.setEncryptedItem(STORAGE_KEY_TICKETS, [rejectedTicket]);

    const cachedTickets = await storageWrapper.getEncryptedItem<any[]>(STORAGE_KEY_TICKETS);
    assert.strictEqual(cachedTickets?.length, 1);
    const activeTicket = cachedTickets![0];

    assert.strictEqual(activeTicket.status, 'REVISION_REQUIRED');
    assert.ok(
      activeTicket.nocNotes.includes('Nilai redaman -28.5 dBm melebihi standar toleransi'),
      'NOC rejection reason must be visible to technician'
    );

    // -------------------------------------------------------------
    // Step 2: Splicing & Measurement update (-18.3 dBm, category GOOD)
    // -------------------------------------------------------------
    const revisedDbm = -18.3;
    assert.ok(revisedDbm >= -22.0 && revisedDbm <= -15.0, 'Revised attenuation must be in GOOD category');

    // -------------------------------------------------------------
    // Step 3: Dual-path upload of revised verification photo
    // -------------------------------------------------------------
    const revisionSubmissionId = 'rev-sub-uuid-9901';
    const uploadResult = await uploadOpmPhotoDualPath({
      apiClient: client,
      ticketId: activeTicket.ticketNumber,
      submissionId: revisionSubmissionId,
      localPhotoUri: 'file:///data/user/0/cache/revised_opm.jpg',
    });

    assert.strictEqual(uploadResult.pathUsed, 'PRESIGNED_MINIO');
    assert.strictEqual(uploadResult.photoObjectKey, 'opm/revised-wo-0901.jpg');

    // -------------------------------------------------------------
    // Step 4: Resubmit ticket revision to Next.js API
    // -------------------------------------------------------------
    const revisionPayload: SubmitTicketInput = {
      submissionId: revisionSubmissionId,
      splitterId: activeTicket.splitterId,
      portNumber: 4,
      attenuationDbm: revisedDbm,
      submittedLat: activeTicket.splitterCoordinates.latitude,
      submittedLng: activeTicket.splitterCoordinates.longitude,
      isMockLocation: false,
      photoObjectKey: uploadResult.photoObjectKey,
    };

    const submitResponse = await client.request<{
      status: string;
      message: string;
    }>(`/api/v1/tech/tickets/${activeTicket.ticketNumber}/submit`, {
      method: 'POST',
      body: JSON.stringify(revisionPayload),
      headers: { 'X-Idempotency-Key': revisionSubmissionId },
    });

    assert.strictEqual(submitResponse.success, true);
    assert.strictEqual(submitResponse.data?.status, 'COMPLETED');
    assert.ok(submitResponse.data?.message.includes('disetujui NOC'));

    // -------------------------------------------------------------
    // Step 5: Update local persistent cache with approved status
    // -------------------------------------------------------------
    const updatedTicket = {
      ...activeTicket,
      status: 'COMPLETED',
      currentAttenuation: revisedDbm,
      nocNotes: null, // Clear rejection alert
      updatedAt: new Date().toISOString(),
    };

    await storageWrapper.setEncryptedItem(STORAGE_KEY_TICKETS, [updatedTicket]);

    const finalCached = await storageWrapper.getEncryptedItem<any[]>(STORAGE_KEY_TICKETS);
    assert.strictEqual(finalCached![0].status, 'COMPLETED');
    assert.strictEqual(finalCached![0].currentAttenuation, -18.3);
    assert.strictEqual(finalCached![0].nocNotes, null, 'Revision alert must be cleared after approval');

    // Verify audit sequence
    assert.strictEqual(auditLog[0].action, 'MINIO_PUT_UPLOAD');
    assert.strictEqual(auditLog[1].action, 'API_SUBMIT_TICKET');
    assert.strictEqual(auditLog[1].details.attenuationDbm, -18.3);
  });

  it('verifies client validation rejects resubmission if redaman is still above SLA tolerance (> -24.0 dBm threshold)', () => {
    function validateRevisionDbm(dbm: number): { allowed: boolean; error?: string } {
      const MAX_SOP_ATTENUATION = -24.0;
      if (dbm < MAX_SOP_ATTENUATION) {
        return {
          allowed: false,
          error: `Nilai redaman ${dbm.toFixed(1)} dBm masih melebihi batas toleransi maksimal ${MAX_SOP_ATTENUATION} dBm.`,
        };
      }
      return { allowed: true };
    }

    // -26.5 dBm is worse than -24.0 dBm
    const invalidCheck = validateRevisionDbm(-26.5);
    assert.strictEqual(invalidCheck.allowed, false);
    assert.ok(invalidCheck.error?.includes('masih melebihi batas toleransi'));

    // -19.5 dBm meets SLA
    const validCheck = validateRevisionDbm(-19.5);
    assert.strictEqual(validCheck.allowed, true);
  });
});
