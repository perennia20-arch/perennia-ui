// WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\stores\i18n.svelte.ts
import { browser } from '$app/environment';
import {
    ORACLE_USD_E8_SCALE,
    USD_MICROS_SCALE,
    safeDecimalToAtomic,
    safeFiniteNumber,
    safeParseU128
} from '$lib/crypto/atomicMath';

export type SupportedLocale =
    | 'EN'
    | 'ES'
    | 'DE'
    | 'PT'
    | 'TR'
    | 'RU'
    | 'ZH'
    | 'JA';

export type SupportedCurrency =
    | 'USD'
    | 'EUR'
    | 'GBP'
    | 'CAD'
    | 'AUD'
    | 'JPY'
    | 'BRL'
    | 'TRY'
    | 'NGN';

export interface LocaleOption {
    code: SupportedLocale;
    label: string;
    nativeName: string;
    bcp47: string;
}

export interface CurrencyOption {
    code: SupportedCurrency;
    symbol: string;
    name: string;
    defaultDecimals: number;
}

export const SUPPORTED_LOCALES: readonly LocaleOption[] = [
    { code: 'EN', label: 'English (EN)', nativeName: 'English (EN)', bcp47: 'en-US' },
    { code: 'ES', label: 'Español (ES)', nativeName: 'Español (ES)', bcp47: 'es-ES' },
    { code: 'DE', label: 'Deutsch (DE)', nativeName: 'Deutsch (DE)', bcp47: 'de-DE' },
    { code: 'PT', label: 'Português (PT)', nativeName: 'Português (PT)', bcp47: 'pt-BR' },
    { code: 'TR', label: 'Türkçe (TR)', nativeName: 'Türkçe (TR)', bcp47: 'tr-TR' },
    { code: 'RU', label: 'Русский (RU)', nativeName: 'Русский (RU)', bcp47: 'ru-RU' },
    { code: 'ZH', label: '中文 (ZH)', nativeName: '中文 (ZH)', bcp47: 'zh-CN' },
    { code: 'JA', label: '日本語 (JA)', nativeName: '日本語 (JA)', bcp47: 'ja-JP' }
] as const;

export const SUPPORTED_CURRENCIES: readonly CurrencyOption[] = [
    { code: 'USD', symbol: '$', name: 'US Dollar', defaultDecimals: 2 },
    { code: 'EUR', symbol: '€', name: 'Euro', defaultDecimals: 2 },
    { code: 'GBP', symbol: '£', name: 'British Pound', defaultDecimals: 2 },
    { code: 'CAD', symbol: '$', name: 'Canadian Dollar', defaultDecimals: 2 },
    { code: 'AUD', symbol: '$', name: 'Australian Dollar', defaultDecimals: 2 },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen', defaultDecimals: 0 },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', defaultDecimals: 2 },
    { code: 'TRY', symbol: '₺', name: 'Turkish Lira', defaultDecimals: 2 },
    { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', defaultDecimals: 2 }
] as const;

const LOCALE_STORAGE_KEY = 'perennia_locale_v2';
const CURRENCY_STORAGE_KEY = 'perennia_currency_v2';
const FX_CACHE_STORAGE_KEY = 'perennia_fx_rates_cache_v2';

export type TranslationKey = keyof typeof TRANSLATIONS.EN;

