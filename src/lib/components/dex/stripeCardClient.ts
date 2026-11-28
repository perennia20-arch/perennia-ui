import { env as pubEnv } from '$env/dynamic/public';
let sp: Promise<any> | null = null;
const slots: Record<string, { stripe: any; card: any }> = {};
async function getStripe() {
  if (typeof window === 'undefined') return null;
  if (!sp) sp = (async () => {
    let pk = (pubEnv.PUBLIC_STRIPE_KEY || '').trim();
    if (!pk) { const d = await fetch('/api/fiat/bank-link?pk=1').then(x => x.json()).catch(() => ({})); pk = String(d.publishableKey || '').trim(); }
    if (!pk) return null;
    if (!(window as any).Stripe) await new Promise<void>((ok, no) => { const s = document.createElement('script'); s.src = 'https://js.stripe.com/v3/'; s.onload = () => ok(); s.onerror = () => no(); document.head.appendChild(s); });
    return (window as any).Stripe(pk);
  })().catch(() => null);
  return sp;
}
export function mountStripeCard(node: HTMLElement, opts: { slot: string; onState?: (s: { error: string | null }) => void }) {
  let dead = false, card: any = null;
  getStripe().then((stripe) => {
    if (dead || !stripe) { if (!dead && !stripe) opts.onState?.({ error: 'Card gateway unavailable.' }); return; }
    const computedText = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#0f172a';
    const computedMuted = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#64748b';
    card = stripe.elements().create('card', { hidePostalCode: false, style: { base: { color: computedText, fontFamily: 'ui-monospace, monospace', fontSize: '13px', iconColor: '#18C6A5', '::placeholder': { color: computedMuted } }, invalid: { color: '#ef4444', iconColor: '#ef4444' } } });
    card.mount(node); slots[opts.slot] = { stripe, card };
    card.on('change', (e: any) => !dead && opts.onState?.({ error: e.error?.message || null }));
  });
  return { destroy() { dead = true; delete slots[opts.slot]; try { card?.unmount(); card?.destroy(); } catch {} } };
}
export async function createStripeCardPm(slot: string) {
  const x = slots[slot]; if (!x) return {};
  const { paymentMethod, error } = await x.stripe.createPaymentMethod({ type: 'card', card: x.card });
  return error ? { error: error.message } : { id: paymentMethod?.id };
}
export async function confirmStripeCard3ds(slot: string, sec: string) {
  const x = slots[slot]; if (!x) return {};
  const { error } = await x.stripe.confirmCardPayment(sec);
  return error ? { error: error.message } : {};
}
