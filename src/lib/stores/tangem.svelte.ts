import { browser } from '$app/environment';

const LS_TANGEM = 'perennia_tangem_card_v1';

class TangemStore {
  kaspaAddress = $state('');
  evmAddress = $state('');
  btcAddress = $state('');
  cardLabel = $state('Tangem Card');
  autoSweepMinKas = $state(0);
  pairedAt = $state(0);

  constructor() {
    if (browser) this.hydrate();
  }

  get isPaired(): boolean {
    return Boolean(this.kaspaAddress);
  }

  get shortKaspa(): string {
    if (!this.kaspaAddress) return '';
    const raw = this.kaspaAddress.replace(/^kaspa:/i, '');
    return `kaspa:${raw.slice(0, 6)}...${raw.slice(-6)}`;
  }

  hydrate() {
    if (!browser) return;
    try {
      const raw = localStorage.getItem(LS_TANGEM);
      if (!raw) return;
      const p = JSON.parse(raw);
      this.kaspaAddress = String(p.kaspaAddress || '');
      this.evmAddress = String(p.evmAddress || '');
      this.btcAddress = String(p.btcAddress || '');
      this.cardLabel = String(p.cardLabel || 'Tangem Card');
      this.autoSweepMinKas = Number(p.autoSweepMinKas) || 0;
      this.pairedAt = Number(p.pairedAt) || 0;
    } catch {}
  }

  persist() {
    if (!browser) return;
    localStorage.setItem(LS_TANGEM, JSON.stringify({
      kaspaAddress: this.kaspaAddress,
      evmAddress: this.evmAddress,
      btcAddress: this.btcAddress,
      cardLabel: this.cardLabel,
      autoSweepMinKas: this.autoSweepMinKas,
      pairedAt: this.pairedAt
    }));
  }

  pairCard(cfg: { kaspaAddress: string; evmAddress?: string; btcAddress?: string; cardLabel?: string; autoSweepMinKas?: number }) {
    this.kaspaAddress = cfg.kaspaAddress.trim().toLowerCase();
    this.evmAddress = (cfg.evmAddress ?? this.evmAddress).trim();
    this.btcAddress = (cfg.btcAddress ?? this.btcAddress).trim();
    if (cfg.cardLabel) this.cardLabel = cfg.cardLabel.trim();
    if (typeof cfg.autoSweepMinKas === 'number') this.autoSweepMinKas = cfg.autoSweepMinKas;
    this.pairedAt = Date.now();
    this.persist();
  }

  setAutoSweep(minKas: number) {
    this.autoSweepMinKas = Math.max(0, Number(minKas) || 0);
    this.persist();
  }

  unpair() {
    this.kaspaAddress = '';
    this.evmAddress = '';
    this.btcAddress = '';
    this.autoSweepMinKas = 0;
    this.pairedAt = 0;
    if (browser) localStorage.removeItem(LS_TANGEM);
  }

  addressForTicker(ticker = 'KAS'): string {
    const t = ticker.toUpperCase();
    if (['KAS', 'SILO', 'NACHO', 'BEDRCK', 'PERX'].includes(t)) return this.kaspaAddress;
    if (t === 'BTC') return this.btcAddress || this.kaspaAddress;
    return this.evmAddress || this.kaspaAddress;
  }
}

export const tangem = new TangemStore();
