/**
 * Schema-driven randomizer for the Template Studio.
 *
 * Replaces the old fixture concept. Produces canonical `ReceiptData` (the
 * pre-`mapReceiptData` shape) seeded by a 32-bit xorshift PRNG so designers
 * can reproduce shapes by sharing a seed.
 *
 * Edge-case weights live in `DEFAULT_SCENARIO_WEIGHTS`. They can be overridden
 * per call (used by the snapshot suite to force specific shapes regardless of
 * seed roll).
 */

import type {
	ReceiptCashier,
	ReceiptCustomer,
	ReceiptData,
	ReceiptDiscount,
	ReceiptFee,
	ReceiptFiscal,
	ReceiptLineItem,
	ReceiptOrderMeta,
	ReceiptPayment,
	ReceiptPresentationHints,
	ReceiptStoreMeta,
	ReceiptTaxSummaryItem,
	ReceiptTotals,
} from '@wcpos/printer/encoder';

/* ─────────────────────────── Seed + PRNG ─────────────────────────── */

/**
 * 32-bit xorshift PRNG. Cheap, deterministic, plenty of randomness for a
 * synthetic data generator. Returns a closure that yields `[0, 1)` floats.
 */
export function createPrng(seed: number): () => number {
	let state = seed >>> 0 || 0x9e3779b9;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		state >>>= 0;
		return state / 0x100000000;
	};
}

