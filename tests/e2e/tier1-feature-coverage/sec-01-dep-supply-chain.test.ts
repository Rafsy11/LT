import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveRepoRoot } from '../helpers/auth-test-harness';

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  pnpm?: {
    overrides?: Record<string, string>;
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function parseSemver(version: string): [number, number, number] {
  const clean = version.trim().replace(/^[\^~>=<v]+/, '').split('-')[0] ?? '0.0.0';
  const [maj = '0', min = '0', pat = '0'] = clean.split('.');
  return [parseInt(maj, 10) || 0, parseInt(min, 10) || 0, parseInt(pat, 10) || 0];
}

function gteSemver(actual: string, minimum: string): boolean {
  const [a1, a2, a3] = parseSemver(actual);
  const [m1, m2, m3] = parseSemver(minimum);
  if (a1 !== m1) return a1 > m1;
  if (a2 !== m2) return a2 > m2;
  return a3 >= m3;
}

function extractLockfileVersions(lockfileText: string, packageName: string): string[] {
  const normalized = lockfileText.replace(/\r\n/g, '\n');
  const pkgSectionStart = normalized.lastIndexOf('\npackages:\n');
  const snapSectionStart = normalized.lastIndexOf('\nsnapshots:\n');
  const section =
    pkgSectionStart >= 0
      ? normalized.slice(
          pkgSectionStart,
          snapSectionStart > pkgSectionStart ? snapSectionStart : undefined,
        )
      : normalized;
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s{2}['"]?${escaped}@(\\d[^:'"(\\s]*)`, 'gm');
  const versions = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(section)) !== null) {
    if (match[1]) {
      versions.add(match[1]);
    }
  }
  return Array.from(versions);
}

