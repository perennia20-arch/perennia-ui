// src/lib/utils/clipboard.ts

function fallbackExecCommandCopy(value: string): boolean {
    if (typeof document === 'undefined' || !document.body) return false;
    const prevFocus = document.activeElement as HTMLElement | null;
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';

    document.body.appendChild(textarea);
    let ok = false;
    try {
        textarea.focus({ preventScroll: true });
        textarea.select();
        textarea.setSelectionRange(0, value.length);
        ok = Boolean(document.execCommand('copy'));
    } catch {
        ok = false;
    } finally {
        textarea.remove();
        try {
            prevFocus?.focus?.({ preventScroll: true });
        } catch {
            // Ignore focus restoration error
        }
    }
    return ok;
}

/**
 * Copies text across both HTTPS (`navigator.clipboard`) and insecure HTTP origins
 * (`http://192.168.50.100`) using a synchronous hidden textarea fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !text) {
        return false;
    }

    if (
        window.isSecureContext &&
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
    ) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return fallbackExecCommandCopy(text);
        }
    }

    return fallbackExecCommandCopy(text);
}
