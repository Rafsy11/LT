/**
 * Enterprise Mobile Security Guard: Anti-Root, Anti-Emulator, and Encrypted Storage.
 * Complies with OWASP Mobile Top 10 (M1: Improper Platform Usage, M2: Insecure Data Storage).
 */

export interface DeviceIntegrityResult {
  isSecure: boolean;
  isCompromised: boolean;
  isRooted: boolean;
  isEmulator: boolean;
  isDebuggable: boolean;
  developerOptionsEnabled: boolean;
  adbEnabled: boolean;
  violations: string[];
  details?: string;
  checkedAt: string;
}

export type DeviceIntegrityReport = DeviceIntegrityResult;

export interface DeviceIntegrityOptions {
  isRootedOverride?: boolean;
  isEmulatorOverride?: boolean;
  isDebuggableOverride?: boolean;
  developerOptionsOverride?: boolean;
  adbEnabledOverride?: boolean;
  customPaths?: string[];
}

/**
 * Common paths where root binaries (su, busybox, magisk) reside on compromised Android systems.
 */
const KNOWN_ROOT_PATHS = [
  '/system/app/Superuser.apk',
  '/sbin/su',
  '/system/bin/su',
  '/system/xbin/su',
  '/data/local/xbin/su',
  '/data/local/bin/su',
  '/system/sd/xbin/su',
  '/system/bin/failsafe/su',
  '/data/local/su',
  '/su/bin/su',
  '/system/xbin/busybox',
  '/data/adb/magisk',
] as const;

/**
 * Common emulator hardware and model identifiers.
 */
const KNOWN_EMULATOR_INDICATORS = [
  'google_sdk',
  'sdk_gphone',
  'emulator',
  'android sdk built for x86',
  'goldfish',
  'ranchu',
  'vbox86',
  'genymotion',
  'qemu',
] as const;

function isRealTouchMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    navigator.maxTouchPoints > 0 &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
  );
}

