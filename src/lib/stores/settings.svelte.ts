import { browser } from '$app/environment';

class SettingsStore {
    showSettingsModal = $state(false);
    theme = $state<'dark' | 'light'>('dark');
    bgIntensity = $state(0);
    fiatDecimals = $state(2);
    tokenDecimals = $state(8);

    constructor() {
        if (browser) {
            const stored = localStorage.getItem('perennia_ui_settings');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (parsed.theme) this.theme = parsed.theme;
                    if (parsed.bgIntensity !== undefined) this.bgIntensity = parsed.bgIntensity;
                    if (parsed.fiatDecimals !== undefined) this.fiatDecimals = parsed.fiatDecimals;
                    if (parsed.tokenDecimals !== undefined) this.tokenDecimals = parsed.tokenDecimals;
                } catch {
                    // Ignore malformed settings payload
                }
            }
            this.applyTheme();
        }
    }

    save() {
        if (browser) {
            localStorage.setItem(
                'perennia_ui_settings',
                JSON.stringify({
                    theme: this.theme,
                    bgIntensity: this.bgIntensity,
                    fiatDecimals: this.fiatDecimals,
                    tokenDecimals: this.tokenDecimals
                })
            );
            this.applyTheme();
        }
    }

    applyTheme() {
        if (!browser) return;
        const doc = document.documentElement;
        const body = document.body;
        const ratio = Math.max(0, Math.min(100, this.bgIntensity)) / 100;

        if (this.theme === 'dark') {
            doc.classList.remove('theme-light');
            doc.classList.add('theme-dark');
            // Locked calibrated dark mode base (#06080b -> subtle charcoal #0e1218)
            const r = Math.round(6 + ratio * 8);
            const g = Math.round(8 + ratio * 10);
            const b = Math.round(11 + ratio * 13);
            const bgApp = `rgb(${r}, ${g}, ${b})`;
            doc.style.setProperty('--bg-app', bgApp);
            body.style.backgroundColor = bgApp;
        } else {
            doc.classList.remove('theme-dark');
            doc.classList.add('theme-light');
            // Warm Eggshell (#F6F3E9 / 246, 243, 233) -> Rich Warm Vanilla (#EAE4D3 / 234, 228, 211)
            const r = Math.round(246 - ratio * 12);
            const g = Math.round(243 - ratio * 15);
            const b = Math.round(233 - ratio * 22);
            const bgApp = `rgb(${r}, ${g}, ${b})`;
            doc.style.setProperty('--bg-app', bgApp);
            body.style.backgroundColor = bgApp;
        }
    }
}

export const settingsStore = new SettingsStore();