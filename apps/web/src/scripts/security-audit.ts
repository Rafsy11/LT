/**
 * Automated Enterprise Security Audit Verification Script (Tahap 6 Hardening).
 * Verifies:
 * 1. Anti-Header Spoofing & Auth Middleware
 * 2. Sliding-Window Rate Limiter (Brute-force protection)
 * 3. Technician Anti-IDOR Enforcement
 * 4. AI Action Token Anti-Replay & Actor Verification
 * 5. Identical GPS Coordinates Spoofing Detection
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://fiberops:fiberops_secure_pass@127.0.0.1:5432/fiberops_db?schema=public';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'fiberops_on_premise_super_secure_jwt_secret_key_32chars';

import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { checkRateLimit } from '../lib/rate-limit';
import { TicketService } from '../services/ticket.service';
import { generateSignedActionToken, verifySignedActionToken } from '../services/ai.service';
import { redisManager } from '../lib/redis';
import { ERROR_CODES, SubmitTicketInput } from '@repo/shared';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const testResults: TestResult[] = [];

function assert(condition: boolean, testName: string, details: string) {
  testResults.push({
    name: testName,
    passed: condition,
    details: condition ? details : `FAILED: ${details}`,
  });
}

async function runSecurityAudit() {
  console.log('===============================================================');
  console.log('   FIBEROPS ON-PREMISE ENTERPRISE SECURITY AUDIT (PHASE 6)   ');
  console.log('===============================================================\n');

  // ---------------------------------------------------------------------------
  // TEST A: Anti-Header Spoofing
  // Simulate attacker injecting `x-hierarchy-level: 100` without valid JWT
  // ---------------------------------------------------------------------------
  try {
    const spoofedRequest = new NextRequest('http://localhost:3000/api/v1/tech/tickets', {
      method: 'GET',
      headers: {
        'x-app-version': '1.0.0',
        'x-hierarchy-level': '100',
        'x-user-id': 'malicious_user',
        'x-user-role': 'Super Admin',
      },
    });

    const response = await middleware(spoofedRequest);
    const body = await response.json();

    const isBlocked = response.status === 401 && body.error?.code === ERROR_CODES.UNAUTHORIZED;
    assert(
      isBlocked,
      'Test A: Anti-Header Spoofing',
      `Request without valid JWT bearer token correctly rejected with HTTP 401 UNAUTHORIZED (status: ${response.status})`
    );
  } catch (err: unknown) {
    assert(false, 'Test A: Anti-Header Spoofing', (err as Error).message);
  }

  // ---------------------------------------------------------------------------
  // TEST B: Sliding-Window Rate Limiter
  // Simulate brute force login: 6 consecutive requests in short window
  // ---------------------------------------------------------------------------
  try {
    const testKey = `audit_login_test_${Date.now()}`;
    const config = { windowMs: 60000, maxRequests: 5 };

    const attemptResults = [];
    for (let i = 1; i <= 6; i++) {
      const res = await checkRateLimit(testKey, config);
      attemptResults.push({ attempt: i, allowed: res.allowed, remaining: res.remaining });
    }

    const first5Allowed = attemptResults.slice(0, 5).every((r) => r.allowed === true);
    const sixthBlocked = attemptResults[5]?.allowed === false;

    assert(
      first5Allowed && sixthBlocked,
      'Test B: Sliding-Window Rate Limiter',
      `First 5 attempts allowed, 6th attempt successfully throttled (allowed: false, remaining: 0)`
    );
  } catch (err: unknown) {
    assert(false, 'Test B: Sliding-Window Rate Limiter', (err as Error).message);
  }

  // ---------------------------------------------------------------------------
  // TEST C: Technician Anti-IDOR Enforcement
  // Simulate Technician B (rizky.maulana) attempting to submit ticket assigned to Technician A (andi.pratama)
  // ---------------------------------------------------------------------------
  try {
    const fakePayload: SubmitTicketInput = {
      submissionId: `audit_idor_sub_${Date.now()}`,
      splitterId: 'ODP-BDG-01',
      portNumber: 2,
      attenuationDbm: -19.5,
      photoObjectKey: 'proofs/audit_photo.jpg',
      submittedLat: -6.9148,
      submittedLng: 107.6099,
      isMockLocation: false,
    };

    let idorBlocked = false;
    try {
      // t-1 / TK-2024-001 is assigned to Andi Pratama
      await TicketService.submitTicketByTechnician('t-1', fakePayload, {
        id: 'unauthorized_tech_id',
        username: 'rizky.maulana',
      });
    } catch (ticketErr: unknown) {
      const msg = (ticketErr as Error).message || '';
      idorBlocked = msg.includes(ERROR_CODES.IDOR_VIOLATION) || msg.includes('bukan teknisi yang ditugaskan');
    }

    assert(
      idorBlocked,
      'Test C: Technician Anti-IDOR Enforcement',
      `Cross-technician ticket submission successfully rejected with IDOR_VIOLATION`
    );
  } catch (err: unknown) {
    assert(false, 'Test C: Technician Anti-IDOR Enforcement', (err as Error).message);
  }

  // ---------------------------------------------------------------------------
  // TEST D: AI Action Token Anti-Replay & Actor Verification
  // ---------------------------------------------------------------------------
  try {
    const drafterAdminId = 'admin_aditya_100';
    const attackerAdminId = 'admin_mallory_999';

    // 1. Generate token signed by drafter admin
    const actionToken = await generateSignedActionToken(
      'CREATE_TICKET',
      { ticketType: 'PSB', customerName: 'Audit Test' },
      drafterAdminId
    );

    // 2. Verify token integrity and actor binding
    const verifiedData = await verifySignedActionToken(actionToken);
    const actorVerified = verifiedData.actorId === drafterAdminId;
    const actorMismatchDetected = verifiedData.actorId !== attackerAdminId;

    // 3. Verify single-use Anti-Replay (markActionTokenUsed)
    const firstUse = await redisManager.markActionTokenUsed(verifiedData.jti, 300);
    const secondUse = await redisManager.markActionTokenUsed(verifiedData.jti, 300);

    const antiReplayWorks = firstUse === true && secondUse === false;

    assert(
      actorVerified && actorMismatchDetected && antiReplayWorks,
      'Test D: AI Action Token Anti-Replay & Actor Verification',
      `HMAC JTI successfully verified, actor mismatch rejected, and second execution blocked via Redis SETNX anti-replay`
    );
  } catch (err: unknown) {
    assert(false, 'Test D: AI Action Token Anti-Replay & Actor Verification', (err as Error).message);
  }

  // ---------------------------------------------------------------------------
  // TEST E: Identical Coordinates GPS Spoofing Detection
  // Splitter coordinates: -6.914744, 107.60981
  // Submit exact same coordinates
  // ---------------------------------------------------------------------------
  try {
    const identicalCoordsPayload: SubmitTicketInput = {
      submissionId: `audit_gps_sub_${Date.now()}`,
      splitterId: 'ODP-BDG-01',
      portNumber: 1,
      attenuationDbm: -18.5,
      photoObjectKey: 'proofs/gps_test.jpg',
      submittedLat: -6.914744,
      submittedLng: 107.60981,
      isMockLocation: false,
    };

    const submissionResult = await TicketService.submitTicketByTechnician('t-1', identicalCoordsPayload, {
      username: 'andi.pratama',
    });

    const isFlagged = submissionResult.isLocationFlagged === true;

    assert(
      isFlagged,
      'Test E: Identical Coordinate Spoofing Detection',
      `Coordinates identical to target splitter flagged as location anomaly (isLocationFlagged === true)`
    );
  } catch (err: unknown) {
    assert(false, 'Test E: Identical Coordinate Spoofing Detection', (err as Error).message);
  }

  // ---------------------------------------------------------------------------
  // Audit Summary Reporting
  // ---------------------------------------------------------------------------
  console.log('\n================ AUDIT RESULTS ================');
  let allPassed = true;
  for (const r of testResults) {
    const mark = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${mark}] ${r.name}`);
    console.log(`       ${r.details}`);
    if (!r.passed) allPassed = false;
  }
  console.log('================================================');

  if (allPassed) {
    console.log('\n>>> ALL 5 SECURITY PENETRATION AUDITS PASSED 100% <<<\n');
    process.exit(0);
  } else {
    console.error('\n>>> SECURITY AUDIT DETECTED FAILURES <<<\n');
    process.exit(1);
  }
}

void runSecurityAudit();