describe('Tier 1: Security Supply Chain & Dependencies (DEP-01 .. DEP-05)', () => {
  const repoRoot = resolveRepoRoot();
  const lockfilePath = path.join(repoRoot, 'pnpm-lock.yaml');
  const rootPkgPath = path.join(repoRoot, 'package.json');
  const webPkgPath = path.join(repoRoot, 'apps', 'web', 'package.json');
  const sharedPkgPath = path.join(repoRoot, 'packages', 'shared', 'package.json');
  const nextConfigPath = path.join(repoRoot, 'apps', 'web', 'next.config.ts');

  it('DEP-01: next is upgraded to >=15.5.29 in manifests, lockfile, and installed node_modules with SVG RCE hardened', () => {
    const webPkg = readJson<PackageJson>(webPkgPath);
    const lockText = fs.readFileSync(lockfilePath, 'utf8');
    const nextSpec = webPkg.dependencies?.next;
    assert.ok(nextSpec, 'apps/web/package.json must declare next dependency');

    const lockNextVersions = extractLockfileVersions(lockText, 'next');
    assert.ok(lockNextVersions.length > 0, 'pnpm-lock.yaml must contain resolved next version');
    for (const ver of lockNextVersions) {
      assert.ok(
        gteSemver(ver, '15.5.29'),
        `DEP-01: Resolved next@${ver} is vulnerable (<=15.5.28 RCE/Edge CVEs); expected >=15.5.29`,
      );
    }

    const installedNextPkgPath = path.join(repoRoot, 'apps', 'web', 'node_modules', 'next', 'package.json');
    assert.ok(fs.existsSync(installedNextPkgPath), 'Installed apps/web/node_modules/next/package.json must exist');
    const installedNext = readJson<{ version: string }>(installedNextPkgPath);
    assert.ok(
      gteSemver(installedNext.version, '15.5.29'),
      `DEP-01: Installed next@${installedNext.version} must be >=15.5.29`,
    );

    const eslintConfigNextSpec =
      webPkg.devDependencies?.['eslint-config-next'] ?? webPkg.dependencies?.['eslint-config-next'];
    if (eslintConfigNextSpec) {
      assert.ok(
        gteSemver(eslintConfigNextSpec, '15.5.29'),
        `DEP-01: apps/web/package.json eslint-config-next@${eslintConfigNextSpec} must be >=15.5.29`,
      );
      const lockEslintConfigNextVersions = extractLockfileVersions(lockText, 'eslint-config-next');
      assert.ok(
        lockEslintConfigNextVersions.length > 0,
        'DEP-01: pnpm-lock.yaml must resolve eslint-config-next',
      );
      for (const ver of lockEslintConfigNextVersions) {
        assert.ok(
          gteSemver(ver, '15.5.29'),
          `DEP-01: Resolved eslint-config-next@${ver} must be >=15.5.29`,
        );
      }
    }

    const nextConfigSrc = fs.readFileSync(nextConfigPath, 'utf8');
    assert.doesNotMatch(
      nextConfigSrc,
      /dangerouslyAllowSVG\s*:\s*true/,
      'DEP-01: next.config.ts must not enable dangerouslyAllowSVG: true',
    );
    assert.ok(
      /dangerouslyAllowSVG\s*:\s*false/.test(nextConfigSrc) ||
        /contentSecurityPolicy\s*:/.test(nextConfigSrc),
      'DEP-01: next.config.ts must explicitly harden SVG handling (dangerouslyAllowSVG: false or contentSecurityPolicy)',
    );
  });

  it('DEP-02: vulnerable xlsx package is completely removed and replaced with exceljs + separate CSV parser', () => {
    const rootPkg = readJson<PackageJson>(rootPkgPath);
    const webPkg = readJson<PackageJson>(webPkgPath);
    const lockText = fs.readFileSync(lockfilePath, 'utf8');

    assert.strictEqual(rootPkg.dependencies?.xlsx, undefined, 'root package.json must not depend on xlsx');
    assert.strictEqual(webPkg.dependencies?.xlsx, undefined, 'apps/web/package.json must not depend on xlsx');
    assert.strictEqual(webPkg.devDependencies?.xlsx, undefined, 'apps/web/package.json must not have xlsx in devDependencies');

    const lockXlsxVersions = extractLockfileVersions(lockText, 'xlsx');
    assert.deepStrictEqual(
      lockXlsxVersions,
      [],
      `DEP-02: xlsx must be completely absent from pnpm-lock.yaml, found: ${lockXlsxVersions.join(', ')}`,
    );

    assert.ok(webPkg.dependencies?.exceljs, 'DEP-02: apps/web/package.json must declare exceljs replacement');
    const lockExcelJsVersions = extractLockfileVersions(lockText, 'exceljs');
    assert.ok(lockExcelJsVersions.length > 0, 'DEP-02: pnpm-lock.yaml must resolve exceljs');

    const importRoutePath = path.join(
      repoRoot,
      'apps',
      'web',
      'src',
      'app',
      'api',
      'v1',
      'admin',
      'network',
      'import',
      'route.ts',
    );
    const importRouteSrc = fs.readFileSync(importRoutePath, 'utf8');
    assert.doesNotMatch(importRouteSrc, /from\s+['"]xlsx['"]/, 'import route must not import xlsx');
    assert.doesNotMatch(importRouteSrc, /XLSX\.read/, 'import route must not call XLSX.read');
  });

  it('DEP-03: undici >=7.30.1, decode-uri-component >=0.5.1, postcss >=8.5.0, and zod >=4.6.6 are resolved and active', async () => {
    const sharedPkg = readJson<PackageJson>(sharedPkgPath);
    const webPkg = readJson<PackageJson>(webPkgPath);
    const lockText = fs.readFileSync(lockfilePath, 'utf8');

    assert.ok(
      gteSemver(sharedPkg.dependencies?.zod ?? '0.0.0', '4.6.6'),
      `DEP-03: @repo/shared zod specifier (${sharedPkg.dependencies?.zod}) must be >=4.6.6`,
    );
    assert.ok(
      gteSemver(webPkg.dependencies?.zod ?? '0.0.0', '4.6.6'),
      `DEP-03: @repo/web zod specifier (${webPkg.dependencies?.zod}) must be >=4.6.6`,
    );

    const lockZodVersions = extractLockfileVersions(lockText, 'zod');
    assert.ok(lockZodVersions.length > 0, 'pnpm-lock.yaml must resolve zod');
    for (const ver of lockZodVersions) {
      assert.ok(
        gteSemver(ver, '4.6.6'),
        `DEP-03: Resolved zod@${ver} in pnpm-lock.yaml must be >=4.6.6 (GHSA-mrhx-c7xc-m3w5)`,
      );
    }

    const lockUndiciVersions = extractLockfileVersions(lockText, 'undici');
    for (const ver of lockUndiciVersions) {
      assert.ok(
        gteSemver(ver, '7.30.1'),
        `DEP-03: Resolved undici@${ver} must be >=7.30.1 (TLS bypass / cache poisoning CVEs)`,
      );
    }
    const workspaceYamlPath = path.join(repoRoot, 'pnpm-workspace.yaml');
    const workspaceYamlSrc = fs.existsSync(workspaceYamlPath)
      ? fs.readFileSync(workspaceYamlPath, 'utf8')
      : '';
    const undiciOverrideMatch =
      workspaceYamlSrc.match(/^\s*undici:\s*['"]?([^\s'"]+)/m) ??
      lockText.match(/^\s*undici:\s*['"]?([^\s'"]+)/m);
    assert.ok(
      lockUndiciVersions.length > 0 ||
        (undiciOverrideMatch !== null && gteSemver(undiciOverrideMatch[1] ?? '0.0.0', '7.30.1')),
      'DEP-03: undici must be resolved at >=7.30.1 in pnpm-lock.yaml or pinned >=7.30.1 in pnpm overrides',
    );

    const lockDecodeUriVersions = extractLockfileVersions(lockText, 'decode-uri-component');
    assert.ok(
      lockDecodeUriVersions.length > 0,
      'DEP-03: pnpm-lock.yaml must contain resolved decode-uri-component versions',
    );
    for (const ver of lockDecodeUriVersions) {
      assert.ok(
        gteSemver(ver, '0.5.1'),
        `DEP-03: Resolved decode-uri-component@${ver} must be >=0.5.1`,
      );
    }

    const lockPostcssVersions = extractLockfileVersions(lockText, 'postcss');
    assert.ok(
      lockPostcssVersions.length > 0,
      'DEP-03: pnpm-lock.yaml must contain resolved postcss versions',
    );
    for (const ver of lockPostcssVersions) {
      assert.ok(
        gteSemver(ver, '8.5.0'),
        `DEP-03: Resolved postcss@${ver} must be >=8.5.0`,
      );
    }

    // Prisma CLI transitive packages (deepmerge-ts, effect)
    const lockDeepmergeVersions = extractLockfileVersions(lockText, 'deepmerge-ts');
    if (lockDeepmergeVersions.length > 0) {
      for (const ver of lockDeepmergeVersions) {
        assert.ok(
          gteSemver(ver, '8.0.0'),
          `DEP-03: Resolved deepmerge-ts@${ver} must be >=8.0.0`,
        );
      }
    }
    const lockEffectVersions = extractLockfileVersions(lockText, 'effect');
    if (lockEffectVersions.length > 0) {
      for (const ver of lockEffectVersions) {
        assert.ok(
          gteSemver(ver, '3.22.0'),
          `DEP-03: Resolved effect@${ver} must be >=3.22.0`,
        );
      }
    }

    // Verify Zod v4 runtime behavior across ALL 8 @repo/shared schema files
    const schemaDir = path.join(repoRoot, 'packages', 'shared', 'src', 'schemas');
    const schemaFiles = fs.readdirSync(schemaDir).filter((f) => f.endsWith('.schema.ts')).sort();
    assert.strictEqual(schemaFiles.length, 8, `Expected 8 schema files, found ${schemaFiles.length}`);

    const shared = await import('@repo/shared');
    const validUuid = crypto.randomUUID();

    // 1. auth.schema.ts
    const validLogin = shared.loginRequestSchema.safeParse({
      username: 'superadmin',
      password: 'ValidPassword123!',
    });
    assert.strictEqual(validLogin.success, true, 'loginRequestSchema must validate valid input');
    assert.strictEqual(
      shared.loginRequestSchema.safeParse({ username: 'ab', password: '123' }).success,
      false,
      'loginRequestSchema must reject short username/password',
    );

    // 2. ai.schema.ts
    assert.strictEqual(
      shared.getRecentReportsToolSchema.safeParse({ clusterCode: 'PLB-01', limit: 10 }).success,
      true,
      'getRecentReportsToolSchema must accept valid query',
    );
    const badConfirm = shared.confirmActionSchema.safeParse({
      actionToken: 'tok-123',
      actionType: 'CREATE_TICKET',
      payload: 'not-an-object',
    });
    assert.strictEqual(badConfirm.success, false, 'confirmActionSchema must reject non-object payload under zod v4');
    if (!badConfirm.success) {
      assert.ok(Array.isArray(badConfirm.error.issues) && badConfirm.error.issues.length > 0);
    }

    // Zod v4 enforces strict RFC 4122 version/variant bits on UUID validation (rejects non-nil version 0 / variant 0)
    const invalidRfcUuid = shared.userProfileSchema.safeParse({
      id: '12345678-1234-0234-0234-123456789012',
      username: 'tech.andi',
      fullName: 'Andi',
      role: 'Technician',
      userType: 'TECHNICIAN',
      hierarchyLevel: 10,
      assignedClusters: ['PLB-01'],
      isActive: true,
    });
    assert.strictEqual(
      invalidRfcUuid.success,
      false,
      'Zod v4 strict UUID validator must reject non-RFC4122 version-0/variant-0 UUID',
    );

    const validRfcUuid = shared.userProfileSchema.safeParse({
      id: validUuid,
      username: 'tech.andi',
      fullName: 'Andi',
      role: 'Technician',
      userType: 'TECHNICIAN',
      hierarchyLevel: 10,
      assignedClusters: ['PLB-01'],
      isActive: true,
    });
    assert.strictEqual(validRfcUuid.success, true, 'Zod v4 UUID validator must accept RFC 4122 v4 UUID');

    // 3. customer.schema.ts
    assert.strictEqual(
      shared.updateCustomerSchema.safeParse({
        siaNumber: '100245',
        photoObjectKey: 'proofs/opm-1.jpg',
        portNumber: 8,
      }).success,
      true,
      'customer.schema must accept valid updateCustomerSchema input',
    );
    assert.strictEqual(
      shared.updateCustomerSchema.safeParse({
        siaNumber: '100245',
        photoObjectKey: '../etc/passwd',
        portNumber: 99,
      }).success,
      false,
      'customer.schema must reject path traversal photoObjectKey and out-of-range port',
    );

    // 4. network.schema.ts
    assert.strictEqual(
      shared.createSplitterSchema.safeParse({
        clusterCode: 'PLB-01',
        splitterCode: 'ODP-PLB-001',
        lat: -2.98,
        lng: 104.76,
        maxPorts: 16,
      }).success,
      true,
      'network.schema must accept valid 16-port splitter',
    );
    assert.strictEqual(
      shared.createSplitterSchema.safeParse({
        clusterCode: 'PLB-01',
        splitterCode: 'ODP-PLB-001',
        lat: 95,
        lng: 104.76,
        maxPorts: 12,
      }).success,
      false,
      'network.schema must reject invalid latitude and unsupported maxPorts=12',
    );

    // 5. role.schema.ts
    assert.strictEqual(
      shared.createRoleSchema.safeParse({
        name: 'NOC Supervisor',
        permissions: ['ticket:read'],
        hierarchyLevel: 50,
      }).success,
      true,
      'role.schema must accept valid role payload',
    );
    assert.strictEqual(
      shared.roleSchema.safeParse({
        id: validUuid,
        name: 'NOC Supervisor',
        permissions: ['ticket:read'],
        hierarchyLevel: 50,
        createdAt: 'not-an-iso-datetime',
      }).success,
      false,
      'role.schema must reject non-ISO datetime under Zod v4 z.iso.datetime()',
    );

    // 6. system.schema.ts
    const validSystemSettings = {
      companyName: 'Lintasarta FiberOps',
      serverTimezone: 'Asia/Jakarta',
      publicAccessMethod: 'STATIC_IP_HTTPS',
      publicDomain: 'ops.fiberops.local',
      geofenceRadiusMeters: 100,
      locationViolationPolicy: 'HARD_BLOCK',
      blockMockLocation: true,
      minAppVersion: '1.0.0',
      aiInferenceMode: 'CPU_FALLBACK',
      selectedAiModel: 'qwen2.5:7b',
      maxConcurrentAiQueries: 1,
      aiMemoryLimitGb: 8,
      cronSchedule: '0 2 * * *',
      compressionEncrypted: true,
      secondaryBackupTarget: 'ENCRYPTED_CLOUD_BUCKET',
      secondaryStoragePath: 'minio://fiberops-backups',
    };
    assert.strictEqual(
      shared.SystemSettingsSchema.safeParse(validSystemSettings).success,
      true,
      'system.schema must accept valid SystemSettingsSchema payload',
    );
    assert.strictEqual(
      shared.SystemSettingsSchema.safeParse({
        ...validSystemSettings,
        geofenceRadiusMeters: 5,
        minAppVersion: 'invalid-ver',
      }).success,
      false,
      'system.schema must reject invalid geofenceRadiusMeters and non-semver minAppVersion',
    );

    // 7. tech.schema.ts
    assert.strictEqual(
      shared.toggleTechAccountSchema.safeParse({
        techUsername: 'tech.andi',
        isActive: false,
        reason: 'Selesai kontrak proyek',
      }).success,
      true,
      'tech.schema must accept valid toggleTechAccountSchema payload',
    );
    assert.strictEqual(
      shared.toggleTechAccountSchema.safeParse({
        techUsername: 'a',
        isActive: 'false',
        reason: 'no',
      }).success,
      false,
      'tech.schema must reject short username/reason and non-boolean isActive',
    );

    // 8. ticket.schema.ts
    assert.strictEqual(
      shared.submitTicketSchema.safeParse({
        submissionId: validUuid,
        splitterId: 'ODP-PLB-001',
        portNumber: 2,
        attenuationDbm: -19.5,
        photoObjectKey: 'opm-proofs/2026/11/tkt-1.jpg',
        submittedLat: -2.98,
        submittedLng: 104.76,
        isMockLocation: false,
        clientRecordedAt: '2026-11-21T10:00:00.000Z',
      }).success,
      true,
      'ticket.schema must accept valid submitTicketSchema payload',
    );
    assert.strictEqual(
      shared.submitTicketSchema.safeParse({
        submissionId: 'not-a-uuid-v4',
        splitterId: 'ODP-PLB-001',
        portNumber: 2,
        attenuationDbm: -45,
        photoObjectKey: 'opm-proofs/2026/11/tkt-1.jpg',
        submittedLat: -2.98,
        submittedLng: 104.76,
        clientRecordedAt: 'invalid-date',
      }).success,
      false,
      'ticket.schema must reject invalid UUID v4, out-of-range attenuation, and bad ISO timestamp',
    );
  });

  it('DEP-04: eslint v9 flat config is active, lint script enforces eslint, ignoreDuringBuilds is absent, and stream-json/minimatch are patched', () => {
    const webPkg = readJson<PackageJson>(webPkgPath);
    const lockText = fs.readFileSync(lockfilePath, 'utf8');

    const lockEslintVersions = extractLockfileVersions(lockText, 'eslint');
    assert.ok(lockEslintVersions.length > 0, 'pnpm-lock.yaml must resolve eslint');
    for (const ver of lockEslintVersions) {
      assert.ok(
        gteSemver(ver, '9.0.0'),
        `DEP-04: Resolved eslint@${ver} must be >=9.0.0 (EOL eslint 8.x must be replaced)`,
      );
    }

    const flatConfigCandidates = [
      path.join(repoRoot, 'apps', 'web', 'eslint.config.mjs'),
      path.join(repoRoot, 'apps', 'web', 'eslint.config.js'),
      path.join(repoRoot, 'apps', 'web', 'eslint.config.ts'),
      path.join(repoRoot, 'eslint.config.mjs'),
    ];
    assert.ok(
      flatConfigCandidates.some((p) => fs.existsSync(p)),
      'DEP-04: ESLint v9 flat config (eslint.config.mjs) must exist',
    );
    assert.strictEqual(
      fs.existsSync(path.join(repoRoot, 'apps', 'web', '.eslintrc.json')),
      false,
      'DEP-04: Legacy apps/web/.eslintrc.json must be removed',
    );

    const webLintScript = webPkg.scripts?.lint ?? '';
    assert.match(webLintScript, /\beslint\b/, 'DEP-04: apps/web lint script must invoke eslint');

    const nextConfigSrc = fs.readFileSync(nextConfigPath, 'utf8');
    assert.doesNotMatch(
      nextConfigSrc,
      /ignoreDuringBuilds\s*:\s*true/,
      'DEP-04: next.config.ts must not ignore ESLint during builds',
    );

    const lockStreamJsonVersions = extractLockfileVersions(lockText, 'stream-json');
    assert.ok(
      lockStreamJsonVersions.length > 0,
      'DEP-04: pnpm-lock.yaml must contain resolved stream-json versions',
    );
    for (const ver of lockStreamJsonVersions) {
      assert.ok(
        gteSemver(ver, '1.9.2'),
        `DEP-04: Resolved stream-json@${ver} must be patched (>=1.9.2)`,
      );
    }

    const lockMinimatchVersions = extractLockfileVersions(lockText, 'minimatch');
    assert.ok(
      lockMinimatchVersions.length > 0,
      'DEP-04: pnpm-lock.yaml must contain resolved minimatch versions',
    );
    for (const ver of lockMinimatchVersions) {
      const [maj] = parseSemver(ver);
      const ok =
        maj >= 9
          ? gteSemver(ver, '10.2.1')
          : maj === 5
            ? gteSemver(ver, '5.1.8')
            : gteSemver(ver, '3.1.4');
      assert.ok(ok, `DEP-04: Resolved minimatch@${ver} must be patched`);
    }

    // Verify ESLint v9 flat config across workspace packages that have lint config / scripts
    const workspaceDirs = ['apps', 'packages'].flatMap((group) => {
      const groupDir = path.join(repoRoot, group);
      if (!fs.existsSync(groupDir)) return [];
      return fs
        .readdirSync(groupDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(groupDir, d.name));
    });
    for (const pkgDir of workspaceDirs) {
      for (const legacyFile of ['.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs']) {
        assert.strictEqual(
          fs.existsSync(path.join(pkgDir, legacyFile)),
          false,
          `DEP-04: Legacy ${legacyFile} must not exist in ${path.relative(repoRoot, pkgDir)}`,
        );
      }
      const pkgManifestPath = path.join(pkgDir, 'package.json');
      if (fs.existsSync(pkgManifestPath)) {
        const pkgManifest = readJson<PackageJson>(pkgManifestPath);
        if (/\beslint\b/.test(pkgManifest.scripts?.lint ?? '')) {
          const hasFlat = ['eslint.config.mjs', 'eslint.config.js', 'eslint.config.ts'].some((f) =>
            fs.existsSync(path.join(pkgDir, f)),
          );
          assert.ok(
            hasFlat,
            `DEP-04: ${path.relative(repoRoot, pkgDir)} uses eslint in lint script and must have ESLint v9 flat config`,
          );
        }
      }
    }
  });

  it('DEP-05: fast-xml-parser is resolved to patched version >5.11.2', () => {
    const lockText = fs.readFileSync(lockfilePath, 'utf8');
    const lockFastXmlVersions = extractLockfileVersions(lockText, 'fast-xml-parser');
    assert.ok(
      lockFastXmlVersions.length > 0,
      'DEP-05: pnpm-lock.yaml must contain resolved fast-xml-parser versions',
    );
    for (const ver of lockFastXmlVersions) {
      assert.ok(
        gteSemver(ver, '5.12.0'),
        `DEP-05: Resolved fast-xml-parser@${ver} is vulnerable (<=5.11.2); expected >=5.12.0`,
      );
    }
  });
});
