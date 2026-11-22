function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) {
    return false;
  }
  const field = Object.assign(document.createElement('textarea'), { value: text });
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;inset-inline-start:0;opacity:0;pointer-events:none';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

/**
 * Copies plain text to the system clipboard using the Async Clipboard API with a
 * non-scrolling `document.execCommand('copy')` fallback for non-HTTPS on-premise LAN hosts.
 *
 * @param text - Non-empty text to write to the clipboard.
 * @returns `true` if the text was copied, or `false` if clipboard access was unavailable/denied.
 * @example
 * const ok = await copyTextToClipboard('-2.9909, 104.7566');
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return legacyCopy(text);
    }
  }

  return legacyCopy(text);
}