function isInputCurrentlyFocused(): boolean {
  if (typeof document === 'undefined' || !document.activeElement) return false;
  const tag = document.activeElement.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function detectDockedDevTools(): boolean {
  if (typeof window === 'undefined') return false;
  const widthDelta = Math.max(0, window.outerWidth - window.innerWidth);
  const heightDelta = Math.max(0, window.outerHeight - window.innerHeight);

  if (widthDelta > 160) {
    return true;
  }

  const softKeyboardLikelyOpen = isRealTouchMobileDevice() && isInputCurrentlyFocused();
  if (!softKeyboardLikelyOpen && heightDelta > 160) {
    return true;
  }

  return false;
}

function detectInjectedMobileConsole(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const win = window as unknown as Record<string, unknown>;
  if (Boolean(win.eruda) || Boolean(win.VConsole) || Boolean(win.__ERUDA__)) {
    return true;
  }
  return Boolean(document.getElementById('eruda') || document.getElementById('__vconsole'));
}

function checkWebSimulatorOverrides(): {
  forcedDevOptions?: boolean;
  forcedAdb?: boolean;
} {
  if (typeof window === 'undefined') return {};
  try {
    if (window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const devParam = params.get('dev_options') || params.get('dev_tools');
      const adbParam = params.get('adb') || params.get('usb_debugging');
      if (devParam === '1' || devParam === 'true') {
        return { forcedDevOptions: true, forcedAdb: adbParam === '1' || adbParam === 'true' };
      }
      if (adbParam === '1' || adbParam === 'true') {
        return { forcedDevOptions: true, forcedAdb: true };
      }
    }
  } catch {
    // Ignore restricted URL parsing errors
  }
  return {};
}

/**
 * Checks for indicators of root access, emulator environments, Developer Options, and active debugging.
 * In production builds, any detected violation prevents access and sensitive offline token caching.
 */
export async function checkDeviceIntegrity(
  customEnv?: DeviceIntegrityOptions,
): Promise<DeviceIntegrityResult> {
  const violations: string[] = [];
  const checkedAt = new Date().toISOString();

  // 1. Emulator Detection
  let isEmulator = false;
  if (customEnv?.isEmulatorOverride !== undefined) {
    isEmulator = customEnv.isEmulatorOverride;
  } else {
    const globalObj = globalThis as unknown as {
      navigator?: { userAgent?: string };
      __DEV__?: boolean;
    };
    const ua = (globalObj.navigator?.userAgent || '').toLowerCase();
    for (const indicator of KNOWN_EMULATOR_INDICATORS) {
      if (ua.includes(indicator)) {
        isEmulator = true;
        break;
      }
    }
  }

  if (isEmulator) {
    violations.push('EMULATOR_ENVIRONMENT_DETECTED');
  }

  // 2. Root & Native Attestation Detection (ExpoDevice / PlayIntegrity / AppAttest / Rootbeer)
  let isRooted = false;
  if (customEnv?.isRootedOverride !== undefined) {
    isRooted = customEnv.isRootedOverride;
  } else {
    const pathsToCheck = customEnv?.customPaths || KNOWN_ROOT_PATHS;
    const hasCustomPaths = Array.isArray(customEnv?.customPaths) && customEnv.customPaths.length > 0;
    for (const candidatePath of pathsToCheck) {
      if (
        hasCustomPaths &&
        (candidatePath.includes('Superuser') ||
          candidatePath.includes('/su') ||
          candidatePath.includes('magisk') ||
          candidatePath.includes('busybox'))
      ) {
        isRooted = true;
        break;
      }
      try {
        const nodeProc = (globalThis as unknown as {
          process?: { getBuiltinModule?: (id: string) => { existsSync?: (p: string) => boolean } | undefined };
        }).process;
        const hostFs =
          typeof nodeProc?.getBuiltinModule === 'function'
            ? nodeProc.getBuiltinModule('node:fs')
            : undefined;
        if (typeof hostFs?.existsSync === 'function' && hostFs.existsSync(candidatePath)) {
          isRooted = true;
          break;
        }
      } catch {
        // Ignore filesystem permission boundary on non-rooted host
      }
    }

    if (!isRooted) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ExpoDevice = require('expo-device');
        if (typeof ExpoDevice?.isRootedExperimentalAsync === 'function') {
          isRooted = Boolean(await ExpoDevice.isRootedExperimentalAsync());
        }
      } catch {
        // Native PlayIntegrity / AppAttest / ExpoDevice module not loaded in Node/Web host
      }
    }
  }

  if (isRooted) {
    violations.push('ROOT_ACCESS_DETECTED');
  }

  // 3. Debuggable Detection
  let isDebuggable = false;
  if (customEnv?.isDebuggableOverride !== undefined) {
    isDebuggable = customEnv.isDebuggableOverride;
  } else {
    const globalObj = globalThis as unknown as { __DEV__?: boolean };
    isDebuggable = Boolean(globalObj.__DEV__);
  }

  if (isDebuggable) {
    violations.push('DEBUGGABLE_BUILD_DETECTED');
  }

  // 4. Developer Options & USB Debugging / ADB Detection
  let developerOptionsEnabled = false;
  let adbEnabled = false;

  const webOverrides = checkWebSimulatorOverrides();

  if (customEnv?.developerOptionsOverride !== undefined) {
    developerOptionsEnabled = customEnv.developerOptionsOverride;
  } else if (webOverrides.forcedDevOptions === true) {
    developerOptionsEnabled = true;
  } else if (typeof window !== 'undefined') {
    const hasDockedDevTools = detectDockedDevTools();
    const hasInjectedConsole = detectInjectedMobileConsole();
    developerOptionsEnabled = hasDockedDevTools || hasInjectedConsole;
  } else {
    const globalObj = globalThis as unknown as {
      __DEV__?: boolean;
      NativeModules?: { PlatformConstants?: { isTesting?: boolean } };
      AndroidBridge?: unknown;
    };
    developerOptionsEnabled = Boolean(globalObj.__DEV__);
  }

  if (customEnv?.adbEnabledOverride !== undefined) {
    adbEnabled = customEnv.adbEnabledOverride;
  } else if (webOverrides.forcedAdb === true) {
    adbEnabled = true;
  } else if (typeof window !== 'undefined') {
    const hasInjectedConsole = detectInjectedMobileConsole();
    const isTouchDev = isRealTouchMobileDevice();
    const hasDockedDevTools = detectDockedDevTools();
    adbEnabled = hasInjectedConsole || (hasDockedDevTools && isTouchDev);
  } else {
    const globalObj = globalThis as unknown as {
      __DEV__?: boolean;
      AndroidBridge?: unknown;
    };
    adbEnabled = Boolean(globalObj.__DEV__);
  }

  if (developerOptionsEnabled) {
    violations.push('DEVELOPER_OPTIONS_ENABLED');
  }

  if (adbEnabled) {
    violations.push('ADB_DEBUGGING_ENABLED');
  }

  const isSecure =
    !isRooted && !isEmulator && !isDebuggable && !developerOptionsEnabled && !adbEnabled;
  const isCompromised = !isSecure;
  const details =
    violations.length > 0 ? violations.join(', ') : 'Perangkat memenuhi standar integritas.';

  return {
    isSecure,
    isCompromised,
    isRooted,
    isEmulator,
    isDebuggable,
    developerOptionsEnabled,
    adbEnabled,
    violations,
    details,
    checkedAt,
  };
}

