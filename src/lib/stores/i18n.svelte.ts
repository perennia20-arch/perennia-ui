// WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\stores\i18n.svelte.ts
import { browser } from '$app/environment';

export type SupportedLocale =
    | 'EN'
    | 'ES'
    | 'DE'
    | 'FR'
    | 'PT'
    | 'ZH'
    | 'JA'
    | 'KO';

export type SupportedCurrency =
    | 'USD'
    | 'EUR'
    | 'GBP'
    | 'CAD'
    | 'AUD'
    | 'CHF'
    | 'JPY'
    | 'MXN'
    | 'BRL';

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
    { code: 'EN', label: 'English', nativeName: 'English', bcp47: 'en-US' },
    { code: 'ES', label: 'Spanish', nativeName: 'Español', bcp47: 'es-ES' },
    { code: 'DE', label: 'German', nativeName: 'Deutsch', bcp47: 'de-DE' },
    { code: 'FR', label: 'French', nativeName: 'Français', bcp47: 'fr-FR' },
    { code: 'PT', label: 'Portuguese', nativeName: 'Português', bcp47: 'pt-BR' },
    { code: 'ZH', label: 'Chinese', nativeName: '中文', bcp47: 'zh-CN' },
    { code: 'JA', label: 'Japanese', nativeName: '日本語', bcp47: 'ja-JP' },
    { code: 'KO', label: 'Korean', nativeName: '한국어', bcp47: 'ko-KR' }
] as const;

export const SUPPORTED_CURRENCIES: readonly CurrencyOption[] = [
    { code: 'USD', symbol: '$', name: 'US Dollar', defaultDecimals: 2 },
    { code: 'EUR', symbol: '€', name: 'Euro', defaultDecimals: 2 },
    { code: 'GBP', symbol: '£', name: 'British Pound', defaultDecimals: 2 },
    { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', defaultDecimals: 2 },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', defaultDecimals: 2 },
    { code: 'CHF', symbol: 'CHF ', name: 'Swiss Franc', defaultDecimals: 2 },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen', defaultDecimals: 0 },
    { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', defaultDecimals: 2 },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', defaultDecimals: 2 }
] as const;

const DEFAULT_FX_RATES: Record<SupportedCurrency, number> = {
    USD: 1.0,
    EUR: 0.924,
    GBP: 0.788,
    CAD: 1.389,
    AUD: 1.524,
    CHF: 0.882,
    JPY: 153.45,
    MXN: 20.12,
    BRL: 5.76
};

export type TranslationKey = keyof typeof TRANSLATIONS.EN;