const TRANSLATIONS = {
    EN: {
        'nav.buy': 'BUY',
        'nav.mine': 'MINE',
        'nav.swap': 'SWAP',
        'nav.bot': 'BOT',
        'nav.wallet': 'WALLET',
        'nav.operations': 'MINE',
        'nav.exchange': 'SWAP',
        'nav.treasury': 'WALLET',
        'nav.tax_fortress': 'LEDGER',
        'nav.forge': 'FORGE',
        'nav.director': 'ADMIN',
        'header.buy_crypto': 'BUY',
        'header.unlock_vault': 'LOG IN',
        'header.brand_verbs': 'BUY · MINE · SWAP · BOT',
        'header.node_online': 'BUY · MINE · SWAP · BOT',
        'header.mining_settlement': 'BUY · MINE · SWAP · BOT',
        'header.copied': 'COPIED ✓',
        'modal.language': 'LANGUAGE',
        'modal.currency': 'CURRENCY',
        'modal.close': 'DONE',
        'wallet.ledger_csv': 'LEDGER / CSV ↗',
        'wallet.copy': 'COPY ADDRESS',
        'wallet.disconnect': 'DISCONNECT',
        'wallet.vault_backup': 'VAULT .JSON',
        'wallet.profile_backup': 'PROFILE .JSON',
        'ops.master_pool_telemetry': 'Pool Telemetry',
        'ops.verified_shares': 'Shares',
        'ops.add_worker': '+ MINER',
        'ops.break_off_sector': '+ SPLIT',
        'ops.live_hash_power': 'Hashrate',
        'ops.kas_price': 'KAS PRICE',
        'ops.settlement_silos': 'TOKEN SPLITS',
        'ops.liquidity_plants': 'LIQUIDITY PAIRS',
        'ops.pool_distribution': 'PENDING SPLITS',
        'ops.utc_settlement': 'Next Payout',
        'ops.active_buckets': 'Pending Batches',
        'ops.node_sync': 'SYNC',
        'ops.online': 'ONLINE',
        'ops.offline': 'OFFLINE',
        'dex.swap': 'Swap',
        'dex.liquidity': 'Pair',
        'dex.p2p': 'P2P',
        'dex.fiat': 'Buy / Sell',
        'dex.slippage': 'Slippage',
        'dex.search_placeholder': 'Search tokens, equities, or contracts...',
        'dex.you_pay': 'Pay',
        'dex.you_receive': 'Get',
        'dex.available': 'Balance',
        'dex.live_oracle_rate': 'Oracle Rate',
        'dex.active_fee_tier': 'Fee Tier',
        'dex.enter_swap_amount': 'Enter Amount',
        'dex.review_execute_swap': 'Swap',
        'dex.supply_liquidity': 'Pair Liquidity',
        'dex.anchor_deposit': 'Base Deposit',
        'dex.paired_asset': 'Partner Asset',
        'dex.lock_duration': 'Lock',
        'dex.silo_fee_tier': 'SILO Tier',
        'dex.stake_silo': 'Lock SILO',
        'dex.deploy_p2p_offer': 'Post Offer',
        'dex.you_offer': 'Offer',
        'dex.you_require': 'Require',
        'dex.open_p2p_offers': 'Open Offers',
        'dex.fiat_bridge': 'Fiat Rail',
        'dex.buy_with_usd': 'Buy',
        'dex.sell_for_usd': 'Sell',
        'treasury.total_vault_value': 'Total Wallet Value',
        'treasury.master_treasury_balance': 'Treasury Balance',
        'treasury.wallet_balance_onchain': 'On-Chain Balance',
        'treasury.pending_settlement': 'Pending Settlement',
        'treasury.staked_in_lp': 'In Liquidity Pairs',
        'treasury.perennia_wallet': 'Perennia Wallet',
        'treasury.perennia_wallet_sub': '',
        'treasury.search_chains': 'Search chains or add ticker (SILO, NACHO, USDC)...',
        'treasury.organize': 'Order',
        'treasury.done': 'Done',
        'treasury.manage_chains': 'Chains',
        'treasury.done_chains': 'Done',
        'treasury.receive_qr': 'Receive',
        'treasury.send_withdraw_l1': 'Send',
        'treasury.cold_vault': 'Vault',
        'treasury.activity': 'Ledger',
        'tax.title': 'Passive HIFO Ledger & Export',
        'tax.configure_jurisdiction': '[ Tax Profile ]',
        'tax.generate_pdf': '1099-DA / 8949 PDF ↓',
        'tax.export_csv': 'Export CSV ↓',
        'tax.gross_proceeds': 'Gross Proceeds (YTD)',
        'tax.hifo_pool': 'HIFO Cost-Basis Pool',
        'tax.effective_rate': 'Effective Rate',
        'tax.tax_escrow': 'Tax Reserve'
    },
    ES: {
        'nav.buy': 'COMPRAR',
        'nav.mine': 'MINAR',
        'nav.swap': 'CANJE',
        'nav.bot': 'BOT',
        'nav.wallet': 'CARTERA',
        'nav.operations': 'MINAR',
        'nav.exchange': 'CANJE',
        'nav.treasury': 'CARTERA',
        'nav.tax_fortress': 'REGISTRO',
        'nav.forge': 'FORJA',
        'nav.director': 'ADMIN',
        'header.buy_crypto': 'COMPRAR',
        'header.unlock_vault': 'ENTRAR',
        'header.brand_verbs': 'COMPRAR · MINAR · CANJE · BOT',
        'header.node_online': 'COMPRAR · MINAR · CANJE · BOT',
        'header.mining_settlement': 'COMPRAR · MINAR · CANJE · BOT',
        'header.copied': 'COPIADO ✓',
        'modal.language': 'IDIOMA',
        'modal.currency': 'MONEDA',
        'modal.close': 'LISTO',
        'wallet.ledger_csv': 'REGISTRO / CSV ↗',
        'wallet.copy': 'COPIAR DIRECCIÓN',
        'wallet.disconnect': 'DESCONECTAR',
        'wallet.vault_backup': 'BÓVEDA .JSON',
        'wallet.profile_backup': 'PERFIL .JSON',
        'ops.master_pool_telemetry': 'Telemetría Pool',
        'ops.verified_shares': 'Shares',
        'ops.add_worker': '+ MINERO',
        'ops.break_off_sector': '+ SPLIT',
        'ops.live_hash_power': 'Hashrate',
        'ops.kas_price': 'PRECIO KAS',
        'ops.settlement_silos': 'SPLITS',
        'ops.liquidity_plants': 'PARES LP',
        'ops.pool_distribution': 'LOTES',
        'ops.utc_settlement': 'Próximo Pago',
        'ops.active_buckets': 'Lotes Activos',
        'ops.node_sync': 'NODO',
        'ops.online': 'ACTIVO',
        'ops.offline': 'INACTIVO',
        'dex.swap': 'Canje',
        'dex.liquidity': 'Par',
        'dex.p2p': 'P2P',
        'dex.fiat': 'Fiat',
        'dex.slippage': 'Desliz.',
        'dex.search_placeholder': 'Buscar tokens, acciones o contratos...',
        'dex.you_pay': 'Pagas',
        'dex.you_receive': 'Recibes',
        'dex.available': 'Saldo',
        'dex.live_oracle_rate': 'Oráculo',
        'dex.active_fee_tier': 'Comisión',
        'dex.enter_swap_amount': 'Monto',
        'dex.review_execute_swap': 'Canjear',
        'dex.supply_liquidity': 'Aportar Par',
        'dex.anchor_deposit': 'Base',
        'dex.paired_asset': 'Par',
        'dex.lock_duration': 'Bloqueo',
        'dex.silo_fee_tier': 'Nivel SILO',
        'dex.stake_silo': 'Bloquear SILO',
        'dex.deploy_p2p_offer': 'Publicar P2P',
        'dex.you_offer': 'Ofreces',
        'dex.you_require': 'Pides',
        'dex.open_p2p_offers': 'Ofertas P2P',
        'dex.fiat_bridge': 'Fiat',
        'dex.buy_with_usd': 'Comprar',
        'dex.sell_for_usd': 'Vender',
        'treasury.total_vault_value': 'Valor Total',
        'treasury.master_treasury_balance': 'Tesorería',
        'treasury.wallet_balance_onchain': 'Saldo On-Chain',
        'treasury.pending_settlement': 'Pendiente',
        'treasury.staked_in_lp': 'En Pares LP',
        'treasury.perennia_wallet': 'Cartera Perennia',
        'treasury.perennia_wallet_sub': '',
        'treasury.search_chains': 'Buscar redes o añadir token...',
        'treasury.organize': 'Orden',
        'treasury.done': 'Listo',
        'treasury.manage_chains': 'Redes',
        'treasury.done_chains': 'Listo',
        'treasury.receive_qr': 'Recibir',
        'treasury.send_withdraw_l1': 'Enviar',
        'treasury.cold_vault': 'Bóveda',
        'treasury.activity': 'Historial',
        'tax.title': 'Registro HIFO y Exportación',
        'tax.configure_jurisdiction': '[ Perfil Fiscal ]',
        'tax.generate_pdf': 'PDF 1099-DA / 8949 ↓',
        'tax.export_csv': 'Exportar CSV ↓',
        'tax.gross_proceeds': 'Ingresos Brutos (YTD)',
        'tax.hifo_pool': 'Lotes HIFO',
        'tax.effective_rate': 'Tasa Efectiva',
        'tax.tax_escrow': 'Reserva'
    },
    DE: {
        'nav.buy': 'KAUF',
        'nav.mine': 'MINE',
        'nav.swap': 'SWAP',
        'nav.bot': 'BOT',
        'nav.wallet': 'WALLET',
        'nav.operations': 'MINE',
        'nav.exchange': 'SWAP',
        'nav.treasury': 'WALLET',
        'nav.tax_fortress': 'LEDGER',
        'nav.forge': 'FORGE',
        'nav.director': 'ADMIN',
        'header.buy_crypto': 'KAUF',
        'header.unlock_vault': 'LOGIN',
        'header.brand_verbs': 'KAUF · MINE · SWAP · BOT',
        'header.node_online': 'KAUF · MINE · SWAP · BOT',
        'header.mining_settlement': 'KAUF · MINE · SWAP · BOT',
        'header.copied': 'KOPIERT ✓',
        'modal.language': 'SPRACHE',
        'modal.currency': 'WÄHRUNG',
        'modal.close': 'FERTIG',
        'wallet.ledger_csv': 'LEDGER / CSV ↗',
        'wallet.copy': 'ADRESSE KOPIEREN',
        'wallet.disconnect': 'TRENNEN',
        'wallet.vault_backup': 'TRESOR .JSON',
        'wallet.profile_backup': 'PROFIL .JSON',
        'ops.master_pool_telemetry': 'Pool-Telemetrie',
        'ops.verified_shares': 'Shares',
        'ops.add_worker': '+ MINER',
        'ops.break_off_sector': '+ SPLIT',
        'ops.live_hash_power': 'Hashrate',
        'ops.kas_price': 'KAS-PREIS',
        'ops.settlement_silos': 'SPLITS',
        'ops.liquidity_plants': 'LP-PAARE',
        'ops.pool_distribution': 'BATCHES',
        'ops.utc_settlement': 'Nächster Payout',
        'ops.active_buckets': 'Aktive Batches',
        'ops.node_sync': 'SYNC',
        'ops.online': 'ONLINE',
        'ops.offline': 'OFFLINE',
        'dex.swap': 'Swap',
        'dex.liquidity': 'Paar',
        'dex.p2p': 'P2P',
        'dex.fiat': 'Fiat',
        'dex.slippage': 'Slippage',
        'dex.search_placeholder': 'Tokens, Aktien oder Kontrakte...',
        'dex.you_pay': 'Zahle',
        'dex.you_receive': 'Erhalte',
        'dex.available': 'Guthaben',
        'dex.live_oracle_rate': 'Orakelkurs',
        'dex.active_fee_tier': 'Gebühr',
        'dex.enter_swap_amount': 'Betrag',
        'dex.review_execute_swap': 'Tauschen',
        'dex.supply_liquidity': 'LP Binden',
        'dex.anchor_deposit': 'Basis',
        'dex.paired_asset': 'Partner',
        'dex.lock_duration': 'Sperre',
        'dex.silo_fee_tier': 'SILO-Stufe',
        'dex.stake_silo': 'SILO Sperren',
        'dex.deploy_p2p_offer': 'P2P Angebot',
        'dex.you_offer': 'Angebot',
        'dex.you_require': 'Gesuch',
        'dex.open_p2p_offers': 'Offene P2P',
        'dex.fiat_bridge': 'Fiat',
        'dex.buy_with_usd': 'Kaufen',
        'dex.sell_for_usd': 'Verkaufen',
        'treasury.total_vault_value': 'Gesamtwert',
        'treasury.master_treasury_balance': 'Treasury',
        'treasury.wallet_balance_onchain': 'On-Chain',
        'treasury.pending_settlement': 'Ausstehend',
        'treasury.staked_in_lp': 'In LP-Paaren',
        'treasury.perennia_wallet': 'Perennia Wallet',
        'treasury.perennia_wallet_sub': '',
        'treasury.search_chains': 'Chains suchen oder Token hinzufügen...',
        'treasury.organize': 'Sortieren',
        'treasury.done': 'Fertig',
        'treasury.manage_chains': 'Chains',
        'treasury.done_chains': 'Fertig',
        'treasury.receive_qr': 'Empfang',
        'treasury.send_withdraw_l1': 'Senden',
        'treasury.cold_vault': 'Tresor',
        'treasury.activity': 'Verlauf',
        'tax.title': 'HIFO-Steuerbuch & Export',
        'tax.configure_jurisdiction': '[ Steuerprofil ]',
        'tax.generate_pdf': '1099-DA / 8949 PDF ↓',
        'tax.export_csv': 'CSV Export ↓',
        'tax.gross_proceeds': 'Bruttoerlöse (YTD)',
        'tax.hifo_pool': 'HIFO-Basis',
        'tax.effective_rate': 'Steuersatz',
        'tax.tax_escrow': 'Rücklage'
    },
    PT: {
        'nav.buy': 'COMPRAR',
        'nav.mine': 'MINERAR',
        'nav.swap': 'TROCA',
        'nav.bot': 'BOT',
        'nav.wallet': 'CARTEIRA',
        'nav.operations': 'MINERAR',
        'nav.exchange': 'TROCA',
        'nav.treasury': 'CARTEIRA',
        'nav.tax_fortress': 'RAZÃO',
        'nav.forge': 'FORJA',
        'nav.director': 'ADMIN',
        'header.buy_crypto': 'COMPRAR',
        'header.unlock_vault': 'ENTRAR',
        'header.brand_verbs': 'COMPRAR · MINERAR · TROCA · BOT',
        'header.node_online': 'COMPRAR · MINERAR · TROCA · BOT',
        'header.mining_settlement': 'COMPRAR · MINERAR · TROCA · BOT',
        'header.copied': 'COPIADO ✓',
        'modal.language': 'IDIOMA',
        'modal.currency': 'MOEDA',
        'modal.close': 'PRONTO',
        'wallet.ledger_csv': 'RAZÃO / CSV ↗',
        'wallet.copy': 'COPIAR ENDEREÇO',
        'wallet.disconnect': 'SAIR',
        'wallet.vault_backup': 'COFRE .JSON',
        'wallet.profile_backup': 'PERFIL .JSON',
        'ops.master_pool_telemetry': 'Telemetria',
        'ops.verified_shares': 'Shares',
        'ops.add_worker': '+ MINER',
        'ops.break_off_sector': '+ SPLIT',
        'ops.live_hash_power': 'Hashrate',
        'ops.kas_price': 'PREÇO KAS',
        'ops.settlement_silos': 'SPLITS',
        'ops.liquidity_plants': 'PARES LP',
        'ops.pool_distribution': 'LOTES',
        'ops.utc_settlement': 'Próximo Pago',
        'ops.active_buckets': 'Lotes Ativos',
        'ops.node_sync': 'NÓ',
        'ops.online': 'ONLINE',
        'ops.offline': 'OFFLINE',
        'dex.swap': 'Troca',
        'dex.liquidity': 'Par',
        'dex.p2p': 'P2P',
        'dex.fiat': 'Fiat',
        'dex.slippage': 'Slippage',
        'dex.search_placeholder': 'Buscar tokens, ações ou contratos...',
        'dex.you_pay': 'Paga',
        'dex.you_receive': 'Recebe',
        'dex.available': 'Saldo',
        'dex.live_oracle_rate': 'Oráculo',
        'dex.active_fee_tier': 'Taxa',
        'dex.enter_swap_amount': 'Valor',
        'dex.review_execute_swap': 'Trocar',
        'dex.supply_liquidity': 'Criar Par',
        'dex.anchor_deposit': 'Base',
        'dex.paired_asset': 'Par',
        'dex.lock_duration': 'Trava',
        'dex.silo_fee_tier': 'Nível SILO',
        'dex.stake_silo': 'Travar SILO',
        'dex.deploy_p2p_offer': 'Oferta P2P',
        'dex.you_offer': 'Oferta',
        'dex.you_require': 'Pedido',
        'dex.open_p2p_offers': 'P2P Abertas',
        'dex.fiat_bridge': 'Fiat',
        'dex.buy_with_usd': 'Comprar',
        'dex.sell_for_usd': 'Vender',
        'treasury.total_vault_value': 'Saldo Total',
        'treasury.master_treasury_balance': 'Tesouraria',
        'treasury.wallet_balance_onchain': 'Saldo On-Chain',
        'treasury.pending_settlement': 'Pendente',
        'treasury.staked_in_lp': 'Em Pares LP',
        'treasury.perennia_wallet': 'Carteira Perennia',
        'treasury.perennia_wallet_sub': '',
        'treasury.search_chains': 'Buscar redes ou adicionar token...',
        'treasury.organize': 'Ordenar',
        'treasury.done': 'Pronto',
        'treasury.manage_chains': 'Redes',
        'treasury.done_chains': 'Pronto',
        'treasury.receive_qr': 'Receber',
        'treasury.send_withdraw_l1': 'Enviar',
        'treasury.cold_vault': 'Cofre',
        'treasury.activity': 'Histórico',
        'tax.title': 'Razão HIFO e Exportação',
        'tax.configure_jurisdiction': '[ Perfil Fiscal ]',
        'tax.generate_pdf': 'PDF 1099-DA / 8949 ↓',
        'tax.export_csv': 'Exportar CSV ↓',
        'tax.gross_proceeds': 'Receita Bruta (YTD)',
        'tax.hifo_pool': 'Lotes HIFO',
        'tax.effective_rate': 'Alíquota',
        'tax.tax_escrow': 'Reserva'
    },
    TR: {
        'nav.buy': 'AL',
        'nav.mine': 'KAZ',
        'nav.swap': 'TAKAS',
        'nav.bot': 'BOT',
        'nav.wallet': 'CÜZDAN',
        'nav.operations': 'KAZ',
        'nav.exchange': 'TAKAS',
        'nav.treasury': 'CÜZDAN',
        'nav.tax_fortress': 'DEFTER',
        'nav.forge': 'FORGE',
        'nav.director': 'ADMİN',
        'header.buy_crypto': 'AL',
        'header.unlock_vault': 'GİRİŞ',
        'header.brand_verbs': 'AL · KAZ · TAKAS · BOT',
        'header.node_online': 'AL · KAZ · TAKAS · BOT',
        'header.mining_settlement': 'AL · KAZ · TAKAS · BOT',
        'header.copied': 'KOPYALANDI ✓',
        'modal.language': 'DİL',
        'modal.currency': 'PARA BİRİMİ',
        'modal.close': 'TAMAM',
        'wallet.ledger_csv': 'DEFTER / CSV ↗',
        'wallet.copy': 'ADRESİ KOPYALA',
        'wallet.disconnect': 'ÇIKIŞ',
        'wallet.vault_backup': 'KASA .JSON',
        'wallet.profile_backup': 'PROFİL .JSON',
        'ops.master_pool_telemetry': 'Havuz Telemetrisi',
        'ops.verified_shares': 'Paylar',
        'ops.add_worker': '+ MADENCİ',
        'ops.break_off_sector': '+ BÖL',
        'ops.live_hash_power': 'Hash Gücü',
        'ops.kas_price': 'KAS FİYAT',
        'ops.settlement_silos': 'BÖLÜMLER',
        'ops.liquidity_plants': 'LP ÇİFTLERİ',
        'ops.pool_distribution': 'BEKLEYEN',
        'ops.utc_settlement': 'Sonraki Ödeme',
        'ops.active_buckets': 'Aktif Gruplar',
        'ops.node_sync': 'SENKRON',
        'ops.online': 'ÇEVRİMİÇİ',
        'ops.offline': 'ÇEVRİMDIŞI',
        'dex.swap': 'Takas',
        'dex.liquidity': 'Çift',
        'dex.p2p': 'P2P',
        'dex.fiat': 'Fiat',
        'dex.slippage': 'Kayma',
        'dex.search_placeholder': 'Token, hisse veya kontrat ara...',
        'dex.you_pay': 'Öde',
        'dex.you_receive': 'Al',
        'dex.available': 'Bakiye',
        'dex.live_oracle_rate': 'Orakl Kur',
        'dex.active_fee_tier': 'Komisyon',
        'dex.enter_swap_amount': 'Tutar Gir',
        'dex.review_execute_swap': 'Takas Yap',
        'dex.supply_liquidity': 'Çift Ekle',
        'dex.anchor_deposit': 'Temel',
        'dex.paired_asset': 'Karşı',
        'dex.lock_duration': 'Kilit',
        'dex.silo_fee_tier': 'SILO Kademesi',
        'dex.stake_silo': 'SILO Kilitle',
        'dex.deploy_p2p_offer': 'P2P İlan',
        'dex.you_offer': 'Teklif',
        'dex.you_require': 'Talep',
        'dex.open_p2p_offers': 'Açık P2P',
        'dex.fiat_bridge': 'Fiat',
        'dex.buy_with_usd': 'Al',
        'dex.sell_for_usd': 'Sat',
        'treasury.total_vault_value': 'Toplam Değer',
        'treasury.master_treasury_balance': 'Hazine',
        'treasury.wallet_balance_onchain': 'Zincir Bakiyesi',
        'treasury.pending_settlement': 'Bekleyen',
        'treasury.staked_in_lp': 'LP Çiftlerinde',
        'treasury.perennia_wallet': 'Perennia Cüzdan',
        'treasury.perennia_wallet_sub': '',
        'treasury.search_chains': 'Ağ ara veya token ekle...',
        'treasury.organize': 'Sırala',
        'treasury.done': 'Bitti',
        'treasury.manage_chains': 'Ağlar',
        'treasury.done_chains': 'Bitti',
        'treasury.receive_qr': 'Al',
        'treasury.send_withdraw_l1': 'Gönder',
        'treasury.cold_vault': 'Kasa',
        'treasury.activity': 'Geçmiş',
        'tax.title': 'Pasif HIFO Defteri & Dışa Aktarım',
        'tax.configure_jurisdiction': '[ Vergi Profili ]',
        'tax.generate_pdf': '1099-DA / 8949 PDF ↓',
        'tax.export_csv': 'CSV İndir ↓',
        'tax.gross_proceeds': 'Brüt Gelir (YTD)',
        'tax.hifo_pool': 'HIFO Havuzu',
        'tax.effective_rate': 'Oran',
        'tax.tax_escrow': 'Rezerv'
    },
    RU: {
        'nav.buy': 'КУПИТЬ',
        'nav.mine': 'МАЙН',
        'nav.swap': 'ОБМЕН',
        'nav.bot': 'БОТ',
        'nav.wallet': 'КОШЕЛЁК',
        'nav.operations': 'МАЙН',
        'nav.exchange': 'ОБМЕН',
        'nav.treasury': 'КОШЕЛЁК',
        'nav.tax_fortress': 'ОТЧЁТ',
        'nav.forge': 'FORGE',
        'nav.director': 'АДМИН',
        'header.buy_crypto': 'КУПИТЬ',
        'header.unlock_vault': 'ВОЙТИ',
        'header.brand_verbs': 'КУПИТЬ · МАЙН · ОБМЕН · БОТ',
        'header.node_online': 'КУПИТЬ · МАЙН · ОБМЕН · БОТ',
        'header.mining_settlement': 'КУПИТЬ · МАЙН · ОБМЕН · БОТ',
        'header.copied': 'СКОПИРОВАНО ✓',
        'modal.language': 'ЯЗЫК',
        'modal.currency': 'ВАЛЮТА',
        'modal.close': 'ГОТОВО',
        'wallet.ledger_csv': 'ОТЧЁТ / CSV ↗',
        'wallet.copy': 'КОПИРОВАТЬ АДРЕС',
        'wallet.disconnect': 'ОТКЛЮЧИТЬ',
        'wallet.vault_backup': 'СЕЙФ .JSON',
        'wallet.profile_backup': 'ПРОФИЛЬ .JSON',
        'ops.master_pool_telemetry': 'Телеметрия пула',
        'ops.verified_shares': 'Шары',
        'ops.add_worker': '+ МАЙНЕР',
        'ops.break_off_sector': '+ СПЛИТ',
        'ops.live_hash_power': 'Хешрейт',
        'ops.kas_price': 'ЦЕНА KAS',
        'ops.settlement_silos': 'СПЛИТЫ',
        'ops.liquidity_plants': 'ПАРЫ LP',
        'ops.pool_distribution': 'БАТЧИ',
        'ops.utc_settlement': 'Выплата',
        'ops.active_buckets': 'Активные батчи',
        'ops.node_sync': 'СИНХР',
        'ops.online': 'ОНЛАЙН',
        'ops.offline': 'ОФФЛАЙН',
        'dex.swap': 'Обмен',
        'dex.liquidity': 'Пара',
        'dex.p2p': 'P2P',
        'dex.fiat': 'Фиат',
        'dex.slippage': 'Проск.',
        'dex.search_placeholder': 'Поиск токенов, акций или адресов...',
        'dex.you_pay': 'Отдаёте',
        'dex.you_receive': 'Получаете',
        'dex.available': 'Баланс',
        'dex.live_oracle_rate': 'Курс оракула',
        'dex.active_fee_tier': 'Комиссия',
        'dex.enter_swap_amount': 'Сумма',
        'dex.review_execute_swap': 'Обменять',
        'dex.supply_liquidity': 'Создать пару',
        'dex.anchor_deposit': 'База',
        'dex.paired_asset': 'Пара',
        'dex.lock_duration': 'Срок',
        'dex.silo_fee_tier': 'Уровень SILO',
        'dex.stake_silo': 'Залочить SILO',
        'dex.deploy_p2p_offer': 'Создать P2P',
        'dex.you_offer': 'Предложение',
        'dex.you_require': 'Запрос',
        'dex.open_p2p_offers': 'P2P заявки',
        'dex.fiat_bridge': 'Фиат',
        'dex.buy_with_usd': 'Купить',
        'dex.sell_for_usd': 'Продать',
        'treasury.total_vault_value': 'Общий баланс',
        'treasury.master_treasury_balance': 'Казна',
        'treasury.wallet_balance_onchain': 'В сети L1',
        'treasury.pending_settlement': 'Ожидание',
        'treasury.staked_in_lp': 'В парах LP',
        'treasury.perennia_wallet': 'Кошелёк Perennia',
        'treasury.perennia_wallet_sub': '',
        'treasury.search_chains': 'Поиск сети или токена...',
        'treasury.organize': 'Порядок',
        'treasury.done': 'Готово',
        'treasury.manage_chains': 'Сети',
        'treasury.done_chains': 'Готово',
        'treasury.receive_qr': 'Принять',
        'treasury.send_withdraw_l1': 'Отправить',
        'treasury.cold_vault': 'Сейф',
        'treasury.activity': 'История',
        'tax.title': 'Пассивный учёт HIFO и экспорт',
        'tax.configure_jurisdiction': '[ Профиль учёта ]',
        'tax.generate_pdf': 'PDF 1099-DA / 8949 ↓',
        'tax.export_csv': 'Экспорт CSV ↓',
        'tax.gross_proceeds': 'Выручка (YTD)',
        'tax.hifo_pool': 'Лоты HIFO',
        'tax.effective_rate': 'Ставка',
        'tax.tax_escrow': 'Резерв'
    },
    ZH: {
        'nav.buy': '买币',
        'nav.mine': '挖矿',
        'nav.swap': '闪兑',
        'nav.bot': 'BOT',
        'nav.wallet': '钱包',
        'nav.operations': '挖矿',
        'nav.exchange': '闪兑',
        'nav.treasury': '钱包',
        'nav.tax_fortress': '账本',
        'nav.forge': '铸造',
        'nav.director': '管理',
        'header.buy_crypto': '买币',
        'header.unlock_vault': '登录',
        'header.brand_verbs': '买币 · 挖矿 · 闪兑 · BOT',
        'header.node_online': '买币 · 挖矿 · 闪兑 · BOT',
        'header.mining_settlement': '买币 · 挖矿 · 闪兑 · BOT',
        'header.copied': '已复制 ✓',
        'modal.language': '语言',
        'modal.currency': '货币',
        'modal.close': '完成',
        'wallet.ledger_csv': '账本 / CSV ↗',
        'wallet.copy': '复制地址',
        'wallet.disconnect': '断开连接',
        'wallet.vault_backup': '金库 .JSON',
        'wallet.profile_backup': '配置 .JSON',
        'ops.master_pool_telemetry': '矿池遥测',
        'ops.verified_shares': '有效份额',
        'ops.add_worker': '+ 矿机',
        'ops.break_off_sector': '+ 分流',
        'ops.live_hash_power': '算力',
        'ops.kas_price': 'KAS 价格',
        'ops.settlement_silos': '代币分流',
        'ops.liquidity_plants': '流动性交易对',
        'ops.pool_distribution': '待结算批次',
        'ops.utc_settlement': '下次结算',
        'ops.active_buckets': '活跃批次',
        'ops.node_sync': '同步',
        'ops.online': '在线',
        'ops.offline': '离线',
        'dex.swap': '闪兑',
        'dex.liquidity': '配对',
        'dex.p2p': 'P2P',
        'dex.fiat': '法币',
        'dex.slippage': '滑点',
        'dex.search_placeholder': '搜索代币、资产或合约...',
        'dex.you_pay': '支付',
        'dex.you_receive': '获得',
        'dex.available': '余额',
        'dex.live_oracle_rate': '实时汇率',
        'dex.active_fee_tier': '费率等级',
        'dex.enter_swap_amount': '输入数量',
        'dex.review_execute_swap': '闪兑',
        'dex.supply_liquidity': '创建配对',
        'dex.anchor_deposit': '基础资产',
        'dex.paired_asset': '配对资产',
        'dex.lock_duration': '锁定期',
        'dex.silo_fee_tier': 'SILO 等级',
        'dex.stake_silo': '锁定 SILO',
        'dex.deploy_p2p_offer': '发布挂单',
        'dex.you_offer': '提供',
        'dex.you_require': '需要',
        'dex.open_p2p_offers': '公开挂单',
        'dex.fiat_bridge': '法币通道',
        'dex.buy_with_usd': '购买',
        'dex.sell_for_usd': '卖出',
        'treasury.total_vault_value': '钱包总值',
        'treasury.master_treasury_balance': '主金库',
        'treasury.wallet_balance_onchain': '链上余额',
        'treasury.pending_settlement': '待结算',
        'treasury.staked_in_lp': '交易对中',
        'treasury.perennia_wallet': 'Perennia 钱包',
        'treasury.perennia_wallet_sub': '',
        'treasury.search_chains': '搜索公链或添加代币...',
        'treasury.organize': '排序',
        'treasury.done': '完成',
        'treasury.manage_chains': '网络',
        'treasury.done_chains': '完成',
        'treasury.receive_qr': '收款',
        'treasury.send_withdraw_l1': '发送',
        'treasury.cold_vault': '金库',
        'treasury.activity': '记录',
        'tax.title': 'HIFO 账本与导出',
        'tax.configure_jurisdiction': '[ 税务设置 ]',
        'tax.generate_pdf': '1099-DA / 8949 PDF ↓',
        'tax.export_csv': '导出 CSV ↓',
        'tax.gross_proceeds': '总收益 (YTD)',
        'tax.hifo_pool': 'HIFO 成本池',
        'tax.effective_rate': '税率',
        'tax.tax_escrow': '储备'
    },
    JA: {
        'nav.buy': '購入',
        'nav.mine': '採掘',
        'nav.swap': '交換',
        'nav.bot': 'BOT',
        'nav.wallet': '資産',
        'nav.operations': '採掘',
        'nav.exchange': '交換',
        'nav.treasury': '資産',
        'nav.tax_fortress': '台帳',
        'nav.forge': 'FORGE',
        'nav.director': '管理',
        'header.buy_crypto': '購入',
        'header.unlock_vault': '接続',
        'header.brand_verbs': '購入 · 採掘 · 交換 · BOT',
        'header.node_online': '購入 · 採掘 · 交換 · BOT',
        'header.mining_settlement': '購入 · 採掘 · 交換 · BOT',
        'header.copied': 'コピー完了 ✓',
        'modal.language': '言語',
        'modal.currency': '通貨',
        'modal.close': '完了',
        'wallet.ledger_csv': '台帳 / CSV ↗',
        'wallet.copy': 'アドレスコピー',
        'wallet.disconnect': '切断',
        'wallet.vault_backup': 'ボールト .JSON',
        'wallet.profile_backup': '設定 .JSON',
        'ops.master_pool_telemetry': 'プール状況',
        'ops.verified_shares': 'シェア',
        'ops.add_worker': '+ マイナー',
        'ops.break_off_sector': '+ 分割',
        'ops.live_hash_power': 'ハッシュ',
        'ops.kas_price': 'KAS 価格',
        'ops.settlement_silos': '配分設定',
        'ops.liquidity_plants': 'LPペア',
        'ops.pool_distribution': '精算待ち',
        'ops.utc_settlement': '次回精算',
        'ops.active_buckets': '進行中バッチ',
        'ops.node_sync': '同期',
        'ops.online': '接続中',
        'ops.offline': '未接続',
        'dex.swap': '交換',
        'dex.liquidity': 'ペア',
        'dex.p2p': 'P2P',
        'dex.fiat': '法定通貨',
        'dex.slippage': '許容差',
        'dex.search_placeholder': 'トークン・銘柄・コントラクト検索...',
        'dex.you_pay': '支払',
        'dex.you_receive': '受取',
        'dex.available': '残高',
        'dex.live_oracle_rate': 'レート',
        'dex.active_fee_tier': '手数料',
        'dex.enter_swap_amount': '数量入力',
        'dex.review_execute_swap': '交換',
        'dex.supply_liquidity': 'ペア作成',
        'dex.anchor_deposit': '基準',
        'dex.paired_asset': '相手',
        'dex.lock_duration': 'ロック',
        'dex.silo_fee_tier': 'SILO ティア',
        'dex.stake_silo': 'SILO ロック',
        'dex.deploy_p2p_offer': 'P2P出品',
        'dex.you_offer': '提供',
        'dex.you_require': '希望',
        'dex.open_p2p_offers': '公開P2P',
        'dex.fiat_bridge': '法定通貨',
        'dex.buy_with_usd': '購入',
        'dex.sell_for_usd': '売却',
        'treasury.total_vault_value': '総資産額',
        'treasury.master_treasury_balance': 'トレジャリー',
        'treasury.wallet_balance_onchain': 'L1残高',
        'treasury.pending_settlement': '精算待ち',
        'treasury.staked_in_lp': 'LPペア中',
        'treasury.perennia_wallet': 'Perennia ウォレット',
        'treasury.perennia_wallet_sub': '',
        'treasury.search_chains': 'チェーン検索またはトークン追加...',
        'treasury.organize': '並替',
        'treasury.done': '完了',
        'treasury.manage_chains': 'チェーン',
        'treasury.done_chains': '完了',
        'treasury.receive_qr': '受取',
        'treasury.send_withdraw_l1': '送金',
        'treasury.cold_vault': 'ボールト',
        'treasury.activity': '履歴',
        'tax.title': 'HIFO 台帳＆エクスポート',
        'tax.configure_jurisdiction': '[ 税務設定 ]',
        'tax.generate_pdf': '1099-DA / 8949 PDF ↓',
        'tax.export_csv': 'CSV 出力 ↓',
        'tax.gross_proceeds': '総収益 (YTD)',
        'tax.hifo_pool': 'HIFO プール',
        'tax.effective_rate': '実効税率',
        'tax.tax_escrow': '準備金'
    }
} as const;

