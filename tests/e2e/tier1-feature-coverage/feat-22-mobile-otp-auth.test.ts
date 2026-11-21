import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { verifyOtpRequestSchema, ERROR_CODES } from '@repo/shared';
import { AuthService } from '../../../apps/web/src/server/services/auth.service';

describe('Tier 1: Feature 22 - Mobile 2FA Telegram OTP Integration', () => {
  const loginScreenPath = path.resolve(
    process.cwd(),
    '../../apps/mobile/src/screens/LoginScreen.tsx',
  );
  const verifyOtpRoutePath = path.resolve(
    process.cwd(),
    '../../apps/web/src/app/api/v1/auth/verify-otp/route.ts',
  );
  const loginScreenContent = fs.readFileSync(loginScreenPath, 'utf-8');
  const verifyOtpRouteContent = fs.readFileSync(verifyOtpRoutePath, 'utf-8');

  it('1. verifyOtpRequestSchema validates both web and mobile payloads and rejects malformed OTPs', () => {
    const webParsed = verifyOtpRequestSchema.safeParse({
      preAuthToken: 'token_web_valid_123456',
      otpCode: '123456',
    });
    assert.strictEqual(webParsed.success, true);

    const mobileParsed = verifyOtpRequestSchema.safeParse({
      preAuthToken: 'token_mobile_valid_123456',
      otpCode: '654321',
      deviceId: 'DEVICE-TECH-SM-A54',
      deviceModel: 'Samsung Galaxy A54 5G',
      appVersion: '1.0.0',
    });
    assert.strictEqual(mobileParsed.success, true);
    if (mobileParsed.success) {
      assert.strictEqual(mobileParsed.data.deviceId, 'DEVICE-TECH-SM-A54');
      assert.strictEqual(mobileParsed.data.appVersion, '1.0.0');
    }

    const badOtp = verifyOtpRequestSchema.safeParse({
      preAuthToken: 'token_mobile_valid_123456',
      otpCode: '12ab',
      deviceId: 'DEVICE-TECH-SM-A54',
    });
    assert.strictEqual(badOtp.success, false);
  });

  it('2. generatePreAuthToken & verifyPreAuthToken preserve mobile channel & device metadata and default to web', async () => {
    const mobileToken = await AuthService.generatePreAuthToken({
      userId: '00000000-0000-4000-8000-000000000003',
      username: 'tech.andi',
      challengeId: 'challenge-mobile-01',
      channel: 'mobile',
      deviceId: 'DEVICE-TECH-SM-A54',
      deviceModel: 'Samsung Galaxy A54 5G',
      appVersion: '1.0.0',
    });

    const verifiedMobile = await AuthService.verifyPreAuthToken(mobileToken);
    assert.strictEqual(verifiedMobile.channel, 'mobile');
    assert.strictEqual(verifiedMobile.deviceId, 'DEVICE-TECH-SM-A54');
    assert.strictEqual(verifiedMobile.deviceModel, 'Samsung Galaxy A54 5G');
    assert.strictEqual(verifiedMobile.appVersion, '1.0.0');
    assert.strictEqual(verifiedMobile.username, 'tech.andi');

    const webToken = await AuthService.generatePreAuthToken({
      userId: '00000000-0000-4000-8000-000000000001',
      username: 'superadmin',
      challengeId: 'challenge-web-01',
    });
    const verifiedWeb = await AuthService.verifyPreAuthToken(webToken);
    assert.strictEqual(verifiedWeb.channel, 'web');
    assert.strictEqual(verifiedWeb.deviceId, undefined);
  });

  it('3. enforces strict channel and deviceId isolation between web and mobile OTP verification', async () => {
    const mobileToken = await AuthService.generatePreAuthToken({
      userId: '00000000-0000-4000-8000-000000000003',
      username: 'tech.andi',
      challengeId: 'challenge-mobile-iso',
      channel: 'mobile',
      deviceId: 'DEVICE-A',
    });

    await assert.rejects(
      () => AuthService.verifyWebOtp(mobileToken, '123456'),
      (err: Error & { code?: string }) => err.code === ERROR_CODES.FORBIDDEN,
    );

    await assert.rejects(
      () => AuthService.verifyMobileOtp(mobileToken, '123456', { deviceId: 'DEVICE-SPOOFED' }),
      (err: Error & { code?: string }) => err.code === ERROR_CODES.FORBIDDEN,
    );

    const webToken = await AuthService.generatePreAuthToken({
      userId: '00000000-0000-4000-8000-000000000001',
      username: 'superadmin',
      challengeId: 'challenge-web-iso',
      channel: 'web',
    });

    await assert.rejects(
      () => AuthService.verifyMobileOtp(webToken, '123456', { deviceId: 'DEVICE-A' }),
      (err: Error & { code?: string }) => err.code === ERROR_CODES.FORBIDDEN,
    );
  });

  it('4. verify-otp route isolates mobile Bearer response from web HttpOnly fiberops_session cookie', () => {
    assert.match(verifyOtpRouteContent, /AuthService\.verifyMobileOtp/);
    assert.match(verifyOtpRouteContent, /preAuth\.channel === 'mobile'/);
    const mobileBranchIdx = verifyOtpRouteContent.indexOf('AuthService.verifyMobileOtp');
    const cookieSetIdx = verifyOtpRouteContent.indexOf("response.cookies.set('fiberops_session'");
    assert.ok(
      mobileBranchIdx > 0 && cookieSetIdx > mobileBranchIdx,
      'Mobile branch must return before web fiberops_session cookie is set',
    );
  });

  it('5. LoginScreen.tsx implements 6-digit Telegram OTP field, Kirim OTP action, timers, and antislop constraints', () => {
    assert.match(loginScreenContent, /id="field-otp"/);
    assert.match(loginScreenContent, /inputMode="numeric"/);
    assert.match(loginScreenContent, /autoComplete="one-time-code"/);
    assert.match(loginScreenContent, /\/api\/v1\/auth\/verify-otp/);
    assert.match(loginScreenContent, /\/api\/v1\/auth\/resend-otp/);
    assert.match(loginScreenContent, /Kirim OTP/);
    assert.match(loginScreenContent, /Kirim Ulang/);
    assert.match(loginScreenContent, /otpExpiresSeconds/);
    assert.match(loginScreenContent, /resendCooldownSeconds/);
    assert.strictEqual(loginScreenContent.includes('—'), false, 'No em-dashes allowed');
    assert.strictEqual(loginScreenContent.includes('9999px'), false, 'No 9999px radius allowed');
  });
});