const TRANSLATIONS = {
    EN: {
        // Header & Navigation
        'nav.operations': 'OPERATIONS',
        'nav.exchange': 'EXCHANGE',
        'nav.treasury': 'TREASURY',
        'nav.tax_fortress': 'TAX FORTRESS',
        'nav.forge': 'FORGE',
        'nav.director': 'DIRECTOR',
        'header.buy_crypto': 'Buy Crypto',
        'header.unlock_vault': 'Unlock Vault',
        'header.node_online': 'DAG NODE ONLINE',
        'header.mining_settlement': 'MINING & SETTLEMENT',
        'header.copied': 'COPIED ✓',

        // Operations
        'ops.master_pool_telemetry': 'Master Pool Telemetry',
        'ops.verified_shares': 'Verified Shares',
        'ops.add_worker': '+ Add Worker',
        'ops.break_off_sector': '+ Break Off Sector',
        'ops.live_hash_power': 'Live Hash Power',
        'ops.kas_price': 'KAS / USD Price',
        'ops.settlement_silos': 'Settlement Silos',
        'ops.liquidity_plants': 'Liquidity Plants',
        'ops.pool_distribution': 'Pool Distribution',
        'ops.utc_settlement': '22:00 UTC Settlement',
        'ops.active_buckets': 'Your Active Buckets',
        'ops.node_sync': 'NODE SYNC',
        'ops.online': 'ONLINE',
        'ops.offline': 'OFFLINE',

        // Exchange (DEX)
        'dex.swap': 'Swap',
        'dex.liquidity': 'Liquidity',
        'dex.p2p': 'P2P',
        'dex.fiat': 'Fiat',
        'dex.slippage': 'Slippage',
        'dex.search_placeholder': 'Search tokens, equities, or contracts...',
        'dex.you_pay': 'You Pay',
        'dex.you_receive': 'You Receive (Est.)',
        'dex.available': 'Available',
        'dex.live_oracle_rate': 'Live Oracle Rate',
        'dex.active_fee_tier': 'Active Fee Tier',
        'dex.enter_swap_amount': 'Enter Swap Amount',
        'dex.review_execute_swap': 'Review & Execute Swap',
        'dex.supply_liquidity': 'Supply Liquidity',
        'dex.anchor_deposit': 'Anchor Deposit',
        'dex.paired_asset': 'Paired Asset',
        'dex.lock_duration': 'Lock Duration',
        'dex.silo_fee_tier': 'SILO Fee Tier',
        'dex.stake_silo': 'Stake SILO',
        'dex.deploy_p2p_offer': 'Deploy P2P Offer',
        'dex.you_offer': 'You Offer',
        'dex.you_require': 'You Require',
        'dex.open_p2p_offers': 'Open P2P Offers',
        'dex.fiat_bridge': 'Fiat Bridge',
        'dex.buy_with_usd': 'Buy with USD',
        'dex.sell_for_usd': 'Sell for USD',

        // Treasury Vault
        'treasury.total_vault_value': 'Total Vault Value',
        'treasury.master_treasury_balance': 'Master Treasury Balance',
        'treasury.wallet_balance_onchain': 'Wallet Balance (On-Chain)',
        'treasury.pending_settlement': 'Pending Settlement',
        'treasury.staked_in_lp': 'Staked in Liquidity Pools',
        'treasury.perennia_wallet': 'Perennia Wallet',
        'treasury.perennia_wallet_sub': 'Manage networks, token balances, and cold storage rules',
        'treasury.search_chains': 'Search chains or add token (USDC, PEPE, ONDO)...',
        'treasury.organize': 'Organize',
        'treasury.done': 'Done',
        'treasury.manage_chains': 'Manage Chains',
        'treasury.done_chains': 'Done Chains',
        'treasury.receive_qr': 'Receive QR',
        'treasury.send_withdraw_l1': 'Send / Withdraw L1',
        'treasury.cold_vault': 'Cold Vault',
        'treasury.activity': 'Activity',

        // Tax Fortress
        'tax.title': 'Zero-PII Tax Fortress & Passive HIFO Cost-Basis Engine',
        'tax.configure_jurisdiction': '[ Configure Jurisdiction & Profile ]',
        'tax.generate_pdf': 'Generate 1099-DA / 8949 PDF ↓',
        'tax.export_csv': 'Export HIFO CSV ↓',
        'tax.gross_proceeds': 'Gross Taxable Proceeds (YTD)',
        'tax.hifo_pool': 'Passive HIFO Cost-Basis Pool',
        'tax.effective_rate': 'Effective Tax Rate',
        'tax.tax_escrow': 'Tax Escrow',

        // Settings Modal
        'settings.title': 'System Parameters & Guide',
        'settings.subtitle': 'Language, Currency, Theme, Precision & Vault Backup',
        'settings.guide_title': 'Interactive Platform Guide & Tour',
        'settings.guide_desc': 'Need a refresher on any station? Launch the interactive sandbox walkthrough or jump directly to any chapter below at any time.',
        'settings.start_tour': 'Start Full Interactive Tour →',
        'settings.open_chapter_menu': 'Open Chapter Menu',
        'settings.language_label': 'Display Language',
        'settings.language_sub': 'Translate navigation, trading cards, and treasury labels.',
        'settings.currency_label': 'Display Currency (Live FX)',
        'settings.currency_sub': 'Convert USD valuations using live foreign exchange rates.',
        'settings.theme_label': 'Base Theme Mode',
        'settings.theme_sub': 'Toggle between Calibrated Industrial Dark and Warm Light.',
        'settings.dark': 'Dark',
        'settings.light': 'Light',
        'settings.warmth_label': 'Surface Tone / Warmth',
        'settings.fiat_decimals': 'Fiat Precision (Decimals)',
        'settings.token_decimals': 'Token Precision (Decimals)',
        'settings.backup_title': 'Encrypted Vault Backup (.json)',
        'settings.backup_desc': 'Export or restore your password-encrypted Sovereign Vault file. Your raw 24-word seed phrase is never displayed after initial vault creation.',
        'settings.export_json': 'Export Encrypted .JSON',
        'settings.import_json': 'Import Encrypted .JSON',
        'settings.reset_defaults': 'Reset Defaults',
        'settings.apply_close': 'Apply & Close'
    },
    ES: {
        'nav.operations': 'OPERACIONES',
        'nav.exchange': 'INTERCAMBIO',
        'nav.treasury': 'TESORERÍA',
        'nav.tax_fortress': 'FORTALEZA FISCAL',
        'nav.forge': 'FORJA',
        'nav.director': 'DIRECTOR',
        'header.buy_crypto': 'Comprar Cripto',
        'header.unlock_vault': 'Desbloquear Bóveda',
        'header.node_online': 'NODO DAG EN LÍNEA',
        'header.mining_settlement': 'MINERÍA Y LIQUIDACIÓN',
        'header.copied': 'COPIADO ✓',

        'ops.master_pool_telemetry': 'Telemetría del Pool Maestro',
        'ops.verified_shares': 'Shares Verificados',
        'ops.add_worker': '+ Añadir Worker',
        'ops.break_off_sector': '+ Crear Sector',
        'ops.live_hash_power': 'Potencia de Hash en Vivo',
        'ops.kas_price': 'Precio KAS / USD',
        'ops.settlement_silos': 'Silos de Liquidación',
        'ops.liquidity_plants': 'Plantas de Liquidez',
        'ops.pool_distribution': 'Distribución del Pool',
        'ops.utc_settlement': 'Liquidación 22:00 UTC',
        'ops.active_buckets': 'Tus Buckets Activos',
        'ops.node_sync': 'SINCRONIZACIÓN',
        'ops.online': 'EN LÍNEA',
        'ops.offline': 'DESCONECTADO',

        'dex.swap': 'Intercambio',
        'dex.liquidity': 'Liquidez',
        'dex.p2p': 'P2P',
        'dex.fiat': 'Fiat',
        'dex.slippage': 'Deslizamiento',
        'dex.search_placeholder': 'Buscar tokens, acciones o contratos...',
        'dex.you_pay': 'Tú Pagas',
        'dex.you_receive': 'Tú Recibes (Est.)',
        'dex.available': 'Disponible',
        'dex.live_oracle_rate': 'Tasa del Oráculo en Vivo',
        'dex.active_fee_tier': 'Nivel de Comisión Activo',
        'dex.enter_swap_amount': 'Ingresa Monto de Intercambio',
        'dex.review_execute_swap': 'Revisar y Ejecutar Intercambio',
        'dex.supply_liquidity': 'Aportar Liquidez',
        'dex.anchor_deposit': 'Depósito Ancla',
        'dex.paired_asset': 'Activo Emparejado',
        'dex.lock_duration': 'Duración de Bloqueo',
        'dex.silo_fee_tier': 'Nivel de Comisión SILO',
        'dex.stake_silo': 'Stakear SILO',
        'dex.deploy_p2p_offer': 'Publicar Oferta P2P',
        'dex.you_offer': 'Tú Ofreces',
        'dex.you_require': 'Tú Solicitas',
        'dex.open_p2p_offers': 'Ofertas P2P Abiertas',
        'dex.fiat_bridge': 'Puente Fiat',
        'dex.buy_with_usd': 'Comprar con USD',
        'dex.sell_for_usd': 'Vender por USD',

        'treasury.total_vault_value': 'Valor Total de la Bóveda',
        'treasury.master_treasury_balance': 'Balance de Tesorería Maestra',
        'treasury.wallet_balance_onchain': 'Balance en Billetera (On-Chain)',
        'treasury.pending_settlement': 'Liquidación Pendiente',
        'treasury.staked_in_lp': 'En Pools de Liquidez',
        'treasury.perennia_wallet': 'Billetera Perennia',
        'treasury.perennia_wallet_sub': 'Gestiona redes, saldos de tokens y reglas de bóveda fría',
        'treasury.search_chains': 'Buscar cadenas o añadir token (USDC, PEPE, ONDO)...',
        'treasury.organize': 'Organizar',
        'treasury.done': 'Listo',
        'treasury.manage_chains': 'Gestionar Cadenas',
        'treasury.done_chains': 'Listo',
        'treasury.receive_qr': 'Recibir QR',
        'treasury.send_withdraw_l1': 'Enviar / Retirar L1',
        'treasury.cold_vault': 'Bóveda Fría',
        'treasury.activity': 'Actividad',

        'tax.title': 'Fortaleza Fiscal Zero-PII y Motor de Costo Base HIFO',
        'tax.configure_jurisdiction': '[ Configurar Jurisdicción y Perfil ]',
        'tax.generate_pdf': 'Generar PDF 1099-DA / 8949 ↓',
        'tax.export_csv': 'Exportar CSV HIFO ↓',
        'tax.gross_proceeds': 'Ingresos Brutos Imponibles (YTD)',
        'tax.hifo_pool': 'Pool de Costo Base HIFO Pasivo',
        'tax.effective_rate': 'Tasa Impositiva Efectiva',
        'tax.tax_escrow': 'Reserva Fiscal en Custodia',

        'settings.title': 'Parámetros del Sistema y Guía',
        'settings.subtitle': 'Idioma, Moneda, Tema, Precisión y Respaldo de Bóveda',
        'settings.guide_title': 'Guía Interactiva y Recorrido de la Plataforma',
        'settings.guide_desc': '¿Necesitas un repaso? Inicia el recorrido interactivo paso a paso o salta directamente a cualquier capítulo.',
        'settings.start_tour': 'Iniciar Recorrido Interactivo →',
        'settings.open_chapter_menu': 'Abrir Menú de Capítulos',
        'settings.language_label': 'Idioma de la Interfaz',
        'settings.language_sub': 'Traduce la navegación, tarjetas de trading y etiquetas de tesorería.',
        'settings.currency_label': 'Moneda de Visualización (FX en Vivo)',
        'settings.currency_sub': 'Convierte valoraciones en USD con tasas de cambio en tiempo real.',
        'settings.theme_label': 'Modo de Tema Base',
        'settings.theme_sub': 'Alterna entre Modo Oscuro Industrial y Modo Claro Cálido.',
        'settings.dark': 'Oscuro',
        'settings.light': 'Claro',
        'settings.warmth_label': 'Tono / Calidez de Superficie',
        'settings.fiat_decimals': 'Precisión Fiat (Decimales)',
        'settings.token_decimals': 'Precisión de Tokens (Decimales)',
        'settings.backup_title': 'Respaldo de Bóveda Cifrada (.json)',
        'settings.backup_desc': 'Exporta o restaura tu archivo de Bóveda Soberana cifrado con contraseña. Tu frase semilla de 24 palabras nunca se expone.',
        'settings.export_json': 'Exportar .JSON Cifrado',
        'settings.import_json': 'Importar .JSON Cifrado',
        'settings.reset_defaults': 'Restaurar Valores',
        'settings.apply_close': 'Aplicar y Cerrar'
    },
    DE: {
        'nav.operations': 'BETRIEB',
        'nav.exchange': 'BÖRSE',
        'nav.treasury': 'TREASURY',
        'nav.tax_fortress': 'STEUER-TRESOR',
        'nav.forge': 'SCHMIEDE',
        'nav.director': 'DIREKTOR',
        'header.buy_crypto': 'Krypto Kaufen',
        'header.unlock_vault': 'Tresor Entsperren',
        'header.node_online': 'DAG-KNOTEN ONLINE',
        'header.mining_settlement': 'MINING & ABRECHNUNG',
        'header.copied': 'KOPIERT ✓',

        'ops.master_pool_telemetry': 'Master-Pool-Telemetrie',
        'ops.verified_shares': 'Verifizierte Shares',
        'ops.add_worker': '+ Worker Hinzufügen',
        'ops.break_off_sector': '+ Sektor Abspalten',
        'ops.live_hash_power': 'Live-Hashrate',
        'ops.kas_price': 'KAS / USD Preis',
        'ops.settlement_silos': 'Abrechnungs-Silos',
        'ops.liquidity_plants': 'Liquiditäts-Anlagen',
        'ops.pool_distribution': 'Pool-Verteilung',
        'ops.utc_settlement': '22:00 UTC Abrechnung',
        'ops.active_buckets': 'Deine Aktiven Buckets',
        'ops.node_sync': 'NODE-SYNC',
        'ops.online': 'ONLINE',
        'ops.offline': 'OFFLINE',

        'dex.swap': 'Tausch',
        'dex.liquidity': 'Liquidität',
        'dex.p2p': 'P2P',
        'dex.fiat': 'Fiat',
        'dex.slippage': 'Slippage',
        'dex.search_placeholder': 'Tokens, Aktien oder Kontrakte suchen...',
        'dex.you_pay': 'Du Zahlst',
        'dex.you_receive': 'Du Erhältst (Est.)',
        'dex.available': 'Verfügbar',
        'dex.live_oracle_rate': 'Live-Orakel-Kurs',
        'dex.active_fee_tier': 'Aktive Gebührenstufe',
        'dex.enter_swap_amount': 'Tauschbetrag Eingeben',
        'dex.review_execute_swap': 'Tausch Prüfen & Ausführen',
        'dex.supply_liquidity': 'Liquidität Bereitstellen',
        'dex.anchor_deposit': 'Anker-Einlage',
        'dex.paired_asset': 'Gepaartes Asset',
        'dex.lock_duration': 'Sperrdauer',
        'dex.silo_fee_tier': 'SILO-Gebührenstufe',
        'dex.stake_silo': 'SILO Staken',
        'dex.deploy_p2p_offer': 'P2P-Angebot Erstellen',
        'dex.you_offer': 'Du Bietest',
        'dex.you_require': 'Du Verlangst',
        'dex.open_p2p_offers': 'Offene P2P-Angebote',
        'dex.fiat_bridge': 'Fiat-Brücke',
        'dex.buy_with_usd': 'Mit USD Kaufen',
        'dex.sell_for_usd': 'Für USD Verkaufen',

        'treasury.total_vault_value': 'Gesamtwert des Tresors',
        'treasury.master_treasury_balance': 'Master-Treasury-Guthaben',
        'treasury.wallet_balance_onchain': 'Wallet-Guthaben (On-Chain)',
        'treasury.pending_settlement': 'Ausstehende Abrechnung',
        'treasury.staked_in_lp': 'In Liquiditätspools Gestaked',
        'treasury.perennia_wallet': 'Perennia Wallet',
        'treasury.perennia_wallet_sub': 'Netzwerke, Token-Salden und Cold-Storage-Regeln verwalten',
        'treasury.search_chains': 'Chains suchen oder Token hinzufügen (USDC, PEPE, ONDO)...',
        'treasury.organize': 'Sortieren',
        'treasury.done': 'Fertig',
        'treasury.manage_chains': 'Chains Verwalten',
        'treasury.done_chains': 'Fertig',
        'treasury.receive_qr': 'QR Empfangen',
        'treasury.send_withdraw_l1': 'L1 Senden / Abheben',
        'treasury.cold_vault': 'Cold Vault',
        'treasury.activity': 'Aktivität',

        'tax.title': 'Zero-PII Steuer-Tresor & Passive HIFO-Kostenbasis',
        'tax.configure_jurisdiction': '[ Steuerprofil Konfigurieren ]',
        'tax.generate_pdf': '1099-DA / 8949 PDF Erstellen ↓',
        'tax.export_csv': 'HIFO CSV Exportieren ↓',
        'tax.gross_proceeds': 'Steuerpflichtige Bruttoerlöse (YTD)',
        'tax.hifo_pool': 'Passiver HIFO-Kostenbasis-Pool',
        'tax.effective_rate': 'Effektiver Steuersatz',
        'tax.tax_escrow': 'Steuer-Treuhandreserve',

        'settings.title': 'Systemparameter & Handbuch',
        'settings.subtitle': 'Sprache, Währung, Design, Präzision & Tresor-Backup',
        'settings.guide_title': 'Interaktiver Plattform-Guide & Tour',
        'settings.guide_desc': 'Starte jederzeit die interaktive Schritt-für-Schritt-Tour oder wähle direkt ein Kapitel aus.',
        'settings.start_tour': 'Vollständige Tour Starten →',
        'settings.open_chapter_menu': 'Kapitelmenü Öffnen',
        'settings.language_label': 'Anzeigesprache',
        'settings.language_sub': 'Navigation, Handelskarten und Treasury-Beschriftungen übersetzen.',
        'settings.currency_label': 'Anzeigewährung (Live-FX)',
        'settings.currency_sub': 'USD-Werte mit aktuellen Wechselkursen umrechnen.',
        'settings.theme_label': 'Basis-Designmodus',
        'settings.theme_sub': 'Zwischen Industrial Dark und Warm Light wechseln.',
        'settings.dark': 'Dunkel',
        'settings.light': 'Hell',
        'settings.warmth_label': 'Oberflächenton / Wärme',
        'settings.fiat_decimals': 'Fiat-Präzision (Dezimalstellen)',
        'settings.token_decimals': 'Token-Präzision (Dezimalstellen)',
        'settings.backup_title': 'Verschlüsseltes Tresor-Backup (.json)',
        'settings.backup_desc': 'Exportiere oder importiere deine passwortverschlüsselte Tresor-Datei. Deine 24-Wort-Seed-Phrase wird niemals im Klartext angezeigt.',
        'settings.export_json': 'Verschlüsseltes .JSON Exportieren',
        'settings.import_json': 'Verschlüsseltes .JSON Importieren',
        'settings.reset_defaults': 'Standardwerte',
        'settings.apply_close': 'Übernehmen & Schließen'
    },
    FR: {
        'nav.operations': 'OPÉRATIONS',
        'nav.exchange': 'ÉCHANGE',
        'nav.treasury': 'TRÉSORERIE',
        'nav.tax_fortress': 'FISCALITÉ',
        'nav.forge': 'FORGE',
        'nav.director': 'DIRECTEUR',
        'header.buy_crypto': 'Acheter Crypto',
        'header.unlock_vault': 'Déverrouiller Coffre',
        'header.node_online': 'NŒUD DAG EN LIGNE',
        'header.mining_settlement': 'MINAGE & RÈGLEMENT',
        'header.copied': 'COPIÉ ✓',

        'ops.master_pool_telemetry': 'Télémétrie du Pool Principal',
        'ops.verified_shares': 'Shares Vérifiés',
        'ops.add_worker': '+ Ajouter Worker',
        'ops.break_off_sector': '+ Créer Secteur',
        'ops.live_hash_power': 'Puissance de Hash en Direct',
        'ops.kas_price': 'Prix KAS / USD',
        'ops.settlement_silos': 'Silos de Règlement',
        'ops.liquidity_plants': 'Usines de Liquidité',
        'ops.pool_distribution': 'Distribution du Pool',
        'ops.utc_settlement': 'Règlement 22:00 UTC',
        'ops.active_buckets': 'Vos Buckets Actifs',
        'ops.node_sync': 'SYNC NŒUD',
        'ops.online': 'EN LIGNE',
        'ops.offline': 'HORS LIGNE',

        'dex.swap': 'Échange',
        'dex.liquidity': 'Liquidité',
        'dex.p2p': 'P2P',
        'dex.fiat': 'Fiat',
        'dex.slippage': 'Glissement',
        'dex.search_placeholder': 'Rechercher jetons, actions ou contrats...',
        'dex.you_pay': 'Vous Payez',
        'dex.you_receive': 'Vous Recevez (Est.)',
        'dex.available': 'Disponible',
        'dex.live_oracle_rate': 'Taux Oracle en Direct',
        'dex.active_fee_tier': 'Palier de Frais Actif',
        'dex.enter_swap_amount': 'Entrer le Montant',
        'dex.review_execute_swap': 'Vérifier et Exécuter',
        'dex.supply_liquidity': 'Fournir de la Liquidité',
        'dex.anchor_deposit': 'Dépôt Ancre',
        'dex.paired_asset': 'Actif Associé',
        'dex.lock_duration': 'Durée de Verrouillage',
        'dex.silo_fee_tier': 'Palier de Frais SILO',
        'dex.stake_silo': 'Staker SILO',
        'dex.deploy_p2p_offer': 'Créer une Offre P2P',
        'dex.you_offer': 'Vous Offrez',
        'dex.you_require': 'Vous Demandez',
        'dex.open_p2p_offers': 'Offres P2P Ouvertes',
        'dex.fiat_bridge': 'Pont Fiat',
        'dex.buy_with_usd': 'Acheter avec USD',
        'dex.sell_for_usd': 'Vendre pour USD',

        'treasury.total_vault_value': 'Valeur Totale du Coffre',
        'treasury.master_treasury_balance': 'Solde Trésorerie Principale',
        'treasury.wallet_balance_onchain': 'Solde Portefeuille (On-Chain)',
        'treasury.pending_settlement': 'Règlement en Attente',
        'treasury.staked_in_lp': 'Staké en Pools de Liquidité',
        'treasury.perennia_wallet': 'Portefeuille Perennia',
        'treasury.perennia_wallet_sub': 'Gérer les réseaux, soldes de jetons et règles de coffre froid',
        'treasury.search_chains': 'Rechercher chaînes ou ajouter jeton (USDC, PEPE, ONDO)...',
        'treasury.organize': 'Organiser',
        'treasury.done': 'Terminé',
        'treasury.manage_chains': 'Gérer Chaînes',
        'treasury.done_chains': 'Terminé',
        'treasury.receive_qr': 'Recevoir QR',
        'treasury.send_withdraw_l1': 'Envoyer / Retirer L1',
        'treasury.cold_vault': 'Coffre Froid',
        'treasury.activity': 'Activité',

        'tax.title': 'Forteresse Fiscale Zero-PII & Moteur HIFO Passif',
        'tax.configure_jurisdiction': '[ Configurer Juridiction & Profil ]',
        'tax.generate_pdf': 'Générer PDF 1099-DA / 8949 ↓',
        'tax.export_csv': 'Exporter CSV HIFO ↓',
        'tax.gross_proceeds': 'Produits Bruts Imposables (YTD)',
        'tax.hifo_pool': 'Pool de Coût de Base HIFO',
        'tax.effective_rate': 'Taux d’Imposition Effectif',
        'tax.tax_escrow': 'Séquestre Fiscal',

        'settings.title': 'Paramètres Système & Guide',
        'settings.subtitle': 'Langue, Devise, Thème, Précision & Sauvegarde du Coffre',
        'settings.guide_title': 'Guide Interactif & Visite de la Plateforme',
        'settings.guide_desc': 'Lancez la visite interactive étape par étape ou accédez directement à n’importe quel chapitre.',
        'settings.start_tour': 'Démarrer la Visite Interactive →',
        'settings.open_chapter_menu': 'Menu des Chapitres',
        'settings.language_label': 'Langue d’Affichage',
        'settings.language_sub': 'Traduire la navigation, les cartes d’échange et la trésorerie.',
        'settings.currency_label': 'Devise d’Affichage (FX en Direct)',
        'settings.currency_sub': 'Convertir les montants USD avec les taux de change en direct.',
        'settings.theme_label': 'Mode de Thème',
        'settings.theme_sub': 'Basculer entre le mode Sombre Industriel et Clair Chaud.',
        'settings.dark': 'Sombre',
        'settings.light': 'Clair',
        'settings.warmth_label': 'Teinte / Chaleur de Surface',
        'settings.fiat_decimals': 'Précision Fiat (Décimales)',
        'settings.token_decimals': 'Précision Jetons (Décimales)',
        'settings.backup_title': 'Sauvegarde Chiffrée du Coffre (.json)',
        'settings.backup_desc': 'Exportez ou restaurez votre fichier de coffre chiffré par mot de passe.',
        'settings.export_json': 'Exporter .JSON Chiffré',
        'settings.import_json': 'Importer .JSON Chiffré',
        'settings.reset_defaults': 'Réinitialiser',
        'settings.apply_close': 'Appliquer & Fermer'
    },
    PT: {
        'nav.operations': 'OPERAÇÕES',
        'nav.exchange': 'CÂMBIO',
        'nav.treasury': 'TESOURARIA',
        'nav.tax_fortress': 'FORTALEZA FISCAL',
        'nav.forge': 'FORJA',
        'nav.director': 'DIRETOR',
        'header.buy_crypto': 'Comprar Cripto',
        'header.unlock_vault': 'Desbloquear Cofre',
        'header.node_online': 'NÓ DAG ONLINE',
        'header.mining_settlement': 'MINERAÇÃO E LIQUIDAÇÃO',
        'header.copied': 'COPIADO ✓',

        'ops.master_pool_telemetry': 'Telemetria do Pool Principal',
        'ops.verified_shares': 'Shares Verificados',
        'ops.add_worker': '+ Adicionar Worker',
        'ops.break_off_sector': '+ Criar Setor',
        'ops.live_hash_power': 'Hashrate ao Vivo',
        'ops.kas_price': 'Preço KAS / USD',
        'ops.settlement_silos': 'Silos de Liquidação',
        'ops.liquidity_plants': 'Plantas de Liquidez',
        'ops.pool_distribution': 'Distribuição do Pool',
        'ops.utc_settlement': 'Liquidação 22:00 UTC',
        'ops.active_buckets': 'Seus Buckets Ativos',
        'ops.node_sync': 'SINCRONIZAÇÃO',
        'ops.online': 'ONLINE',
        'ops.offline': 'OFFLINE',

        'dex.swap': 'Troca',
        'dex.liquidity': 'Liquidez',
        'dex.p2p': 'P2P',
        'dex.fiat': 'Fiat',
        'dex.slippage': 'Slippage',
        'dex.search_placeholder': 'Buscar tokens, ações ou contratos...',
        'dex.you_pay': 'Você Paga',
        'dex.you_receive': 'Você Recebe (Est.)',
        'dex.available': 'Disponível',
        'dex.live_oracle_rate': 'Taxa do Oráculo ao Vivo',
        'dex.active_fee_tier': 'Nível de Taxa Ativo',
        'dex.enter_swap_amount': 'Insira o Valor da Troca',
        'dex.review_execute_swap': 'Revisar e Executar Troca',
        'dex.supply_liquidity': 'Fornecer Liquidez',
        'dex.anchor_deposit': 'Depósito Âncora',
        'dex.paired_asset': 'Ativo Pareado',
        'dex.lock_duration': 'Duração do Bloqueio',
        'dex.silo_fee_tier': 'Nível de Taxa SILO',
        'dex.stake_silo': 'Staking de SILO',
        'dex.deploy_p2p_offer': 'Criar Oferta P2P',
        'dex.you_offer': 'Você Oferece',
        'dex.you_require': 'Você Solicita',
        'dex.open_p2p_offers': 'Ofertas P2P Abertas',
        'dex.fiat_bridge': 'Ponte Fiat',
        'dex.buy_with_usd': 'Comprar com USD',
        'dex.sell_for_usd': 'Vender por USD',

        'treasury.total_vault_value': 'Valor Total do Cofre',
        'treasury.master_treasury_balance': 'Saldo da Tesouraria Principal',
        'treasury.wallet_balance_onchain': 'Saldo da Carteira (On-Chain)',
        'treasury.pending_settlement': 'Liquidação Pendente',
        'treasury.staked_in_lp': 'Em Pools de Liquidez',
        'treasury.perennia_wallet': 'Carteira Perennia',
        'treasury.perennia_wallet_sub': 'Gerencie redes, saldos de tokens e regras de cofre frio',
        'treasury.search_chains': 'Buscar redes ou adicionar token (USDC, PEPE, ONDO)...',
        'treasury.organize': 'Organizar',
        'treasury.done': 'Concluído',
        'treasury.manage_chains': 'Gerenciar Redes',
        'treasury.done_chains': 'Concluído',
        'treasury.receive_qr': 'Receber QR',
        'treasury.send_withdraw_l1': 'Enviar / Sacar L1',
        'treasury.cold_vault': 'Cofre Frio',
        'treasury.activity': 'Atividade',

        'tax.title': 'Fortaleza Fiscal Zero-PII e Motor de Custo Base HIFO',
        'tax.configure_jurisdiction': '[ Configurar Jurisdição e Perfil ]',
        'tax.generate_pdf': 'Gerar PDF 1099-DA / 8949 ↓',
        'tax.export_csv': 'Exportar CSV HIFO ↓',
        'tax.gross_proceeds': 'Receita Bruta Tributável (YTD)',
        'tax.hifo_pool': 'Pool de Custo Base HIFO Passivo',
        'tax.effective_rate': 'Alíquota Efetiva',
        'tax.tax_escrow': 'Reserva Fiscal',

        'settings.title': 'Parâmetros do Sistema e Guia',
        'settings.subtitle': 'Idioma, Moeda, Tema, Precisão e Backup do Cofre',
        'settings.guide_title': 'Guia Interativo e Tour da Plataforma',
        'settings.guide_desc': 'Inicie o tour interativo passo a passo ou pule diretamente para qualquer capítulo.',
        'settings.start_tour': 'Iniciar Tour Interativo →',
        'settings.open_chapter_menu': 'Abrir Menu de Capítulos',
        'settings.language_label': 'Idioma de Exibição',
        'settings.language_sub': 'Traduza a navegação, cartões de câmbio e rótulos da tesouraria.',
        'settings.currency_label': 'Moeda de Exibição (Câmbio ao Vivo)',
        'settings.currency_sub': 'Converta valores em USD usando taxas de câmbio em tempo real.',
        'settings.theme_label': 'Modo de Tema Base',
        'settings.theme_sub': 'Alterne entre Modo Escuro Industrial e Modo Claro Quente.',
        'settings.dark': 'Escuro',
        'settings.light': 'Claro',
        'settings.warmth_label': 'Tom / Calor da Superfície',
        'settings.fiat_decimals': 'Precisão Fiat (Decimais)',
        'settings.token_decimals': 'Precisão de Tokens (Decimais)',
        'settings.backup_title': 'Backup Criptografado do Cofre (.json)',
        'settings.backup_desc': 'Exporte ou restaure seu arquivo de cofre criptografado por senha.',
        'settings.export_json': 'Exportar .JSON Criptografado',
        'settings.import_json': 'Importar .JSON Criptografado',
        'settings.reset_defaults': 'Restaurar Padrões',
        'settings.apply_close': 'Aplicar e Fechar'
    },
    ZH: {
        'nav.operations': '算力中心',
        'nav.exchange': '去中心化交易',
        'nav.treasury': '多链金库',
        'nav.tax_fortress': '税务堡垒',
        'nav.forge': '铸造工坊',
        'nav.director': '控制台',
        'header.buy_crypto': '法币买币',
        'header.unlock_vault': '解锁金库',
        'header.node_online': 'DAG 节点在线',
        'header.mining_settlement': '算力与清算网络',
        'header.copied': '已复制 ✓',

        'ops.master_pool_telemetry': '主矿池遥测',
        'ops.verified_shares': '已验证份额',
        'ops.add_worker': '+ 添加矿机',
        'ops.break_off_sector': '+ 创建算力分区',
        'ops.live_hash_power': '实时算力',
        'ops.kas_price': 'KAS / USD 价格',
        'ops.settlement_silos': '单币清算仓 (Silos)',
        'ops.liquidity_plants': '50%-KAS 流动性工厂',
        'ops.pool_distribution': '算力分配比例',
        'ops.utc_settlement': '22:00 UTC 全球清算',
        'ops.active_buckets': '活跃清算桶',
        'ops.node_sync': '节点同步',
        'ops.online': '在线',
        'ops.offline': '离线',

        'dex.swap': '闪兑',
        'dex.liquidity': '流动性',
        'dex.p2p': 'P2P 订单簿',
        'dex.fiat': '法币通道',
        'dex.slippage': '滑点',
        'dex.search_placeholder': '搜索代币、美股或合约地址...',
        'dex.you_pay': '您支付',
        'dex.you_receive': '您收到 (预估)',
        'dex.available': '可用余额',
        'dex.live_oracle_rate': '实时预言机汇率',
        'dex.active_fee_tier': '当前费率等级',
        'dex.enter_swap_amount': '输入兑换数量',
        'dex.review_execute_swap': '确认并执行闪兑',
        'dex.supply_liquidity': '提供流动性',
        'dex.anchor_deposit': '锚定资产存入',
        'dex.paired_asset': '配对资产',
        'dex.lock_duration': '锁定期限',
        'dex.silo_fee_tier': 'SILO 费率护盾等级',
        'dex.stake_silo': '质押 SILO',
        'dex.deploy_p2p_offer': '发布 P2P 报价',
        'dex.you_offer': '您提供',
        'dex.you_require': '您索取',
        'dex.open_p2p_offers': '公开 P2P 挂单',
        'dex.fiat_bridge': '法币出入金桥',
        'dex.buy_with_usd': '使用美元购买',
        'dex.sell_for_usd': '出售换取美元',

        'treasury.total_vault_value': '金库总价值',
        'treasury.master_treasury_balance': '主金库总资产',
        'treasury.wallet_balance_onchain': '链上钱包余额 (L1)',
        'treasury.pending_settlement': '待清算队列',
        'treasury.staked_in_lp': '流动性池质押中',
        'treasury.perennia_wallet': 'Perennia 多链钱包',
        'treasury.perennia_wallet_sub': '管理多链网络、代币余额与冷钱包自动清扫规则',
        'treasury.search_chains': '搜索公链或添加代币 (USDC, PEPE, ONDO)...',
        'treasury.organize': '排序',
        'treasury.done': '完成',
        'treasury.manage_chains': '管理网络',
        'treasury.done_chains': '完成',
        'treasury.receive_qr': '收款二维码',
        'treasury.send_withdraw_l1': '发送 / 提现 L1',
        'treasury.cold_vault': '冷金库设置',
        'treasury.activity': '链上记录',

        'tax.title': '零隐私 (Zero-PII) 税务堡垒与被动 HIFO 成本引擎',
        'tax.configure_jurisdiction': '[ 配置税收管辖区与资料 ]',
        'tax.generate_pdf': '生成 1099-DA / 8949 PDF ↓',
        'tax.export_csv': '导出 HIFO CSV ↓',
        'tax.gross_proceeds': '年度应税总收益 (YTD)',
        'tax.hifo_pool': '被动 HIFO 成本基础池',
        'tax.effective_rate': '综合有效税率',
        'tax.tax_escrow': '税金托管储备',

        'settings.title': '系统参数与平台指南',
        'settings.subtitle': '语言、显示货币、主题、精度与加密金库备份',
        'settings.guide_title': '交互式平台指南与导览',
        'settings.guide_desc': '随时启动交互式沙盒向导，或直接跳转到任意功能章节。',
        'settings.start_tour': '启动完整交互导览 →',
        'settings.open_chapter_menu': '打开章节菜单',
        'settings.language_label': '界面显示语言',
        'settings.language_sub': '切换导航栏、交易面板及金库界面的显示语言。',
        'settings.currency_label': '计价显示货币 (实时汇率)',
        'settings.currency_sub': '使用实时外汇汇率转换所有美元估值。',
        'settings.theme_label': '基础主题模式',
        'settings.theme_sub': '在工业深色模式与暖白浅色模式之间切换。',
        'settings.dark': '深色',
        'settings.light': '浅色',
        'settings.warmth_label': '表面色调 / 暖度',
        'settings.fiat_decimals': '法币显示精度 (小数位)',
        'settings.token_decimals': '代币显示精度 (小数位)',
        'settings.backup_title': '加密金库备份 (.json)',
        'settings.backup_desc': '导出或恢复受密码保护的加密金库文件。您的 24 词助记词在创建后绝不外露。',
        'settings.export_json': '导出加密 .JSON',
        'settings.import_json': '导入加密 .JSON',
        'settings.reset_defaults': '恢复默认',
        'settings.apply_close': '应用并关闭'
    },
    JA: {
        'nav.operations': 'マイニング運用',
        'nav.exchange': '取引所 (DEX)',
        'nav.treasury': 'トレジャリー',
        'nav.tax_fortress': '税務フォートレス',
        'nav.forge': 'フォージ',
        'nav.director': 'ディレクター',
        'header.buy_crypto': '暗号資産を購入',
        'header.unlock_vault': 'ボールトを解錠',
        'header.node_online': 'DAGノード稼働中',
        'header.mining_settlement': 'マイニング＆精算',
        'header.copied': 'コピー完了 ✓',

        'ops.master_pool_telemetry': 'マスタープール・テレメトリ',
        'ops.verified_shares': '検証済みシェア',
        'ops.add_worker': '+ ワーカー追加',
        'ops.break_off_sector': '+ セクター分割',
        'ops.live_hash_power': 'リアルタイム・ハッシュレート',
        'ops.kas_price': 'KAS / USD 価格',
        'ops.settlement_silos': '精算サイロ (Silos)',
        'ops.liquidity_plants': '流動性プラント',
        'ops.pool_distribution': 'プール配分',
        'ops.utc_settlement': '22:00 UTC 自動精算',
        'ops.active_buckets': 'アクティブ・バケット',
        'ops.node_sync': 'ノード同期',
        'ops.online': 'オンライン',
        'ops.offline': 'オフライン',

        'dex.swap': 'スワップ',
        'dex.liquidity': '流動性',
        'dex.p2p': 'P2P',
        'dex.fiat': '法定通貨',
        'dex.slippage': 'スリッページ',
        'dex.search_placeholder': 'トークン、株式、コントラクトを検索...',
        'dex.you_pay': '支払額',
        'dex.you_receive': '受取額 (推定)',
        'dex.available': '利用可能',
        'dex.live_oracle_rate': 'ライブオラクルレート',
        'dex.active_fee_tier': '適用手数料ティア',
        'dex.enter_swap_amount': '数量を入力してください',
        'dex.review_execute_swap': 'スワップを確認して実行',
        'dex.supply_liquidity': '流動性を供給',
        'dex.anchor_deposit': 'アンカー預入',
        'dex.paired_asset': 'ペア資産',
        'dex.lock_duration': 'ロック期間',
        'dex.silo_fee_tier': 'SILO 手数料ティア',
        'dex.stake_silo': 'SILO をステーク',
        'dex.deploy_p2p_offer': 'P2P オファーを作成',
        'dex.you_offer': '提供資産',
        'dex.you_require': '要求資産',
        'dex.open_p2p_offers': '公開 P2P オファー',
        'dex.fiat_bridge': '法定通貨ブリッジ',
        'dex.buy_with_usd': 'USD で購入',
        'dex.sell_for_usd': 'USD に売却',

        'treasury.total_vault_value': 'ボールト総資産額',
        'treasury.master_treasury_balance': 'マスタートレジャリー残高',
        'treasury.wallet_balance_onchain': 'オンチェーン残高 (L1)',
        'treasury.pending_settlement': '精算待機中',
        'treasury.staked_in_lp': 'LP ステーキング中',
        'treasury.perennia_wallet': 'Perennia ウォレット',
        'treasury.perennia_wallet_sub': 'マルチチェーン残高・トークン・コールドスイープ設定の管理',
        'treasury.search_chains': 'チェーン検索またはトークン追加 (USDC, PEPE, ONDO)...',
        'treasury.organize': '並び替え',
        'treasury.done': '完了',
        'treasury.manage_chains': 'チェーン管理',
        'treasury.done_chains': '完了',
        'treasury.receive_qr': '受取 QR',
        'treasury.send_withdraw_l1': 'L1 送金 / 出金',
        'treasury.cold_vault': 'コールドボールト',
        'treasury.activity': '履歴',

        'tax.title': 'ゼロPII 税務フォートレス＆パッシブ HIFO 取得原価エンジン',
        'tax.configure_jurisdiction': '[ 税務管轄とプロファイル設定 ]',
        'tax.generate_pdf': '1099-DA / 8949 PDF 出力 ↓',
        'tax.export_csv': 'HIFO CSV エクスポート ↓',
        'tax.gross_proceeds': '課税対象総収益 (YTD)',
        'tax.hifo_pool': 'パッシブ HIFO 取得原価プール',
        'tax.effective_rate': '実効税率',
        'tax.tax_escrow': '納税エスクロー準備金',

        'settings.title': 'システム設定＆ガイド',
        'settings.subtitle': '言語、表示通貨、テーマ、小数点精度、暗号化バックアップ',
        'settings.guide_title': 'インタラクティブ・プラットフォームガイド',
        'settings.guide_desc': '各ステーションの操作方法をステップバイステップのガイドツアーでいつでも確認できます。',
        'settings.start_tour': 'ガイドツアーを開始 →',
        'settings.open_chapter_menu': 'チャプター選択',
        'settings.language_label': '表示言語',
        'settings.language_sub': 'ナビゲーション、取引カード、トレジャリー表示を翻訳します。',
        'settings.currency_label': '表示通貨 (ライブ為替レート)',
        'settings.currency_sub': 'リアルタイム為替レートでUSD評価額を換算します。',
        'settings.theme_label': 'ベーステーマモード',
        'settings.theme_sub': 'インダストリアルダークとウォームライトを切り替えます。',
        'settings.dark': 'ダーク',
        'settings.light': 'ライト',
        'settings.warmth_label': 'サーフェストーン / 色温度',
        'settings.fiat_decimals': '法定通貨の小数点桁数',
        'settings.token_decimals': 'トークンの小数点桁数',
        'settings.backup_title': '暗号化ボールト・バックアップ (.json)',
        'settings.backup_desc': 'パスワードで暗号化されたボールトファイルをエクスポートまたは復元します。',
        'settings.export_json': '暗号化 .JSON を保存',
        'settings.import_json': '暗号化 .JSON を復元',
        'settings.reset_defaults': '初期設定に戻す',
        'settings.apply_close': '適用して閉じる'
    },
    KO: {
        'nav.operations': '채굴 운영',
        'nav.exchange': '거래소 (DEX)',
        'nav.treasury': '트레저리 금고',
        'nav.tax_fortress': '세무 포트리스',
        'nav.forge': '포지 (발행)',
        'nav.director': '디렉터',
        'header.buy_crypto': '암호화폐 구매',
        'header.unlock_vault': '금고 잠금해제',
        'header.node_online': 'DAG 노드 온라인',
        'header.mining_settlement': '채굴 및 정산 네트워크',
        'header.copied': '복사됨 ✓',

        'ops.master_pool_telemetry': '마스터 풀 텔레메트리',
        'ops.verified_shares': '검증된 쉐어',
        'ops.add_worker': '+ 워커 추가',
        'ops.break_off_sector': '+ 섹터 분할',
        'ops.live_hash_power': '실시간 해시레이트',
        'ops.kas_price': 'KAS / USD 가격',
        'ops.settlement_silos': '정산 사일로 (Silos)',
        'ops.liquidity_plants': '유동성 플랜트',
        'ops.pool_distribution': '풀 배분율',
        'ops.utc_settlement': '22:00 UTC 글로벌 정산',
        'ops.active_buckets': '활성 정산 버킷',
        'ops.node_sync': '노드 동기화',
        'ops.online': '온라인',
        'ops.offline': '오프라인',

        'dex.swap': '스왑',
        'dex.liquidity': '유동성',
        'dex.p2p': 'P2P',
        'dex.fiat': '법정화폐',
        'dex.slippage': '슬리피지',
        'dex.search_placeholder': '토큰, 주식 또는 컨트랙트 검색...',
        'dex.you_pay': '지불 금액',
        'dex.you_receive': '수령 예정 (추정)',
        'dex.available': '사용 가능',
        'dex.live_oracle_rate': '실시간 오라클 환율',
        'dex.active_fee_tier': '적용 수수료 등급',
        'dex.enter_swap_amount': '스왑 수량 입력',
        'dex.review_execute_swap': '스왑 검토 및 실행',
        'dex.supply_liquidity': '유동성 공급',
        'dex.anchor_deposit': '앵커 예치금',
        'dex.paired_asset': '페어 자산',
        'dex.lock_duration': '락업 기간',
        'dex.silo_fee_tier': 'SILO 수수료 등급',
        'dex.stake_silo': 'SILO 스테이킹',
        'dex.deploy_p2p_offer': 'P2P 오퍼 등록',
        'dex.you_offer': '제공 자산',
        'dex.you_require': '요청 자산',
        'dex.open_p2p_offers': '오픈 P2P 오퍼',
        'dex.fiat_bridge': '법정화폐 브릿지',
        'dex.buy_with_usd': 'USD로 구매',
        'dex.sell_for_usd': 'USD로 판매',

        'treasury.total_vault_value': '총 금고 가치',
        'treasury.master_treasury_balance': '마스터 트레저리 잔고',
        'treasury.wallet_balance_onchain': '온체인 지갑 잔고 (L1)',
        'treasury.pending_settlement': '정산 대기 중',
        'treasury.staked_in_lp': '유동성 풀 스테이킹',
        'treasury.perennia_wallet': 'Perennia 지갑',
        'treasury.perennia_wallet_sub': '멀티체인 네트워크, 토큰 잔고 및 콜드 월렛 자동 스윕 관리',
        'treasury.search_chains': '체인 검색 또는 토큰 추가 (USDC, PEPE, ONDO)...',
        'treasury.organize': '정렬',
        'treasury.done': '완료',
        'treasury.manage_chains': '체인 관리',
        'treasury.done_chains': '완료',
        'treasury.receive_qr': '입금 QR',
        'treasury.send_withdraw_l1': 'L1 전송 / 출금',
        'treasury.cold_vault': '콜드 금고',
        'treasury.activity': '활동 내역',

        'tax.title': '제로-PII 세무 포트리스 및 패시브 HIFO 취득원가 엔진',
        'tax.configure_jurisdiction': '[ 관할권 및 프로필 설정 ]',
        'tax.generate_pdf': '1099-DA / 8949 PDF 생성 ↓',
        'tax.export_csv': 'HIFO CSV 내보내기 ↓',
        'tax.gross_proceeds': '과세 대상 총수익 (YTD)',
        'tax.hifo_pool': '패시브 HIFO 원가 풀',
        'tax.effective_rate': '실효 세율',
        'tax.tax_escrow': '세금 에스크로 예비금',

        'settings.title': '시스템 설정 및 가이드',
        'settings.subtitle': '언어, 표시 통화, 테마, 소수점 정밀도 및 암호화 백업',
        'settings.guide_title': '인터랙티브 플랫폼 가이드 및 투어',
        'settings.guide_desc': '언제든지 인터랙티브 가이드 투어를 시작하거나 원하는 챕터로 바로 이동할 수 있습니다.',
        'settings.start_tour': '전체 인터랙티브 투어 시작 →',
        'settings.open_chapter_menu': '챕터 메뉴 열기',
        'settings.language_label': '표시 언어',
        'settings.language_sub': '내비게이션, 거래 카드 및 트레저리 레이블을 번역합니다.',
        'settings.currency_label': '표시 통화 (실시간 환율)',
        'settings.currency_sub': '실시간 외환 환율로 USD 가치를 변환합니다.',
        'settings.theme_label': '기본 테마 모드',
        'settings.theme_sub': '인더스트리얼 다크 모드와 웜 라이트 모드를 전환합니다.',
        'settings.dark': '다크',
        'settings.light': '라이트',
        'settings.warmth_label': '표면 톤 / 색온도',
        'settings.fiat_decimals': '법정화폐 소수점 자릿수',
        'settings.token_decimals': '토큰 소수점 자릿수',
        'settings.backup_title': '암호화된 금고 백업 (.json)',
        'settings.backup_desc': '비밀번호로 암호화된 금고 파일을 내보내거나 복원합니다.',
        'settings.export_json': '암호화된 .JSON 내보내기',
        'settings.import_json': '암호화된 .JSON 가져오기',
        'settings.reset_defaults': '기본값 초기화',
        'settings.apply_close': '적용 및 닫기'
    }
} as const;

