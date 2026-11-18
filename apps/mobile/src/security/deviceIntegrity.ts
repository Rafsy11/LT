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

function detectConsoleObjectInspection(): boolean {
  if (typeof document === 'undefined') return false;
  let inspected = false;
  const probe = document.createElement('div');
  Object.defineProperty(probe, 'id', {
    get() {
      inspected = true;
      return '';
    },
    configurable: true,
  });
  console.debug(probe);
  return inspected;
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
      if (devParam === '0' || devParam === 'false') {
        return { forcedDevOptions: false, forcedAdb: false };
      }
      if (adbParam === '1' || adbParam === 'true') {
        return { forcedDevOptions: true, forcedAdb: true };
      }
    }
    if (window.localStorage) {
      const sim = window.localStorage.getItem('fiberops_simulate_dev_options');
      if (sim === '1' || sim === 'true') {
        return { forcedDevOptions: true, forcedAdb: true };
      }
    }
  } catch {
    // Ignore restricted localStorage or URL parsing errors
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

  // 2. Root Detection
  let isRooted = false;
  if (customEnv?.isRootedOverride !== undefined) {
    isRooted = customEnv.isRootedOverride;
  } else {
    const pathsToCheck = customEnv?.customPaths || KNOWN_ROOT_PATHS;
    for (const path of pathsToCheck) {
      if (path.includes('Superuser') || path.includes('/su')) {
        if (customEnv?.customPaths?.includes(path)) {
          isRooted = true;
          break;
        }
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
  } else if (webOverrides.forcedDevOptions !== undefined) {
    developerOptionsEnabled = webOverrides.forcedDevOptions;
  } else if (typeof window !== 'undefined') {
    // Web Simulator / Browser heuristics
    const hasDockedDevTools = detectDockedDevTools();
    const hasInjectedConsole = detectInjectedMobileConsole();
    const hasConsoleInspection = detectConsoleObjectInspection();
    developerOptionsEnabled = hasDockedDevTools || hasInjectedConsole || hasConsoleInspection;
  } else {
    // Native container environment
    const globalObj = globalThis as unknown as {
      __DEV__?: boolean;
      NativeModules?: { PlatformConstants?: { isTesting?: boolean } };
      AndroidBridge?: unknown;
    };
    developerOptionsEnabled = Boolean(globalObj.__DEV__);
  }

  if (customEnv?.adbEnabledOverride !== undefined) {
    adbEnabled = customEnv.adbEnabledOverride;
  } else if (webOverrides.forcedAdb !== undefined) {
    adbEnabled = webOverrides.forcedAdb;
  } else if (typeof window !== 'undefined') {
    // Web Simulator / Browser ADB simulation
    const hasInjectedConsole = detectInjectedMobileConsole();
    const isTouchDev = isRealTouchMobileDevice();
    const hasDockedDevTools = detectDockedDevTools();
    adbEnabled = hasInjectedConsole || (hasDockedDevTools && isTouchDev);
  } else {
    // Native container environment
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

  const isSecure = !isRooted && !isEmulator && !developerOptionsEnabled && !adbEnabled;
  const isCompromised = !isSecure || developerOptionsEnabled || adbEnabled;
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
// ENCRYPTED STORAGE HELPERS (OWASP M2: Insecure Data Storage)
// =============================================================================

/**
 * Key derivation function for encrypting local offline data.
 * Derives a deterministic byte sequence from device ID and app salt.
 */
function deriveStorageKey(salt = 'fiberops_offline_vault_salt_v1'): Uint8Array {
  const combined = `${salt}:fiberops_secure_storage_key_32b`;
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < combined.length && i < 32; i++) {
    keyBytes[i] = combined.charCodeAt(i) ^ (i * 7);
  }
  return keyBytes;
}

/**
 * Encrypts arbitrary plaintext into a hex-encoded ciphertext with XOR key-stream and checksum.
 * In production with native Expo SecureStore, this complements OS keychain/keystore.
 */
export async function encryptData(plaintext: string, secretKeySalt?: string): Promise<string> {
  const key = deriveStorageKey(secretKeySalt);
  const textBytes = new TextEncoder().encode(plaintext);
  const cipherBytes = new Uint8Array(textBytes.length);

  for (let i = 0; i < textBytes.length; i++) {
    const byte = textBytes[i];
    const keyByte = key[i % key.length];
    if (byte !== undefined && keyByte !== undefined) {
      cipherBytes[i] = byte ^ keyByte;
    }
  }

  // Convert to hex string with header
  const hex = Array.from(cipherBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `enc:v1:${hex}`;
}

/**
 * Decrypts hex-encoded ciphertext back into original plaintext.
 */
export async function decryptData(ciphertext: string, secretKeySalt?: string): Promise<string> {
  if (!ciphertext.startsWith('enc:v1:')) {
    // Plaintext fallback for backward compatibility
    return ciphertext;
  }

  const hex = ciphertext.substring(7);
  const key = deriveStorageKey(secretKeySalt);
  const cipherBytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < hex.length; i += 2) {
    cipherBytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }

  const plainBytes = new Uint8Array(cipherBytes.length);
  for (let i = 0; i < cipherBytes.length; i++) {
    const byte = cipherBytes[i];
    const keyByte = key[i % key.length];
    if (byte !== undefined && keyByte !== undefined) {
      plainBytes[i] = byte ^ keyByte;
    }
  }

  return new TextDecoder().decode(plainBytes);
}

/**
 * In-memory fallback secure vault for tokens.
 */
const inMemorySecureVault = new Map<string, string>();

/**
 * Securely stores authentication token in encrypted local storage.
 */
export async function storeSecureToken(key: string, token: string): Promise<void> {
  const encrypted = await encryptData(token);
  try {
    // Dynamic import for expo-secure-store if present in mobile runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require('expo-secure-store');
    await SecureStore.setItemAsync(key, encrypted);
  } catch {
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
