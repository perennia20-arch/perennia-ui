import { browser } from '$app/environment';
class PwaStore {
  isStandalone = $state(false);
  canNativeInstall = $state(false);
  isIos = $state(false);
  isMobile = $state(false);
  showInstallModal = $state(false);
  private deferredPrompt: any = null;
  private ready = false;
  init() {
    if (!browser || this.ready) return;
    this.ready = true;
    const ua = navigator.userAgent || '';
    this.isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const sync = () => {
      this.isMobile = window.innerWidth < 1024;
      this.isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    };
    sync();
    window.matchMedia('(display-mode: standalone)').addEventListener?.('change', sync);
    window.addEventListener('resize', sync, { passive: true });
    const bindPrompt = (e?: any) => {
      const p = e || window.__perenniaInstallPrompt;
      if (p) { this.deferredPrompt = p; this.canNativeInstall = true; }
    };
    bindPrompt();
    window.addEventListener('beforeinstallprompt', (e: Event) => { e.preventDefault(); window.__perenniaInstallPrompt = e; bindPrompt(e); });
    window.addEventListener('perennia:install-ready', () => bindPrompt());
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = window.__perenniaInstallPrompt = null;
      this.canNativeInstall = false; this.isStandalone = true; this.showInstallModal = false;
    });
  }
  async handleInstallClick() {
    if (this.deferredPrompt) {
      await this.deferredPrompt.prompt();
      const res = await this.deferredPrompt.userChoice.catch(() => null);
      if (res?.outcome === 'accepted') { this.deferredPrompt = window.__perenniaInstallPrompt = null; this.canNativeInstall = false; this.showInstallModal = false; }
      return;
    }
    this.showInstallModal = true;
  }
}
export const pwa = new PwaStore();
