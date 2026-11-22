import { browser } from '$app/environment';
import {
    i18n,
    SUPPORTED_LOCALES,
    SUPPORTED_CURRENCIES,
    type SupportedLocale,
    type SupportedCurrency
} from './i18n.svelte';

class SettingsStore {
    showSettingsModal = $state(false);
    theme = $state<'dark' | 'light'>('dark');
    bgIntensity = $state(0);
    fiatDecimals = $state(2);
    tokenDecimals = $state(8);
    decimalsCustomized = $state(false);
    locale = $state<SupportedLocale>('EN');
    currency = $state<SupportedCurrency>('USD');

    constructor() {
        if (browser) {
            const isNarrowMobile = window.innerWidth < 768;
            this.tokenDecimals = isNarrowMobile ? 4 : 8;

            const stored = localStorage.getItem('perennia_ui_settings');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (parsed.theme === 'dark' || parsed.theme === 'light') {
                        this.theme = parsed.theme;
                    }
                    if (parsed.bgIntensity !== undefined) {
                        this.bgIntensity = Number(parsed.bgIntensity) || 0;
                    }
                    if (parsed.fiatDecimals !== undefined) {
                        this.fiatDecimals = Number(parsed.fiatDecimals) ?? 2;
                    }
                    if (parsed.decimalsCustomized === true) {
                        this.decimalsCustomized = true;
                        if (parsed.tokenDecimals !== undefined) {
                            this.tokenDecimals = Number(parsed.tokenDecimals) ?? (isNarrowMobile ? 4 : 8);
                        }
                    } else if (!isNarrowMobile && parsed.tokenDecimals !== undefined) {
                        this.tokenDecimals = Number(parsed.tokenDecimals) ?? 8;
                    }
                    if (
                        parsed.locale &&
                        SUPPORTED_LOCALES.some((l) => l.code === parsed.locale)
                    ) {
                        this.locale = parsed.locale as SupportedLocale;
                        i18n.setLocale(this.locale);
                    }
                    if (
                        parsed.currency &&
                        SUPPORTED_CURRENCIES.some((c) => c.code === parsed.currency)
                    ) {
                        this.currency = parsed.currency as SupportedCurrency;
                        i18n.setCurrency(this.currency);
                    }
                } catch {
                    // Ignore malformed settings payload
                }
            }
            this.applyTheme();
        }
    }

    setFiatDecimals(val: number) {
        this.fiatDecimals = Math.max(0, Math.min(8, Math.round(Number(val) || 0)));
        this.decimalsCustomized = true;
        this.save();
    }

    setTokenDecimals(val: number) {
        this.tokenDecimals = Math.max(0, Math.min(18, Math.round(Number(val) || 0)));
        this.decimalsCustomized = true;
        this.save();
    }

    setLocale(nextLocale: SupportedLocale) {
        this.locale = nextLocale;
        i18n.setLocale(nextLocale);
        this.save();
    }

    setCurrency(nextCurrency: SupportedCurrency) {
        this.currency = nextCurrency;
        i18n.setCurrency(nextCurrency);
        const spec = SUPPORTED_CURRENCIES.find((c) => c.code === nextCurrency);
        if (spec && nextCurrency === 'JPY' && this.fiatDecimals === 2) {
            this.fiatDecimals = 0;
        } else if (spec && nextCurrency !== 'JPY' && this.fiatDecimals === 0) {
            this.fiatDecimals = spec.defaultDecimals;
        }
        this.save();
    }

    save() {
        if (browser) {
            i18n.setLocale(this.locale);
            i18n.setCurrency(this.currency);
            localStorage.setItem(
                'perennia_ui_settings',
                JSON.stringify({
                    theme: this.theme,
                    bgIntensity: this.bgIntensity,
                    fiatDecimals: this.fiatDecimals,
                    tokenDecimals: this.tokenDecimals,
                    decimalsCustomized: this.decimalsCustomized,
                    locale: this.locale,
                    currency: this.currency
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
            const r = Math.round(6 + ratio * 8);
            const g = Math.round(8 + ratio * 10);
            const b = Math.round(11 + ratio * 13);
            const bgApp = `rgb(${r}, ${g}, ${b})`;
            doc.style.setProperty('--bg-app', bgApp);
            body.style.backgroundColor = bgApp;
        } else {
            doc.classList.remove('theme-dark');
            doc.classList.add('theme-light');
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