function detectBrowserLocale(): SupportedLocale {
    if (!browser) return 'EN';
    const candidates = [
        ...(Array.isArray(navigator.languages) ? navigator.languages : []),
        navigator.language || ''
    ];
    for (const raw of candidates) {
        const prefix = String(raw || '').trim().slice(0, 2).toUpperCase();
        if (SUPPORTED_LOCALES.some((l) => l.code === prefix)) {
            return prefix as SupportedLocale;
        }
    }
    return 'EN';
}

function detectDefaultCurrencyForLocale(loc: SupportedLocale): SupportedCurrency {
    switch (loc) {
        case 'DE':
            return 'EUR';
        case 'PT':
            return 'BRL';
        case 'TR':
            return 'TRY';
        case 'JA':
            return 'JPY';
        default:
            return 'USD';
    }
}

function formatScaledBigIntDecimal(
    scaledInt: bigint,
    scaleDecimals: number,
    displayDecimals: number,
    bcp47: string
): string {
    const absInt = scaledInt < 0n ? -scaledInt : scaledInt;
    const scaleFactor = 10n ** BigInt(scaleDecimals);
    const rounded =
        displayDecimals >= scaleDecimals
            ? absInt * 10n ** BigInt(displayDecimals - scaleDecimals)
            : (() => {
                  const div = 10n ** BigInt(scaleDecimals - displayDecimals);
                  const half = div / 2n;
                  return (absInt + half) / div;
              })();

    const dispScale = 10n ** BigInt(displayDecimals);
    const wholePart = rounded / dispScale;
    const fracPart = rounded % dispScale;
    const wholeFormatted = Number(wholePart <= BigInt(Number.MAX_SAFE_INTEGER) ? wholePart : 0n).toLocaleString(
        bcp47
    );
    const wholeFinal =
        wholePart > BigInt(Number.MAX_SAFE_INTEGER) ? wholePart.toString() : wholeFormatted;

    if (displayDecimals <= 0) {
        return wholeFinal;
    }
    const fracStr = fracPart.toString().padStart(displayDecimals, '0');
    return `${wholeFinal}.${fracStr}`;
}