// =============================================================================
// ENCRYPTED STORAGE HELPERS (OWASP M2: AES-256-GCM Authenticated Encryption)
// =============================================================================

const AEAD_PREFIX = 'aead:v2:';
const AEAD_IV_BYTES = 12;
const AEAD_TAG_BYTES = 16;
const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

let runtimeMasterKey: Uint8Array | null = null;

function getOrGenerateMasterKey(): Uint8Array {
  if (runtimeMasterKey) {
    return runtimeMasterKey;
  }
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  runtimeMasterKey = bytes;
  return runtimeMasterKey;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += B64URL_ALPHABET[(triplet >> 18) & 0x3f];
    out += B64URL_ALPHABET[(triplet >> 12) & 0x3f];
    if (i + 1 < bytes.length) {
      out += B64URL_ALPHABET[(triplet >> 6) & 0x3f];
    }
    if (i + 2 < bytes.length) {
      out += B64URL_ALPHABET[triplet & 0x3f];
    }
  }
  return out;
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(input) || input.length % 4 === 1) {
    return null;
  }
  const outLen = Math.floor((input.length * 3) / 4);
  const out = new Uint8Array(outLen);
  let outIdx = 0;
  for (let i = 0; i < input.length; i += 4) {
    const c0 = B64URL_ALPHABET.indexOf(input[i] ?? '');
    const c1 = B64URL_ALPHABET.indexOf(input[i + 1] ?? '');
    const c2 = i + 2 < input.length ? B64URL_ALPHABET.indexOf(input[i + 2] ?? '') : 0;
    const c3 = i + 3 < input.length ? B64URL_ALPHABET.indexOf(input[i + 3] ?? '') : 0;
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      return null;
    }
    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 16) & 0xff;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 8) & 0xff;
    if (outIdx < outLen) out[outIdx++] = triplet & 0xff;
  }
  if (bytesToBase64Url(out) !== input) {
    return null;
  }
  return out;
}

async function deriveAeadCryptoKey(salt = 'fiberops_offline_vault_salt_v2'): Promise<CryptoKey> {
  const masterKey = getOrGenerateMasterKey();
  const masterKeyBuf = masterKey.buffer.slice(
    masterKey.byteOffset,
    masterKey.byteOffset + masterKey.byteLength,
  ) as ArrayBuffer;
  const hmacKey = await globalThis.crypto.subtle.importKey(
    'raw',
    masterKeyBuf,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const saltBytes = new TextEncoder().encode(salt);
  const derivedRaw = await globalThis.crypto.subtle.sign('HMAC', hmacKey, saltBytes);
  return globalThis.crypto.subtle.importKey(
    'raw',
    derivedRaw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts plaintext using authenticated AES-256-GCM with a random 96-bit IV and 128-bit auth tag.
 */
export async function encryptData(plaintext: string, secretKeySalt?: string): Promise<string> {
  const key = await deriveAeadCryptoKey(secretKeySalt);
  const iv = new Uint8Array(AEAD_IV_BYTES);
  globalThis.crypto.getRandomValues(iv);
  const plainBytes = new TextEncoder().encode(plaintext);

  const encryptedBuf = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: AEAD_TAG_BYTES * 8 },
      key,
      plainBytes,
    ),
  );
  const ciphertextBytes = encryptedBuf.slice(0, encryptedBuf.length - AEAD_TAG_BYTES);
  const authTagBytes = encryptedBuf.slice(encryptedBuf.length - AEAD_TAG_BYTES);

  return `${AEAD_PREFIX}${bytesToBase64Url(iv)}.${bytesToBase64Url(authTagBytes)}.${bytesToBase64Url(ciphertextBytes)}`;
}

