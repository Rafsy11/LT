import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(process.cwd(), '../..');
const MOBILE_DIR = path.resolve(REPO_ROOT, 'apps/mobile');

describe('Tier 1: Feature 1 - Mobile Package Scripts (apps/mobile/package.json)', () => {
  const pkgPath = path.resolve(MOBILE_DIR, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  it('declares all 9 required operational scripts for field technician workflow', () => {
    const requiredScripts = [
      'start',
      'start:lan',
      'start:tunnel',
      'android',
      'ios',
      'web',
      'build:apk',
      'lint',
      'typecheck',
    ];
    for (const script of requiredScripts) {
      assert.ok(
        script in pkg.scripts,
        `Expected script "${script}" to be declared in apps/mobile/package.json`
      );
    }
  });

  it('configures start:lan and start:tunnel with proper expo flags', () => {
    assert.match(pkg.scripts['start:lan'], /expo start --lan/);
    assert.match(pkg.scripts['start:tunnel'], /expo start --tunnel/);
  });

  it('configures build:apk with eas build android preview profile and local flag', () => {
    assert.match(pkg.scripts['build:apk'], /eas build/);
    assert.match(pkg.scripts['build:apk'], /-p android/);
    assert.match(pkg.scripts['build:apk'], /--profile preview/);
    assert.match(pkg.scripts['build:apk'], /--local/);
  });

  it('configures typecheck and lint offline verification via tsc --noEmit', () => {
    assert.strictEqual(pkg.scripts.typecheck, 'tsc --noEmit');
    assert.strictEqual(pkg.scripts.lint, 'tsc --noEmit');
  });

  it('declares workspace dependency on @repo/shared without external npm requirements', () => {
    assert.ok(pkg.dependencies, 'Expected dependencies block to exist');
    assert.strictEqual(pkg.dependencies['@repo/shared'], 'workspace:*');
  });
});

describe('Tier 1: Feature 2 - Metro Turborepo Resolution (apps/mobile/metro.config.js)', () => {
  const metroConfigPath = path.resolve(MOBILE_DIR, 'metro.config.js');

  it('exists on disk and is a valid CommonJS module', () => {
    assert.ok(fs.existsSync(metroConfigPath), 'metro.config.js must exist');
    const content = fs.readFileSync(metroConfigPath, 'utf-8');
    assert.ok(content.includes('module.exports'), 'Must export config object');
  });

  it('resolves and watches monorepo root directory for Turborepo symlinks', () => {
    const metroConfig = require(metroConfigPath);
    assert.ok(Array.isArray(metroConfig.watchFolders), 'watchFolders must be an array');
    const monorepoRoot = path.resolve(MOBILE_DIR, '../..');
    const watchesMonorepo = metroConfig.watchFolders.some(
      (folder: string) => path.resolve(folder) === monorepoRoot
    );
    assert.ok(watchesMonorepo, 'watchFolders must include resolved monorepo root');
  });

  it('includes both mobile and root node_modules in resolver.nodeModulesPaths', () => {
    const metroConfig = require(metroConfigPath);
    assert.ok(metroConfig.resolver, 'metroConfig.resolver must exist');
    assert.ok(
      Array.isArray(metroConfig.resolver.nodeModulesPaths),
      'nodeModulesPaths must be an array'
    );
    const expectedProjectNodeModules = path.resolve(MOBILE_DIR, 'node_modules');
    const expectedMonorepoNodeModules = path.resolve(MOBILE_DIR, '../../node_modules');

    const paths = metroConfig.resolver.nodeModulesPaths.map((p: string) => path.resolve(p));
    assert.ok(paths.includes(expectedProjectNodeModules), 'Must include mobile node_modules');
    assert.ok(paths.includes(expectedMonorepoNodeModules), 'Must include monorepo node_modules');
  });

  it('gracefully handles missing expo/metro-config via fallback mechanism', () => {
    const content = fs.readFileSync(metroConfigPath, 'utf-8');
    assert.ok(
      content.includes('try') && content.includes('catch'),
      'Must contain try/catch block for expo/metro-config requirement'
    );
    assert.ok(
      content.includes('getDefaultConfig'),
      'Must provide safe getDefaultConfig fallback'
    );
  });

  it('exports valid Metro config object structure', () => {
    const metroConfig = require(metroConfigPath);
    assert.strictEqual(typeof metroConfig, 'object');
    assert.notStrictEqual(metroConfig, null);
    assert.ok('resolver' in metroConfig);
    assert.ok('watchFolders' in metroConfig);
  });
});

describe('Tier 1: Feature 3 - Mobile Application Manifest (apps/mobile/app.json)', () => {
  const appJsonPath = path.resolve(MOBILE_DIR, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
  const expo = appJson.expo;

  it('defines custom deep-linking scheme fiberops', () => {
    assert.strictEqual(expo.scheme, 'fiberops');
  });

  it('defines runtimeVersion matching 1.0.0 for OTA compatibility', () => {
    assert.strictEqual(expo.runtimeVersion, '1.0.0');
    assert.strictEqual(expo.version, '1.0.0');
  });

  it('points updates.url to /api/v1/ota/manifest with updates enabled', () => {
    assert.ok(expo.updates, 'expo.updates must be defined');
    assert.strictEqual(expo.updates.enabled, true);
    assert.match(expo.updates.url, /\/api\/v1\/ota\/manifest$/);
  });

  it('sets canonical Android package and iOS bundleIdentifier to com.fiberops.technician', () => {
    assert.strictEqual(expo.android?.package, 'com.fiberops.technician');
    assert.strictEqual(expo.ios?.bundleIdentifier, 'com.fiberops.technician');
  });

  it('declares CAMERA and ACCESS_FINE_LOCATION permissions with Indonesian descriptions', () => {
    const androidPermissions: string[] = expo.android?.permissions || [];
    assert.ok(androidPermissions.includes('CAMERA'), 'Android must require CAMERA permission');
    assert.ok(
      androidPermissions.includes('ACCESS_FINE_LOCATION'),
      'Android must require ACCESS_FINE_LOCATION'
    );
    const cameraDesc = expo.ios?.infoPlist?.NSCameraUsageDescription || '';
    assert.match(cameraDesc, /kamera/i);
    assert.match(cameraDesc, /Optical Power Meter|OPM/i);
  });
});

describe('Tier 1: Feature 4 - EAS Build Profiles (apps/mobile/eas.json)', () => {
  const easJsonPath = path.resolve(MOBILE_DIR, 'eas.json');
  const eas = JSON.parse(fs.readFileSync(easJsonPath, 'utf-8'));

  it('exists and specifies CLI version constraint >= 12.0.0', () => {
    assert.ok(fs.existsSync(easJsonPath));
    assert.strictEqual(eas.cli?.version, '>= 12.0.0');
  });

  it('configures development profile with developmentClient and internal distribution', () => {
    const dev = eas.build?.development;
    assert.ok(dev, 'development profile must exist');
    assert.strictEqual(dev.developmentClient, true);
    assert.strictEqual(dev.distribution, 'internal');
  });

  it('configures preview profile to build standalone APK with internal distribution', () => {
    const preview = eas.build?.preview;
    assert.ok(preview, 'preview profile must exist');
    assert.strictEqual(preview.distribution, 'internal');
    assert.strictEqual(preview.android?.buildType, 'apk');
  });

  it('configures production profile to generate standalone APK for direct installation', () => {
    const prod = eas.build?.production;
    assert.ok(prod, 'production profile must exist');
    assert.strictEqual(prod.android?.buildType, 'apk');
  });

  it('ensures neither preview nor production enforces Google Play AAB bundle format', () => {
    assert.strictEqual(eas.build?.preview?.android?.buildType, 'apk');
    assert.strictEqual(eas.build?.production?.android?.buildType, 'apk');
  });
});
