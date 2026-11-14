import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

describe('Tier 1: Feature 5 - APK Download Endpoint (apps/web/src/app/download/mobile-latest.apk/route.ts)', () => {
  const routeFilePath = path.resolve(
    process.cwd(),
    'src/app/download/mobile-latest.apk/route.ts'
  );
  const routeUrl = pathToFileURL(routeFilePath).href;

  it('exports dynamic force-dynamic and GET handler', async () => {
    assert.ok(fs.existsSync(routeFilePath), 'route.ts file must exist');
    const routeModule = await import(routeUrl);
    assert.strictEqual(routeModule.dynamic, 'force-dynamic');
    assert.strictEqual(typeof routeModule.GET, 'function');
  });

  it('returns HTTP status 200 (never 404) when APK binary is not present on disk', async () => {
    const routeModule = await import(routeUrl);
    const response = await routeModule.GET();
    assert.strictEqual(response.status, 200, 'Endpoint must return 200 even without binary');
    assert.notStrictEqual(response.status, 404, 'Endpoint must never return 404');
  });

  it('returns structured build guide JSON with status BUILD_GUIDE_FALLBACK and runbook commands', async () => {
    const routeModule = await import(routeUrl);
    const response = await routeModule.GET();
    const body = await response.json();

    assert.strictEqual(body.status, 'BUILD_GUIDE_FALLBACK');
    assert.strictEqual(body.targetPackage, 'com.fiberops.technician');
    assert.strictEqual(body.expectedFilename, 'mobile-latest.apk');
    assert.ok(body.buildRunbook, 'buildRunbook must be present');
    assert.strictEqual(
      body.buildRunbook.lanDevServer,
      'pnpm --filter @repo/mobile run start:lan'
    );
    assert.strictEqual(
      body.buildRunbook.standaloneApkBuild,
      'pnpm --filter @repo/mobile run build:apk'
    );
  });

  it('includes step-by-step Indonesian installation guide in fallback payload', async () => {
    const routeModule = await import(routeUrl);
    const response = await routeModule.GET();
    const body = await response.json();

    assert.ok(Array.isArray(body.installationGuide), 'installationGuide must be an array');
    assert.ok(body.installationGuide.length >= 4, 'Must provide at least 4 clear installation steps');
    const guideText = body.installationGuide.join(' ');
    assert.match(guideText, /mobile-latest\.apk/i);
    assert.match(guideText, /Pengaturan > Keamanan|Unknown Sources/i);
    assert.match(guideText, /Server URL/i);
  });

  it('serves binary APK with application/vnd.android.package-archive when binary is present', async () => {
    const routeModule = await import(routeUrl);
    const candidateDir = path.resolve(process.cwd(), 'public/downloads');
    const candidateApk = path.resolve(candidateDir, 'mobile-latest.apk');
    fs.mkdirSync(candidateDir, { recursive: true });
    const dummyApkBytes = Buffer.from('PK\x03\x04DUMMY_APK_BINARY_FOR_TESTING');
    fs.writeFileSync(candidateApk, dummyApkBytes);

    try {
      const response = await routeModule.GET();
      assert.strictEqual(response.status, 200);
      assert.strictEqual(
        response.headers.get('Content-Type'),
        'application/vnd.android.package-archive'
      );
      assert.strictEqual(
        response.headers.get('Content-Disposition'),
        'attachment; filename="mobile-latest.apk"'
      );
      const arrayBuffer = await response.arrayBuffer();
      assert.strictEqual(Buffer.from(arrayBuffer).toString(), dummyApkBytes.toString());
    } finally {
      if (fs.existsSync(candidateApk)) {
        fs.unlinkSync(candidateApk);
      }
    }
  });
});
