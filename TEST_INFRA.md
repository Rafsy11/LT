# E2E Test Infra: FiberOps Mobile Application Readiness & UI/UX Overhaul

## Test Philosophy
- **Opaque-box, requirement-driven**: Tests validate observable behaviors, contracts, schemas, and user journeys derived strictly from `ORIGINAL_REQUEST.md` and `PROJECT.md`, without coupling to private implementation internals.
- **Methodology**: 4-Tier verification incorporating Category-Partition, Boundary Value Analysis (BVA), Pairwise Combinatorial Testing, and Realistic Field Workload Testing.
- **Offline & Zero External Dependencies**: Powered by native `node:test` and `node:assert/strict` with `tsx` TypeScript transpilation. No external packages or internet connectivity required.

## Test Architecture
- **Test Runner**: Node.js v25+ built-in test runner via `tsx`
  - Command: `pnpm --filter @repo/web exec tsx --tsconfig tsconfig.json --test "../../tests/e2e/**/*.test.ts"`
  - Package Script: `pnpm test:e2e` (or per tier: `pnpm test:e2e:tier1`, `test:e2e:tier2`, `test:e2e:tier3`, `test:e2e:tier4`)
- **Execution Overhead**: <100ms startup duration. Instant TypeScript module resolution for `@repo/shared` and tsconfig paths.
- **Directory Layout**:
  ```
  tests/e2e/
  ├── helpers/
  │   ├── mock-storage.ts               # In-memory mock implementing PersistentStorageAdapter
  │   ├── mock-api.ts                   # Fetch / ApiClient network mock & response helpers
  │   └── test-fixtures.ts              # Canonical ODPs, GPS coordinates, test tickets
  ├── tier1-feature-coverage/           # Minimum 5 tests per feature (Features 1-18)
  │   ├── feat-01-to-04-mobile-config.test.ts
  │   ├── feat-05-apk-download-route.test.ts
  │   ├── feat-06-deploy-docs.test.ts
  │   ├── feat-07-security-audit.test.ts
  │   ├── feat-08-palembang-odps.test.ts
  │   ├── feat-09-persistent-storage.test.ts
  │   ├── feat-10-dynamic-api-client.test.ts
  │   ├── feat-11-offline-queue.test.ts
  │   ├── feat-12-dual-path-photo.test.ts
  │   ├── feat-13-design-tokens.test.ts
  │   ├── feat-14-opm-camera-modal.test.ts
  │   ├── feat-15-login-screen.test.ts
  │   ├── feat-16-ticket-list-screen.test.ts
  │   ├── feat-17-ticket-submit-screen.test.ts
  │   └── feat-18-app-root.test.ts
  ├── tier2-boundary-corner/            # Minimum 5 boundary/corner tests per feature area
  │   ├── storage-encryption-bounds.test.ts
  │   ├── queue-concurrency-limits.test.ts
  │   ├── network-timeout-failover.test.ts
  │   ├── gps-geofence-boundaries.test.ts
  │   ├── camera-watermark-limits.test.ts
  │   └── antislop-corner-cases.test.ts
  ├── tier3-cross-feature/              # Pairwise interaction test suites
  │   ├── storage-queue-client-sync.test.ts
  │   ├── camera-dual-path-submission.test.ts
  │   ├── auth-server-switch-sync.test.ts
  │   └── theme-contrast-accessibility.test.ts
  └── tier4-workload-scenarios/         # Real-world field technician application workflows
      ├── technician-full-offline-flow.test.ts
      ├── noc-rejection-revision-flow.test.ts
      ├── intermittent-network-recovery.test.ts
      ├── outdoor-sunlight-shift-flow.test.ts
      └── disaster-recovery-cache-restore.test.ts
  ```

## Feature Inventory & Test Mapping
| # | Feature | Requirement Source | Tier 1 (Min 5) | Tier 2 (Min 5) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|---------|-------------------|:--------------:|:--------------:|:-----------------:|:-----------------:|
| 1 | Mobile Package Scripts | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Metro Turborepo Resolution | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | Mobile Application Manifest | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 4 | EAS Build Profiles | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 5 | APK Download Route | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 6 | Mobile Deployment Documentation | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 7 | Security Audit Offline Compatibility | ORIGINAL_REQUEST §Verification | 5 | 5 | ✓ | ✓ |
| 8 | 90 Palembang ODP Canonical Constant | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 9 | Universal Persistent Storage | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 10 | Dynamic Server URL & Health Check API | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 11 | Persistent Encrypted Offline Queue | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 12 | Dual-Path Photo Upload | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 13 | Mobile Design Tokens & Themes | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 14 | In-App Watermarked Camera Modal | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 15 | Enhanced Login Screen | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 16 | Field Ticket List Screen | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 17 | Field Ticket Submit Screen | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 18 | App Root Router & State Management | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥5 tests per feature (18 features × 5 = ≥90 test cases)
- **Tier 2 (Boundary & Corner Cases)**: ≥5 tests per feature area (≥90 test cases)
- **Tier 3 (Cross-Feature Combinations)**: Pairwise integration across storage, queue, API client, camera upload, auth, and theme (≥18 test cases)
- **Tier 4 (Real-World Application Scenarios)**: ≥5 comprehensive technician journeys (5 test cases)
- **Total Suite Minimum**: >200 automated test cases