/** Coerce a user-supplied seed (number or hex/decimal string) to a 32-bit unsigned int. */
export function parseSeed(input: number | string | undefined): number {
	if (typeof input === 'number' && Number.isFinite(input)) return input >>> 0;
	if (typeof input === 'string') {
		const trimmed = input.trim().toLowerCase();
		if (trimmed.startsWith('0x')) {
			const hex = Number.parseInt(trimmed.slice(2), 16);
			if (Number.isFinite(hex)) return hex >>> 0;
		}
		const dec = Number.parseInt(trimmed, 10);
		if (Number.isFinite(dec)) return dec >>> 0;
		// Fall back to FNV-1a so arbitrary text strings still produce a stable seed.
		let hash = 0x811c9dc5;
		for (let index = 0; index < trimmed.length; index += 1) {
			hash ^= trimmed.charCodeAt(index);
			hash = Math.imul(hash, 0x01000193);
		}
		return hash >>> 0;
	}
	// No seed supplied → time-derived but still 32 bits.
	return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** Format a 32-bit seed as a stable 4-hex display token (`4f2a`). */
export function formatSeed(seed: number): string {
	return (seed >>> 0).toString(16).padStart(8, '0').slice(-4);
}

/* ─────────────────────────── Scenario weights ─────────────────────────── */

export interface ScenarioWeights {
	emptyCart: number;
	refund: number;
	rtl: number;
	multicurrency: number;
	multiPayment: number;
	fiscal: number;
	longNames: number;
	hasDiscounts: number;
	hasFees: number;
	hasShipping: number;
}

export const DEFAULT_SCENARIO_WEIGHTS: ScenarioWeights = {
	emptyCart: 0.05,
	refund: 0.1,
	rtl: 0.1,
	multicurrency: 0.05,
	multiPayment: 0.15,
	fiscal: 0.2,
	longNames: 0.15,
	hasDiscounts: 0.3,
	hasFees: 0.3,
	hasShipping: 0.25,
};

/** Forced overrides used by snapshot tests (and any caller that wants determinism). */
export type ScenarioOverrides = Partial<
	Record<keyof ScenarioWeights | 'cartSize', boolean | number>
>;

export interface ResolvedScenarios {
	emptyCart: boolean;
	refund: boolean;
	rtl: boolean;
	multicurrency: boolean;
	multiPayment: boolean;
	fiscal: boolean;
	longNames: boolean;
	hasDiscounts: boolean;
	hasFees: boolean;
	hasShipping: boolean;
	cartSize: number;
}

/* ─────────────────────────── Public API ─────────────────────────── */

export interface CreateRandomReceiptOptions {
	seed?: number | string;
	overrides?: ScenarioOverrides;
	weights?: Partial<ScenarioWeights>;
}

export interface RandomReceiptResult {
	/** Canonical receipt data with a stable `id` (so existing fixture-driven UIs keep working). */
	data: ReceiptData & { id: string };
	/** Resolved 32-bit seed. */
	seed: number;
	/** 4-hex display token for the resolved seed. */
	seedHex: string;
	/** What edge cases the roll actually hit (after overrides applied). */
	scenarios: ResolvedScenarios;
}

export function createRandomReceipt(options: CreateRandomReceiptOptions = {}): RandomReceiptResult {
	const seed = parseSeed(options.seed);
	const rand = createPrng(seed);
	const weights: ScenarioWeights = { ...DEFAULT_SCENARIO_WEIGHTS, ...options.weights };
	const overrides = options.overrides ?? {};

	const scenarios = resolveScenarios(rand, weights, overrides);
	const data = buildReceiptData(rand, scenarios, seed);

	return { data, seed, seedHex: formatSeed(seed), scenarios };
}

/* ─────────────────────────── Scenario resolution ─────────────────────────── */

function resolveScenarios(
	rand: () => number,
	weights: ScenarioWeights,
	overrides: ScenarioOverrides
): ResolvedScenarios {
	const flag = (key: keyof ScenarioWeights): boolean => {
		const override = overrides[key];
		if (typeof override === 'boolean') return override;
		return rand() < weights[key];
	};

	const emptyCart = flag('emptyCart');
	const cartSizeOverride = overrides.cartSize;
	const cartSize = emptyCart
		? 0
		: typeof cartSizeOverride === 'number'
			? Math.max(0, Math.floor(cartSizeOverride))
			: pickCartSize(rand);

	return {
		emptyCart,
		refund: flag('refund'),
		rtl: flag('rtl'),
		multicurrency: flag('multicurrency'),
		multiPayment: flag('multiPayment'),
		fiscal: flag('fiscal'),
		longNames: flag('longNames'),
		hasDiscounts: flag('hasDiscounts'),
		hasFees: flag('hasFees'),
		hasShipping: flag('hasShipping'),
		cartSize,
	};
}

function pickCartSize(rand: () => number): number {
	// Distribution keeps the median small but leaves room for stress tests.
	const buckets = [
		[0.45, 1],
		[0.7, 2],
		[0.85, 5],
		[0.95, 12],
		[1.0, 30],
	] as const;
	const roll = rand();
	for (const [threshold, size] of buckets) {
		if (roll <= threshold) return size;
	}
	return 1;
}

/* ─────────────────────────── Multilingual pools ─────────────────────────── */

interface LocalePool {
	storeNames: readonly string[];
	streets: readonly string[];
	cities: readonly string[];
	customerNames: readonly string[];
	cashierNames: readonly string[];
	productNames: readonly string[];
	longProductNames: readonly string[];
	currency: string;
	locale: string;
	taxLabel: string;
	thankYouNote: string;
}

const LATIN_POOL: LocalePool = {
	storeNames: [
		'Iberian Roasters',
		'Cassette Coffee Co.',
		'North Pier Provisions',
		'Saltspring Bakery',
		'Folium Botanica',
		'Kindred Hardware',
		'Solstice Records',
	],
	streets: [
		'12 Carrer del Sol',
		'48 Avinguda Diagonal',
		'201 Calle Gran Vía',
		'17 Rua dos Douradores',
		'88 Rue de Rivoli',
		'9 Via dei Fori',
	],
	cities: [
		'Barcelona, ES',
		'Madrid, ES',
		'Lisboa, PT',
		'Paris, FR',
		'Roma, IT',
		'Berlin, DE',
		'Amsterdam, NL',
	],
	customerNames: [
		'Ada Lovelace',
		'Grace Hopper',
		'Linus Pauling',
		'Marie Curie',
		'Frida Kahlo',
		'Hedy Lamarr',
		'Tim Berners-Lee',
		'Margarita Salas',
	],
	cashierNames: ['Sam Cashier', 'Lin Beaumont', 'Pere Casas', 'Júlia Vidal', 'Luca Romano'],
	productNames: [
		'Espresso',
		'Cortado',
		'Flat White',
		'Croissant',
		'Sourdough Loaf',
		'Olive Bread',
		'Iced Tea',
		'Matcha Latte',
		'Pain au Chocolat',
		'Tomato Salad',
		'Aubergine Spread',
		'Smoked Almonds',
	],
	longProductNames: [
		'Limited-edition single-origin Ethiopian Yirgacheffe whole-bean coffee 250g',
		'Hand-bound notebook with linen cover, ruled pages, and lay-flat binding (A5)',
		'Reclaimed-oak butcher block cutting board with hand-rubbed mineral oil finish',
	],
	currency: 'EUR',
	locale: 'en_US',
	taxLabel: 'VAT',
	thankYouNote: 'Thank you for your order!',
};

const RTL_POOL: LocalePool = {
	storeNames: ['متجر القهوة الذهبية', 'سوق الأمل', 'مخبز ليلى', 'دكان الورد'],
	streets: ['شارع الملك فهد ٤٢', 'طريق الملك عبدالعزيز ٧٧', 'شارع التحلية ١٢'],
	cities: ['الرياض، السعودية', 'دبي، الإمارات', 'الدوحة، قطر', 'عمّان، الأردن'],
	customerNames: ['نور الهدى', 'يوسف القحطاني', 'لمياء البكري', 'فهد العتيبي', 'سارة الحارثي'],
	cashierNames: ['أحمد رضا', 'منى سالم', 'خالد العتيبي'],
	productNames: ['قهوة عربية', 'تمر مجدول', 'كعك بالعسل', 'شاي بالنعناع', 'مكسرات مشكلة'],
	longProductNames: [
		'قهوة عربية فاخرة محمصة طازجاً مع هيل من المنشأ الأخضر ٢٥٠ غرام',
		'تمر سكري ممتاز معبأ في علبة هدية مع شوكولاتة بالكراميل',
	],
	currency: 'SAR',
	locale: 'ar_SA',
	taxLabel: 'ضريبة القيمة المضافة',
	thankYouNote: 'شكراً لزيارتكم!',
};

const CJK_POOL: LocalePool = {
	storeNames: ['和菓子の店 さくら', '東京コーヒー商會', '京都パン工房'],
	streets: ['銀座 4-12-7', '心斎橋筋 2-3-1', '元町 1-8-22'],
	cities: ['東京, 日本', '大阪, 日本', '京都, 日本'],
	customerNames: ['佐藤 花子', '田中 太郎', '高橋 美咲', '鈴木 健'],
	cashierNames: ['伊藤 さくら', '渡辺 拓海'],
	productNames: ['抹茶ラテ', '黒糖まんじゅう', '醤油ラーメン', '焼き鳥', '苺ショートケーキ'],
	longProductNames: ['宇治抹茶を使った濃厚抹茶ロールケーキ（季節限定・要冷蔵・8切れ入り）'],
	currency: 'JPY',
	locale: 'ja_JP',
	taxLabel: '消費税',
	thankYouNote: 'またのご来店をお待ちしております。',
};

/* ─────────────────────────── Builders ─────────────────────────── */

function pickFrom<T>(rand: () => number, pool: readonly T[]): T {
	return pool[Math.floor(rand() * pool.length)] as T;
}

function pickPool(rand: () => number, scenarios: ResolvedScenarios): LocalePool {
	if (scenarios.rtl) return RTL_POOL;
	// Throw the CJK pool in occasionally to add variety even outside RTL/explicit overrides.
	if (rand() < 0.18) return CJK_POOL;
	return LATIN_POOL;
}

function round(value: number, decimals = 2): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

function buildReceiptData(
	rand: () => number,
	scenarios: ResolvedScenarios,
	seed: number
): ReceiptData & { id: string } {
	const pool = pickPool(rand, scenarios);
	const orderCurrency = scenarios.multicurrency
		? pickFrom(rand, ['USD', 'GBP', 'AUD', 'CAD'])
		: pool.currency;
	const taxRate = pickFrom(rand, [0, 5, 7, 10, 19, 20, 21]);
	const pricesEnteredWithTax = rand() < 0.6;
	const displayTax = pickFrom(rand, ['incl', 'excl', 'hidden'] as const);
	const roundingMode = pickFrom(rand, ['per-line', 'per-total'] as const);
	const refundSign = scenarios.refund ? -1 : 1;

	const store = buildStore(rand, pool);
	const customer = buildCustomer(rand, pool);
	const cashier = buildCashier(rand, pool);

	const lines = buildLineItems(rand, pool, scenarios, taxRate, pricesEnteredWithTax, refundSign);
	// An empty cart suppresses every other line-driven scenario so totals collapse to zero.
	const populated = !scenarios.emptyCart;
	const fees = populated && scenarios.hasFees ? buildFees(rand, refundSign, taxRate) : [];
	const shipping =
		populated && scenarios.hasShipping ? buildShipping(rand, refundSign, taxRate) : [];
	const discounts =
		populated && scenarios.hasDiscounts ? buildDiscounts(rand, refundSign, taxRate) : [];

	const totals = computeTotals(lines, fees, shipping, discounts);
	const taxSummary = buildTaxSummary(lines, fees, shipping, discounts, taxRate, pool.taxLabel);
	const payments = buildPayments(rand, scenarios, totals.grand_total_incl, orderCurrency);

	const orderMeta = buildOrderMeta(rand, scenarios, orderCurrency, seed);
	const presentationHints: ReceiptPresentationHints = {
		display_tax: displayTax,
		prices_entered_with_tax: pricesEnteredWithTax,
		rounding_mode: roundingMode,
		locale: pool.locale,
	};
	const fiscal: ReceiptFiscal = scenarios.fiscal ? buildFiscal(rand, orderMeta) : {};

	return {
		id: `random-${formatSeed(seed)}`,
		meta: orderMeta,
		store,
		cashier,
		customer,
		lines,
		fees,
		shipping,
		discounts,
		totals,
		tax_summary: taxSummary,
		payments,
		fiscal,
		presentation_hints: presentationHints,
	};
}

function buildStore(rand: () => number, pool: LocalePool): ReceiptStoreMeta {
	return {
		name: pickFrom(rand, pool.storeNames),
		address_lines: [pickFrom(rand, pool.streets), pickFrom(rand, pool.cities)],
		tax_id: rand() < 0.7 ? `TAX-${Math.floor(rand() * 1_000_000)}` : undefined,
		phone: rand() < 0.6 ? `+34 555 ${Math.floor(rand() * 9000 + 1000)}` : undefined,
		email: rand() < 0.5 ? 'hello@example.com' : undefined,
	};
}

function buildCustomer(rand: () => number, pool: LocalePool): ReceiptCustomer {
	const isGuest = rand() < 0.4;
	const name = pickFrom(rand, pool.customerNames);
	return {
		id: isGuest ? 0 : Math.floor(rand() * 9999) + 1,
		name: isGuest ? 'Guest customer' : name,
	};
}

function buildCashier(rand: () => number, pool: LocalePool): ReceiptCashier {
	return {
		id: Math.floor(rand() * 99) + 1,
		name: pickFrom(rand, pool.cashierNames),
	};
}

function buildLineItems(
	rand: () => number,
	pool: LocalePool,
	scenarios: ResolvedScenarios,
	taxRate: number,
	pricesEnteredWithTax: boolean,
	refundSign: number
): ReceiptLineItem[] {
	const lines: ReceiptLineItem[] = [];
	const totalLines = scenarios.cartSize;
	for (let index = 0; index < totalLines; index += 1) {
		const useLong = scenarios.longNames && (index === 0 || rand() < 0.4);
		const name = useLong
			? pickFrom(rand, pool.longProductNames)
			: pickFrom(rand, pool.productNames);
		const qty = refundSign * (Math.floor(rand() * 3) + 1);
		const unitBase = round(rand() * 25 + 1.5);
		const unitInclTax = pricesEnteredWithTax
			? round(unitBase)
			: round(unitBase * (1 + taxRate / 100));
		const unitExclTax = pricesEnteredWithTax
			? round(unitBase / (1 + taxRate / 100))
			: round(unitBase);
		const lineSubInc = round(unitInclTax * Math.abs(qty)) * Math.sign(qty || 1);
		const lineSubExc = round(unitExclTax * Math.abs(qty)) * Math.sign(qty || 1);
		const taxAmount = round(lineSubInc - lineSubExc);
		lines.push({
			key: `line-${index}-${formatSeed(seedFromRand(rand))}`,
			sku: rand() < 0.7 ? `SKU-${Math.floor(rand() * 9999)}` : undefined,
			name,
			qty,
			unit_price: unitInclTax,
			unit_price_incl: unitInclTax,
			unit_price_excl: unitExclTax,
			line_subtotal: lineSubInc,
			line_subtotal_incl: lineSubInc,
			line_subtotal_excl: lineSubExc,
			discounts: 0,
			discounts_incl: 0,
			discounts_excl: 0,
			line_total: lineSubInc,
			line_total_incl: lineSubInc,
			line_total_excl: lineSubExc,
			meta: useLong && rand() < 0.4 ? [{ key: 'Variation', value: 'Limited Edition' }] : undefined,
			taxes: taxRate > 0 ? [{ code: `vat-${taxRate}`, amount: taxAmount }] : [],
		});
	}
	return lines;
}

/** Seed-extractor used to keep generated keys distinct without needing a separate counter. */
function seedFromRand(rand: () => number): number {
	return Math.floor(rand() * 0xffffffff);
}

function taxableExcl(totalIncl: number, taxRate: number): number {
	return round(totalIncl / (1 + taxRate / 100));
}

function buildFees(rand: () => number, refundSign: number, taxRate: number): ReceiptFee[] {
	const labels = ['Service charge', 'Eco fee', 'Delivery fee'];
	const count = 1 + Math.floor(rand() * 2);
	return Array.from({ length: count }, (_, index) => {
		const total = round(rand() * 4 + 0.5) * refundSign;
		return {
			label: labels[index % labels.length] as string,
			total,
			total_incl: total,
			total_excl: taxableExcl(total, taxRate),
		};
	});
}

function buildShipping(rand: () => number, refundSign: number, taxRate: number): ReceiptFee[] {
	const total = round(rand() * 12 + 3) * refundSign;
	return [
		{
			label: pickFrom(rand, ['Standard shipping', 'Local pickup', 'Same-day courier']),
			total,
			total_incl: total,
			total_excl: taxableExcl(total, taxRate),
		},
	];
}

function buildDiscounts(
	rand: () => number,
	refundSign: number,
	taxRate: number
): ReceiptDiscount[] {
	const codes = ['WELCOME10', 'LOYALTY5', 'SUMMER25', 'STAFF'];
	const count = 1 + Math.floor(rand() * 2);
	return Array.from({ length: count }, () => {
		const total = round(rand() * 6 + 1) * refundSign;
		return {
			label: pickFrom(rand, codes),
			total: -total,
			total_incl: -total,
			total_excl: taxableExcl(-total, taxRate),
		};
	});
}

function computeTotals(
	lines: ReceiptLineItem[],
	fees: ReceiptFee[],
	shipping: ReceiptFee[],
	discounts: ReceiptDiscount[]
): ReceiptTotals {
	const lineSubInc = lines.reduce((sum, line) => sum + (line.line_subtotal_incl ?? 0), 0);
	const lineSubExc = lines.reduce((sum, line) => sum + (line.line_subtotal_excl ?? 0), 0);
	const feeTotalIncl = fees.reduce((sum, fee) => sum + fee.total_incl, 0);
	const feeTotalExcl = fees.reduce((sum, fee) => sum + fee.total_excl, 0);
	const shipTotalIncl = shipping.reduce((sum, item) => sum + item.total_incl, 0);
	const shipTotalExcl = shipping.reduce((sum, item) => sum + item.total_excl, 0);
	const discountTotalIncl = discounts.reduce((sum, item) => sum + item.total_incl, 0);
	const discountTotalExcl = discounts.reduce((sum, item) => sum + item.total_excl, 0);
	const grandIncl = round(lineSubInc + feeTotalIncl + shipTotalIncl + discountTotalIncl);
	const grandExcl = round(lineSubExc + feeTotalExcl + shipTotalExcl + discountTotalExcl);
	return {
		subtotal: round(lineSubInc),
		subtotal_incl: round(lineSubInc),
		subtotal_excl: round(lineSubExc),
		discount_total: round(discountTotalIncl),
		discount_total_incl: round(discountTotalIncl),
		discount_total_excl: round(discountTotalExcl),
		tax_total: round(grandIncl - grandExcl),
		grand_total: grandIncl,
		grand_total_incl: grandIncl,
		grand_total_excl: grandExcl,
		paid_total: grandIncl,
		change_total: 0,
	};
}

function buildTaxSummary(
	lines: ReceiptLineItem[],
	fees: ReceiptFee[],
	shipping: ReceiptFee[],
	discounts: ReceiptDiscount[],
	taxRate: number,
	taxLabel: string
): ReceiptTaxSummaryItem[] {
	const taxableExcl =
		lines.reduce((sum, line) => sum + (line.line_subtotal_excl ?? 0), 0) +
		fees.reduce((sum, fee) => sum + fee.total_excl, 0) +
		shipping.reduce((sum, item) => sum + item.total_excl, 0) +
		discounts.reduce((sum, item) => sum + item.total_excl, 0);
	const taxableIncl =
		lines.reduce((sum, line) => sum + (line.line_subtotal_incl ?? 0), 0) +
		fees.reduce((sum, fee) => sum + fee.total_incl, 0) +
		shipping.reduce((sum, item) => sum + item.total_incl, 0) +
		discounts.reduce((sum, item) => sum + item.total_incl, 0);
	if (taxRate === 0 || (taxableIncl === 0 && taxableExcl === 0)) return [];
	return [
		{
			code: `vat-${taxRate}`,
			rate: taxRate,
			label: `${taxLabel} ${taxRate}%`,
			taxable_amount_excl: round(taxableExcl),
			tax_amount: round(taxableIncl - taxableExcl),
			taxable_amount_incl: round(taxableIncl),
		},
	];
}

function buildPayments(
	rand: () => number,
	scenarios: ResolvedScenarios,
	grandTotal: number,
	currency: string
): ReceiptPayment[] {
	if (grandTotal === 0) return [];
	const methods = [
		{ id: 'card', title: 'Card' },
		{ id: 'cash', title: 'Cash' },
		{ id: 'wallet', title: 'Wallet' },
		{ id: 'bank_transfer', title: 'Bank transfer' },
	] as const;
	if (!scenarios.multiPayment) {
		const method = pickFrom(rand, methods);
		return [
			{
				method_id: method.id,
				method_title: method.title,
				amount: grandTotal,
				reference:
					method.id === 'card' ? `**** **** **** ${1000 + Math.floor(rand() * 8999)}` : undefined,
			},
		];
	}
	const splits = 2 + Math.floor(rand() * 2);
	const result: ReceiptPayment[] = [];
	let remaining = grandTotal;
	for (let index = 0; index < splits; index += 1) {
		const isLast = index === splits - 1;
		const amount = isLast ? round(remaining) : round(remaining * (0.3 + rand() * 0.4));
		remaining = round(remaining - amount);
		const method = pickFrom(rand, methods);
		result.push({
			method_id: method.id,
			method_title: method.title,
			amount,
			reference: method.id === 'cash' ? `${currency} cash drawer` : undefined,
		});
	}
	return result;
}

function buildOrderMeta(
	rand: () => number,
	scenarios: ResolvedScenarios,
	currency: string,
	seed: number
): ReceiptOrderMeta {
	const orderId = 1000 + (seed % 9000);
	const mode = scenarios.refund
		? 'refund'
		: pickFrom(rand, ['sale', 'sale', 'sale', 'quote', 'kitchen', 'invoice'] as const);
	return {
		schema_version: 1,
		mode,
		created_at_gmt: new Date(Date.UTC(2025, 0, 1 + Math.floor(rand() * 730))).toISOString(),
		order_id: orderId,
		order_number: `${orderId}`,
		currency,
	};
}

function buildFiscal(rand: () => number, meta: ReceiptOrderMeta): ReceiptFiscal {
	return {
		immutable_id: `IMM-${formatSeed(seedFromRand(rand))}-${meta.order_id}`,
		receipt_number: `R-${meta.order_number}-${formatSeed(seedFromRand(rand))}`,
		sequence: meta.order_id,
		hash: formatSeed(seedFromRand(rand)) + formatSeed(seedFromRand(rand)),
		qr_payload: `wcpos://receipt/${meta.order_number}/${formatSeed(seedFromRand(rand))}`,
		tax_agency_code: 'AEAT',
		signed_at: meta.created_at_gmt,
	};
}