class I18nStore {
    locale = $state<SupportedLocale>('EN');
    currency = $state<SupportedCurrency>('USD');
    fxRates = $state<Record<SupportedCurrency, number>>({
        ...DEFAULT_FX_RATES
    });
    fxUpdatedAt = $state<string>('');
    isSyncingFx = $state<boolean>(false);

    private fxInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        if (browser) {
            const stored = localStorage.getItem('perennia_ui_settings');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (
                        parsed.locale &&
                        SUPPORTED_LOCALES.some((l) => l.code === parsed.locale)
                    ) {
                        this.locale = parsed.locale as SupportedLocale;
                    }
                    if (
                        parsed.currency &&
                        SUPPORTED_CURRENCIES.some(
                            (c) => c.code === parsed.currency
                        )
                    ) {
                        this.currency = parsed.currency as SupportedCurrency;
                    }
                } catch {
                    // Ignore malformed localStorage payload
                }
            }
            const cachedFx = localStorage.getItem('perennia_fx_rates_cache');
            if (cachedFx) {
                try {
                    const parsedFx = JSON.parse(cachedFx);
                    if (parsedFx?.rates) {
                        this.fxRates = {
                            ...DEFAULT_FX_RATES,
                            ...parsedFx.rates,
                            USD: 1.0
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

    get currencySymbol(): string {
        return this.activeCurrencySpec.symbol;
    }

    setLocale(nextLocale: SupportedLocale) {
        if (SUPPORTED_LOCALES.some((l) => l.code === nextLocale)) {
            this.locale = nextLocale;
            if (browser) {
                document.documentElement.lang =
                    this.activeLocaleSpec.bcp47.split('-')[0];
            }
        }
    }

    setCurrency(nextCurrency: SupportedCurrency) {
        if (SUPPORTED_CURRENCIES.some((c) => c.code === nextCurrency)) {
            this.currency = nextCurrency;
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
                    this.fxRates = {
                        ...DEFAULT_FX_RATES,
                        ...data.rates,
                        USD: 1.0
                    };
                    this.fxUpdatedAt =
                        data.updatedAt || new Date().toISOString();
                    localStorage.setItem(
                        'perennia_fx_rates_cache',
                        JSON.stringify({
                            rates: this.fxRates,
                            updatedAt: this.fxUpdatedAt
                        })
                    );
                }
            }
        } catch {
            // Keep cached/fallback FX rates on transient network error
        } finally {
            this.isSyncingFx = false;
        }
    }

    t(key: TranslationKey | string, vars?: Record<string, string | number>): string {
        const dict =
            TRANSLATIONS[this.locale] || TRANSLATIONS.EN;
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
        const cleanUsd = Number(usdAmount || 0);
        if (!Number.isFinite(cleanUsd)) return 0;
        const rate = this.fxRates[this.currency] || 1.0;
        return cleanUsd * rate;
    }

    formatFiat(
        usdAmount: number,
        options?: {
            decimals?: number;
            includeCode?: boolean;
            adaptiveSmallPrice?: boolean;
        }
    ): string {
        const converted = this.convertUsd(usdAmount);
        const spec = this.activeCurrencySpec;
        const absVal = Math.abs(converted);

        let decimals =
            options?.decimals !== undefined
                ? options.decimals
                : spec.defaultDecimals;

        if (options?.adaptiveSmallPrice && absVal > 0 && absVal < 1) {
            decimals = absVal < 0.01 ? 6 : 4;
        } else if (this.currency === 'JPY' && absVal >= 10) {
            decimals = 0;
        }

        const formattedNumber = Math.abs(converted).toLocaleString(
            this.activeLocaleSpec.bcp47,
            {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            }
        );

        const sign = converted < 0 ? '-' : '';
        const suffix = options?.includeCode ? ` ${spec.code}` : '';
        return `${sign}${spec.symbol}${formattedNumber}${suffix}`;
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