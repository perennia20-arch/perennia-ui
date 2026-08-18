import { browser } from '$app/environment';

class SettingsStore {
    showSettingsModal = $state(false);
    uiBrightness = $state(1.0);
    theme = $state<'dark' | 'light'>('dark');
    bgIntensity = $state(0); // 0% (stark) to 100% (soft/shaded)
    fiatDecimals = $state(2);
    tokenDecimals = $state(8);

    constructor() {
        if (browser) {
            const stored = localStorage.getItem('perennia_ui_settings');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (parsed.uiBrightness !== undefined) this.uiBrightness = parsed.uiBrightness;
                    if (parsed.theme) this.theme = parsed.theme;
                    if (parsed.bgIntensity !== undefined) this.bgIntensity = parsed.bgIntensity;
                    if (parsed.fiatDecimals !== undefined) this.fiatDecimals = parsed.fiatDecimals;
                    if (parsed.tokenDecimals !== undefined) this.tokenDecimals = parsed.tokenDecimals;
                } catch (e) {}
            }
            this.applyTheme();
        }
    }

    save() {
        if (browser) {
            localStorage.setItem('perennia_ui_settings', JSON.stringify({
                uiBrightness: this.uiBrightness,
                theme: this.theme,
                bgIntensity: this.bgIntensity,
                fiatDecimals: this.fiatDecimals,
                tokenDecimals: this.tokenDecimals
            }));
            this.applyTheme();
        }
    }

    applyTheme() {
        if (!browser) return;
        const doc = document.documentElement;
        const body = document.body;

        if (this.theme === 'dark') {
            doc.classList.remove('theme-light');
            doc.classList.add('theme-dark');
            
            // Intensity 0 = Deep Space (#000000) -> Intensity 100 = Subtle Blue/Black (#1c1c24)
            const r = Math.round((this.bgIntensity / 100) * 15);
            const g = Math.round((this.bgIntensity / 100) * 15);
            const b = Math.round((this.bgIntensity / 100) * 18);
            const bgApp = `rgb(${r}, ${g}, ${b})`;
            doc.style.setProperty('--bg-app', bgApp);
            body.style.backgroundColor = bgApp;
        } else {
            doc.classList.remove('theme-dark');
            doc.classList.add('theme-light');
            
            // Intensity 0 = Stark Bright White (#ffffff) -> Intensity 100 = Soft Zinc-50 (#f8fafc)
            const val = Math.round(255 - (this.bgIntensity / 100) * 7);
            const bgApp = `rgb(${val}, ${val}, ${val})`;
            doc.style.setProperty('--bg-app', bgApp);
            body.style.backgroundColor = bgApp;
        }
    }
}

export const settingsStore = new SettingsStore();