class I18nStore {
    locale = $state<SupportedLocale>('EN');
    currency = $state<SupportedCurrency>('USD');
    fxRates = $state<Record<string, number>>({ USD: 1.0 });
    fxRatesE8 = $state<Record<string, string>>({ USD: '100000000' });
    fxUpdatedAt = $state<string>('');
    isSyncingFx = $state<boolean>(false);
    fxUnavailable = $state<boolean>(false);

    private fxInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        if (browser) {
            const explicitLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
            const explicitCurrency = localStorage.getItem(CURRENCY_STORAGE_KEY);
            const legacyRaw = localStorage.getItem('perennia_ui_settings');
            let legacyLocale: string | undefined;
            let legacyCurrency: string | undefined;
            if (legacyRaw) {
                try {
                    const parsed = JSON.parse(legacyRaw);
                    legacyLocale = parsed?.locale;
                    legacyCurrency = parsed?.currency;
                } catch {
                    // ignore
                }
            }

            const chosenLocale = explicitLocale || legacyLocale;
            if (chosenLocale && SUPPORTED_LOCALES.some((l) => l.code === chosenLocale)) {
                this.locale = chosenLocale as SupportedLocale;
            } else {
                this.locale = detectBrowserLocale();
            }

            const chosenCurrency = explicitCurrency || legacyCurrency;
            if (chosenCurrency && SUPPORTED_CURRENCIES.some((c) => c.code === chosenCurrency)) {
                this.currency = chosenCurrency as SupportedCurrency;
            } else {
                this.currency = detectDefaultCurrencyForLocale(this.locale);
            }

            document.documentElement.lang = this.activeLocaleSpec.bcp47.split('-')[0];

            const cachedFx = localStorage.getItem(FX_CACHE_STORAGE_KEY);
            if (cachedFx) {
                try {
                    const parsedFx = JSON.parse(cachedFx);
                    if (parsedFx?.rates && typeof parsedFx.rates === 'object') {
                        this.fxRates = { USD: 1.0, ...parsedFx.rates };
                        this.fxRatesE8 = {
                            USD: '100000000',
                            ...(parsedFx.ratesE8 || {})
                        };
                        this.fxUpdatedAt = parsedFx.updatedAt || '';
                    }
                } catch {
                    // Ignore malformed cached FX rates
                }
            }
            this.syncFxRates();
            this.fxInterval = setInterval(() => {
                this.syncFxRates();
            }, 15 * 60 * 1000);
        }
    }

    get activeCurrencySpec(): CurrencyOption {
        return (
            SUPPORTED_CURRENCIES.find((c) => c.code === this.currency) ||
            SUPPORTED_CURRENCIES[0]
        );
    }

    get activeLocaleSpec(): LocaleOption {
        return (
            SUPPORTED_LOCALES.find((l) => l.code === this.locale) ||
            SUPPORTED_LOCALES[0]
        );
    }

    get activeFxRate(): number {
        return this.fxRates[this.currency] || 1.0;
    }

    get activeFxRateE8(): bigint {
        const rawE8 = this.fxRatesE8[this.currency];
        if (rawE8) {
            const parsed = safeParseU128(rawE8, 0n);
            if (parsed > 0n) return parsed;
        }
        const rateNum = this.fxRates[this.currency];
        if (Number.isFinite(rateNum) && rateNum > 0) {
            return safeDecimalToAtomic(rateNum, 8, ORACLE_USD_E8_SCALE, 'floor');
        }
        return ORACLE_USD_E8_SCALE;
    }

    get currencySymbol(): string {
        return this.activeCurrencySpec.symbol;
    }

    setLocale(nextLocale: SupportedLocale) {
        if (SUPPORTED_LOCALES.some((l) => l.code === nextLocale)) {
            this.locale = nextLocale;
            if (browser) {
                localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
                document.documentElement.lang = this.activeLocaleSpec.bcp47.split('-')[0];
            }
        }
    }

    setCurrency(nextCurrency: SupportedCurrency) {
        if (SUPPORTED_CURRENCIES.some((c) => c.code === nextCurrency)) {
            this.currency = nextCurrency;
            if (browser) {
                localStorage.setItem(CURRENCY_STORAGE_KEY, nextCurrency);
            }
        }
    }

    async syncFxRates(force = false): Promise<void> {
        if (!browser || this.isSyncingFx) return;
        this.isSyncingFx = true;
        try {
            const res = await fetch(
                `/api/prices/fx${force ? '?refresh=true' : ''}`
            );
            if (res.ok) {
                const data = await res.json();
                if (data?.rates && typeof data.rates === 'object') {
                    this.fxRates = { USD: 1.0, ...data.rates };
                    const nextE8: Record<string, string> = { USD: '100000000' };
                    for (const [k, v] of Object.entries(this.fxRates)) {
                        const rawE8 = data?.ratesE8?.[k];
                        nextE8[k] = rawE8
                            ? String(rawE8)
                            : safeDecimalToAtomic(v, 8, ORACLE_USD_E8_SCALE, 'floor').toString();
                    }
                    this.fxRatesE8 = nextE8;
                    this.fxUpdatedAt = data.updatedAt || new Date().toISOString();
                    this.fxUnavailable = false;
                    localStorage.setItem(
                        FX_CACHE_STORAGE_KEY,
                        JSON.stringify({
                            rates: this.fxRates,
                            ratesE8: this.fxRatesE8,
                            updatedAt: this.fxUpdatedAt
                        })
                    );
                }
            } else {
                this.fxUnavailable = this.currency !== 'USD' && !this.fxRates[this.currency];
            }
        } catch {
            this.fxUnavailable = this.currency !== 'USD' && !this.fxRates[this.currency];
        } finally {
            this.isSyncingFx = false;
        }
    }

    t(key: TranslationKey | string, vars?: Record<string, string | number>): string {
        const dict = TRANSLATIONS[this.locale] || TRANSLATIONS.EN;
        let phrase =
            (dict as Record<string, string>)[key] ||
            (TRANSLATIONS.EN as Record<string, string>)[key] ||
            key;
        if (vars) {
            for (const [k, v] of Object.entries(vars)) {
                phrase = phrase.replaceAll(`{${k}}`, String(v));
            }
        }
        return phrase;
    }

    convertUsd(usdAmount: number): number {
        const cleanUsd = safeFiniteNumber(usdAmount, 0);
        const rate = this.fxRates[this.currency] || 1.0;
        return cleanUsd * rate;
    }

    /**
     * Converts a user-entered amount in the active display currency into integer USD micros (`1e6`) using `BigInt` E8 FX rates.
     */
    currencyUnitToUsdMicros(localAmountStr: string | number): bigint {
        const localMicros = safeDecimalToAtomic(localAmountStr, 6, 0n, 'floor');
        if (localMicros <= 0n) return 0n;
        if (this.currency === 'USD') return localMicros;
        const rateE8 = this.activeFxRateE8;
        if (rateE8 <= 0n) return 0n;
        return (localMicros * ORACLE_USD_E8_SCALE) / rateE8;
    }

    /**
     * Formats integer USD micros (`1e6`) in the active currency via `BigInt` FX E8 math.
     */
    formatFiatFromUsdMicros(
        usdMicrosInput: bigint | string,
        options?: { decimals?: number; includeCode?: boolean; negative?: boolean }
    ): string {
        const usdMicros =
            typeof usdMicrosInput === 'bigint'
                ? usdMicrosInput
                : safeParseU128(usdMicrosInput, 0n);
        const spec = this.activeCurrencySpec;
        const decimals =
            options?.decimals !== undefined ? options.decimals : spec.defaultDecimals;
        const fxE8 = this.activeFxRateE8;
        // Scale: usdMicros (1e6) * fxE8 (1e8) => 1e14
        const scaled14 = usdMicros * fxE8;
        const formattedNumber = formatScaledBigIntDecimal(
            scaled14,
            14,
            decimals,
            this.activeLocaleSpec.bcp47
        );
        const sign = options?.negative ? '-' : '';
        const suffix = options?.includeCode ? ` ${spec.code}` : '';
        return `${sign}${spec.symbol}${formattedNumber}${suffix}`;
    }

    /**
     * Formats an E8 USD price/value (`1e8`) in the active currency via `BigInt` FX E8 math.
     */
    formatFiatFromUsdE8(
        usdE8Input: bigint | string,
        options?: { decimals?: number; includeCode?: boolean; negative?: boolean }
    ): string {
        const usdE8 =
            typeof usdE8Input === 'bigint'
                ? usdE8Input
                : safeParseU128(usdE8Input, 0n);
        const usdMicros = usdE8 / 100n;
        return this.formatFiatFromUsdMicros(usdMicros, options);
    }

    formatFiat(
        usdAmount: number,
        options?: {
            decimals?: number;
            includeCode?: boolean;
            adaptiveSmallPrice?: boolean;
        }
    ): string {
        const cleanUsd = safeFiniteNumber(usdAmount, 0);
        const isNegative = cleanUsd < 0;
        const absUsd = Math.abs(cleanUsd);
        const spec = this.activeCurrencySpec;

        if (options?.adaptiveSmallPrice) {
            const convertedAbs = absUsd * this.activeFxRate;
            if (convertedAbs > 0 && convertedAbs < 1) {
                return this.formatSpotPrice(cleanUsd, options.includeCode);
            }
        }

        const decimals =
            options?.decimals !== undefined ? options.decimals : spec.defaultDecimals;
        const usdMicros = safeDecimalToAtomic(absUsd.toFixed(6), 6, 0n, 'floor');
        return this.formatFiatFromUsdMicros(usdMicros, {
            decimals,
            includeCode: options?.includeCode,
            negative: isNegative
        });
    }

    /**
     * Formats a token / KAS spot price with 4-significant-digit precision in the active currency.
     */
    formatSpotPrice(usdSpot: number, includeCode = false): string {
        const cleanUsd = safeFiniteNumber(usdSpot, 0);
        const spec = this.activeCurrencySpec;
        const suffix = includeCode ? ` ${spec.code}` : '';
        if (cleanUsd <= 0) {
            return `${spec.symbol}0${spec.defaultDecimals > 0 ? '.0000' : ''}${suffix}`;
        }
        const converted = cleanUsd * this.activeFxRate;
        if (!Number.isFinite(converted) || converted <= 0) {
            return `${spec.symbol}0${suffix}`;
        }
        const absVal = Math.abs(converted);
        let formatted: string;
        if (absVal >= 1000) {
            formatted = absVal.toLocaleString(this.activeLocaleSpec.bcp47, {
                maximumSignificantDigits: 4,
                minimumSignificantDigits: 4
            });
        } else {
            formatted = Number(absVal.toPrecision(4)).toLocaleString(
                this.activeLocaleSpec.bcp47,
                {
                    minimumSignificantDigits: 4,
                    maximumSignificantDigits: 4
                }
            );
        }
        return `${converted < 0 ? '-' : ''}${spec.symbol}${formatted}${suffix}`;
    }

    formatSpotPriceFromE8(usdE8Input: bigint | string, includeCode = false): string {
        const usdE8 =
            typeof usdE8Input === 'bigint'
                ? usdE8Input
                : safeParseU128(usdE8Input, 0n);
        const spec = this.activeCurrencySpec;
        const suffix = includeCode ? ` ${spec.code}` : '';
        if (usdE8 <= 0n) {
            return `${spec.symbol}0${spec.defaultDecimals > 0 ? '.0000' : ''}${suffix}`;
        }
        const fxE8 = this.activeFxRateE8;
        // Scale 1e16 -> integer whole + 8 fractional digits for display formatting
        const scaled16 = usdE8 * fxE8;
        const whole = scaled16 / (ORACLE_USD_E8_SCALE * ORACLE_USD_E8_SCALE);
        const rem8 =
            (scaled16 % (ORACLE_USD_E8_SCALE * ORACLE_USD_E8_SCALE)) / ORACLE_USD_E8_SCALE;
        const numericDisplay = Number(`${whole.toString()}.${rem8.toString().padStart(8, '0')}`);
        if (!Number.isFinite(numericDisplay) || numericDisplay <= 0) {
            return `${spec.symbol}0${suffix}`;
        }
        const formatted = numericDisplay.toLocaleString(this.activeLocaleSpec.bcp47, {
            minimumSignificantDigits: 4,
            maximumSignificantDigits: 4
        });
        return `${spec.symbol}${formatted}${suffix}`;
    }
}

export const i18n = new I18nStore();

export function t(
    key: TranslationKey | string,
    vars?: Record<string, string | number>
): string {
    return i18n.t(key, vars);
}

export function formatFiat(
    usdAmount: number,
    options?: {
        decimals?: number;
        includeCode?: boolean;
        adaptiveSmallPrice?: boolean;
    }
): string {
    return i18n.formatFiat(usdAmount, options);
}

export { USD_MICROS_SCALE };