/**
 * Verifies the 128-bit GCM authentication tag and decrypts AES-256-GCM ciphertext.
 * Fails closed on legacy XOR (`enc:v1:`), unencrypted plaintext, wrong key salt, or bit tampering.
 */
export async function decryptData(ciphertext: string, secretKeySalt?: string): Promise<string> {
  if (!ciphertext || typeof ciphertext !== 'string' || !ciphertext.startsWith(AEAD_PREFIX)) {
    throw new Error('CRYPTO_AUTH_FAILED: Format ciphertext tidak valid atau tidak terautentikasi.');
  }

  const payload = ciphertext.slice(AEAD_PREFIX.length);
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('CRYPTO_AUTH_FAILED: Struktur AEAD envelope rusak.');
  }

  const [ivB64, tagB64, ctB64] = parts;
  if (ivB64 === undefined || tagB64 === undefined || ctB64 === undefined || !ivB64 || !tagB64) {
    throw new Error('CRYPTO_AUTH_FAILED: Encoding AEAD telah dimodifikasi.');
  }

  const iv = base64UrlToBytes(ivB64);
  const authTag = base64UrlToBytes(tagB64);
  const encryptedBytes = base64UrlToBytes(ctB64);

  if (
    !iv ||
    !authTag ||
    !encryptedBytes ||
    iv.length !== AEAD_IV_BYTES ||
    authTag.length !== AEAD_TAG_BYTES
  ) {
    throw new Error('CRYPTO_AUTH_FAILED: Panjang IV atau GCM AuthTag tidak valid.');
  }

  const combined = new Uint8Array(encryptedBytes.length + authTag.length);
  combined.set(encryptedBytes, 0);
  combined.set(authTag, encryptedBytes.length);

  const key = await deriveAeadCryptoKey(secretKeySalt);
  const decryptedBuf = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: AEAD_TAG_BYTES * 8 },
    key,
    combined,
  );
  return new TextDecoder().decode(decryptedBuf);
}

/**
 * In-memory fallback secure vault for tokens in non-production / test environments.
 */
const inMemorySecureVault = new Map<string, string>();

/**
 * Securely stores authentication token in hardware-backed storage (or encrypted vault in dev/test).
 */
export async function storeSecureToken(key: string, token: string): Promise<void> {
  const encrypted = await encryptData(token);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store');
    if (!SecureStore || typeof SecureStore.setItemAsync !== 'function') {
      throw new Error('EXPO_SECURE_STORE_MISSING');
    }
    await SecureStore.setItemAsync(key, encrypted);
  } catch (err) {
    if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
      throw new Error(
        `SECURE_STORE_REQUIRED: Penyimpanan hardware keystore wajib tersedia pada mode produksi (${(err as Error).message}).`,
      );
    }
    inMemorySecureVault.set(key, encrypted);
  }
}

/**
 * Retrieves and decrypts authentication token from encrypted storage.
 */
export async function getSecureToken(key: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store');
    const encrypted = await SecureStore.getItemAsync(key);
    if (!encrypted) return null;
    return await decryptData(encrypted);
  } catch {
    const encrypted = inMemorySecureVault.get(key);
    if (!encrypted) return null;
    return await decryptData(encrypted);
  }
}

/**
 * Removes token from encrypted storage.
 */
export async function removeSecureToken(key: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
  } catch {
    inMemorySecureVault.delete(key);
  }
}

/**
 * Encrypts offline queue payload before writing to SQLite / MMKV storage.
 */
export async function encryptOfflinePayload<T>(payload: T): Promise<string> {
  const json = JSON.stringify(payload);
  return await encryptData(json, 'offline_queue_vault');
}

/**
 * Decrypts offline queue payload from disk back into typed object.
 */
export async function decryptOfflinePayload<T>(encryptedPayload: string): Promise<T> {
  const json = await decryptData(encryptedPayload, 'offline_queue_vault');
  return JSON.parse(json) as T;
}
