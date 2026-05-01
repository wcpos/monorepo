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
	ReceiptDate,
	ReceiptDiscount,
	ReceiptFee,
	ReceiptFiscal,
	ReceiptI18n,
	ReceiptInfo,
	ReceiptLineItem,
	ReceiptOrder,
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
	timeZone: string;
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
	timeZone: 'Europe/Madrid',
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
	timeZone: 'Asia/Riyadh',
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
	timeZone: 'Asia/Tokyo',
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
	const displayTax = pickFrom(rand, ['incl', 'excl', 'hidden', 'itemized', 'single'] as const);
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

	const orderCreated = pickOrderDate(rand, seed);
	const orderMeta = buildOrderMeta(
		rand,
		scenarios,
		orderCurrency,
		seed,
		orderCreated,
		pool.locale,
		pool.timeZone
	);
	const payments = buildPayments(
		rand,
		scenarios,
		orderMeta.mode,
		totals.grand_total_incl,
		orderCurrency,
		totals
	);
	const presentationHints: ReceiptPresentationHints = {
		display_tax: displayTax,
		prices_entered_with_tax: pricesEnteredWithTax,
		rounding_mode: roundingMode,
		locale: pool.locale,
	};
	const fiscal: ReceiptFiscal = scenarios.fiscal ? buildFiscal(rand, orderMeta) : {};
	const receiptInfo = buildReceiptInfo(rand, pool.locale, pool.timeZone, orderCreated);
	const order = buildOrder(orderMeta, orderCreated, scenarios, pool.locale, pool.timeZone);
	const i18n = buildI18nLabels();

	return {
		id: `random-${formatSeed(seed)}`,
		receipt: receiptInfo,
		order,
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
		i18n,
	};
}

/* ─────────────────────────── Date helpers ─────────────────────────── */

/**
 * Mirror of PHP `Receipt_Date_Formatter::from_timestamp()` — produces the same
 * 19 keys with comparable values from a JS Date. Templates can choose
 * whichever variant they need without diverging from the live receipt.
 */
function buildDateObject(date: Date, locale: string, timeZone: string): ReceiptDate {
	const intlLocale = locale.replace(/_/g, '-');
	const baseDateOptions: Intl.DateTimeFormatOptions = {
		timeZone,
		calendar: 'gregory',
		numberingSystem: 'latn',
	};
	const tryFormat = (options: Intl.DateTimeFormatOptions, fallback: () => string): string => {
		try {
			return new Intl.DateTimeFormat(intlLocale, { ...baseDateOptions, ...options }).format(date);
		} catch {
			return fallback();
		}
	};
	const parts = new Intl.DateTimeFormat(intlLocale, {
		...baseDateOptions,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(date);
	const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	const year = getPart('year');
	const month = getPart('month');
	const day = getPart('day');
	const shortYear = year.slice(-2);

	return {
		datetime: tryFormat(
			{ dateStyle: 'medium', timeStyle: 'short' },
			() =>
				`${date.toLocaleDateString(intlLocale, baseDateOptions)} ${date.toLocaleTimeString(intlLocale, baseDateOptions)}`
		),
		date: tryFormat({ dateStyle: 'medium' }, () =>
			date.toLocaleDateString(intlLocale, baseDateOptions)
		),
		time: tryFormat({ timeStyle: 'short' }, () =>
			date.toLocaleTimeString(intlLocale, baseDateOptions)
		),
		datetime_short: tryFormat(
			{ dateStyle: 'short', timeStyle: 'short' },
			() => `${month}/${day}/${shortYear}`
		),
		datetime_long: tryFormat(
			{ dateStyle: 'long', timeStyle: 'short' },
			() =>
				`${date.toLocaleDateString(intlLocale, { ...baseDateOptions, dateStyle: 'long' })} ${date.toLocaleTimeString(intlLocale, baseDateOptions)}`
		),
		datetime_full: tryFormat(
			{ dateStyle: 'full', timeStyle: 'short' },
			() =>
				`${date.toLocaleDateString(intlLocale, { ...baseDateOptions, dateStyle: 'full' })} ${date.toLocaleTimeString(intlLocale, baseDateOptions)}`
		),
		date_short: tryFormat({ dateStyle: 'short' }, () => `${month}/${day}/${shortYear}`),
		date_long: tryFormat({ dateStyle: 'long' }, () =>
			date.toLocaleDateString(intlLocale, { ...baseDateOptions, dateStyle: 'long' })
		),
		date_full: tryFormat({ dateStyle: 'full' }, () =>
			date.toLocaleDateString(intlLocale, { ...baseDateOptions, dateStyle: 'full' })
		),
		date_ymd: `${year}-${month}-${day}`,
		date_dmy: `${day}/${month}/${year}`,
		date_mdy: `${month}/${day}/${year}`,
		weekday_short: tryFormat({ weekday: 'short' }, () => ''),
		weekday_long: tryFormat({ weekday: 'long' }, () => ''),
		day,
		month,
		month_short: tryFormat({ month: 'short' }, () => String(month)),
		month_long: tryFormat({ month: 'long' }, () => String(month)),
		year,
	};
}

function pickOrderDate(rand: () => number, seed: number): Date {
	// Stable per-seed: same seed always produces the same created date.
	const offsetDays = ((seed >>> 0) % 730) + Math.floor(rand() * 5);
	const base = Date.UTC(2025, 0, 1) + offsetDays * 86_400_000;
	const hour = Math.floor(rand() * 14) + 8;
	const minute = Math.floor(rand() * 60);
	return new Date(base + hour * 3_600_000 + minute * 60_000);
}

function buildStore(rand: () => number, pool: LocalePool): ReceiptStoreMeta {
	const hasHours = rand() < 0.7;
	const openingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const openingInline = openingDays.map((d) => `${d} 9:00–18:00`).join(', ');
	const openingVertical = openingDays.map((d) => `${d}: 9:00–18:00`).join('\n');
	return {
		name: pickFrom(rand, pool.storeNames),
		address_lines: [pickFrom(rand, pool.streets), pickFrom(rand, pool.cities)],
		tax_id: rand() < 0.7 ? `TAX-${Math.floor(rand() * 1_000_000)}` : undefined,
		phone: rand() < 0.6 ? `+34 555 ${Math.floor(rand() * 9000 + 1000)}` : undefined,
		email: rand() < 0.5 ? 'hello@example.com' : undefined,
		logo: rand() < 0.3 ? 'https://example.com/logo.png' : null,
		opening_hours: hasHours ? 'Mon–Sat 9:00–18:00' : null,
		opening_hours_vertical: hasHours ? openingVertical : null,
		opening_hours_inline: hasHours ? openingInline : null,
		opening_hours_notes: rand() < 0.2 ? 'Closed on public holidays' : null,
		personal_notes: rand() < 0.25 ? 'Follow us @example' : null,
		policies_and_conditions:
			rand() < 0.4 ? 'Returns accepted within 30 days with this receipt.' : null,
		footer_imprint: rand() < 0.2 ? 'VAT EU0000000000 · Reg. 12345' : null,
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
			unit_subtotal: unitInclTax,
			unit_subtotal_incl: unitInclTax,
			unit_subtotal_excl: unitExclTax,
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
		const code = pickFrom(rand, codes);
		const extra =
			rand() < 0.4
				? pickFrom(
						rand,
						codes.filter((c) => c !== code)
					)
				: null;
		return {
			label: code,
			codes: extra ? `${code}, ${extra}` : code,
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

/**
 * Builds payment rows and reflects generated cash tender/change back onto the
 * passed totals object so templates have one totals-level source for change.
 */
function buildPayments(
	rand: () => number,
	scenarios: ResolvedScenarios,
	mode: ReceiptOrderMeta['mode'],
	grandTotal: number,
	currency: string,
	totals: ReceiptTotals
): ReceiptPayment[] {
	if (mode === 'quote' || mode === 'kitchen') {
		totals.paid_total = 0;
		totals.change_total = 0;
		return [];
	}
	if (grandTotal === 0) return [];
	const methods = [
		{ id: 'card', title: 'Card' },
		{ id: 'cash', title: 'Cash' },
		{ id: 'wallet', title: 'Wallet' },
		{ id: 'bank_transfer', title: 'Bank transfer' },
	] as const;
	const buildOne = (method: (typeof methods)[number], amount: number): ReceiptPayment => {
		const payment: ReceiptPayment = {
			method_id: method.id,
			method_title: method.title,
			amount,
		};
		if (method.id === 'card') {
			payment.reference = `**** **** **** ${1000 + Math.floor(rand() * 8999)}`;
		} else if (method.id === 'cash') {
			payment.reference = `${currency} cash drawer`;
			if (amount > 0) {
				// Round tendered up to the nearest "round number" so change is non-zero,
				// matching how cash gets handed over in real life.
				const tendered = Math.ceil(amount / 5) * 5;
				payment.tendered = round(tendered);
				payment.change = round(tendered - amount);
			}
		}
		return payment;
	};
	if (!scenarios.multiPayment) {
		const method = pickFrom(rand, methods);
		const payment = buildOne(method, grandTotal);
		// Reflect cash change at the totals level so templates have a single source.
		if (method.id === 'cash' && payment.change !== undefined) {
			totals.paid_total = payment.tendered ?? grandTotal;
			totals.change_total = payment.change;
		}
		return [payment];
	}
	const splits = 2 + Math.floor(rand() * 2);
	const result: ReceiptPayment[] = [];
	let remaining = grandTotal;
	let totalTendered = 0;
	let totalChange = 0;
	for (let index = 0; index < splits; index += 1) {
		const isLast = index === splits - 1;
		const amount = isLast ? round(remaining) : round(remaining * (0.3 + rand() * 0.4));
		remaining = round(remaining - amount);
		const method = pickFrom(rand, methods);
		const payment = buildOne(method, amount);
		totalTendered += payment.tendered ?? amount;
		totalChange += payment.change ?? 0;
		result.push(payment);
	}
	if (totalChange > 0) {
		totals.paid_total = round(totalTendered);
		totals.change_total = round(totalChange);
	}
	return result;
}

function buildOrderMeta(
	rand: () => number,
	scenarios: ResolvedScenarios,
	currency: string,
	seed: number,
	createdAt: Date,
	locale: string,
	timeZone: string
): ReceiptOrderMeta {
	const orderId = 1000 + (seed % 9000);
	const mode = scenarios.refund
		? 'refund'
		: pickFrom(rand, ['sale', 'sale', 'sale', 'quote', 'kitchen', 'invoice'] as const);
	const createdAtGmt = createdAt.toISOString().replace('T', ' ').slice(0, 19);
	const baseDateOptions: Intl.DateTimeFormatOptions = {
		timeZone,
		calendar: 'gregory',
		numberingSystem: 'latn',
	};
	const localeFormatted = (() => {
		try {
			return new Intl.DateTimeFormat(locale.replace(/_/g, '-'), {
				...baseDateOptions,
				dateStyle: 'medium',
				timeStyle: 'short',
			}).format(createdAt);
		} catch {
			return createdAtGmt;
		}
	})();
	return {
		schema_version: '1.2.0',
		mode,
		created_at_gmt: createdAtGmt,
		created_at_local: localeFormatted,
		order_id: orderId,
		order_number: `${orderId}`,
		currency,
		customer_note:
			rand() < 0.25
				? pickFrom(rand, ['Please gift wrap', 'Leave at front desk', 'Call on arrival'])
				: '',
	};
}

function buildFiscal(rand: () => number, meta: ReceiptOrderMeta): ReceiptFiscal {
	const isReprint = rand() < 0.2;
	const hash = formatSeed(seedFromRand(rand)) + formatSeed(seedFromRand(rand));
	return {
		immutable_id: `IMM-${formatSeed(seedFromRand(rand))}-${meta.order_id}`,
		receipt_number: `R-${meta.order_number}-${formatSeed(seedFromRand(rand))}`,
		sequence: meta.order_id,
		hash,
		signature_excerpt: hash.slice(0, 8).toUpperCase(),
		qr_payload: `wcpos://receipt/${meta.order_number}/${formatSeed(seedFromRand(rand))}`,
		tax_agency_code: 'AEAT',
		signed_at: meta.created_at_gmt,
		document_label: pickFrom(rand, ['Tax Invoice', 'Receipt', 'Fiscal Receipt'] as const),
		is_reprint: isReprint,
		reprint_count: isReprint ? 1 + Math.floor(rand() * 3) : 0,
		extra_fields: {},
	};
}

function buildReceiptInfo(
	rand: () => number,
	locale: string,
	timeZone: string,
	printedAt: Date
): ReceiptInfo {
	return {
		mode: pickFrom(rand, ['live', 'preview', 'gallery'] as const),
		printed: buildDateObject(printedAt, locale, timeZone),
	};
}

function buildOrder(
	meta: ReceiptOrderMeta,
	createdAt: Date,
	scenarios: ResolvedScenarios,
	locale: string,
	timeZone: string
): ReceiptOrder {
	// Paid/completed timestamps trail creation for typical sales; refunds fire
	// the same day; quotes/kitchen never reach those states so we leave the
	// dates empty (matching how PHP returns Receipt_Date_Formatter::empty()).
	const isCompleted = meta.mode === 'sale' || meta.mode === 'invoice' || meta.mode === 'refund';
	const paidAt = isCompleted ? new Date(createdAt.getTime() + 60_000) : null;
	const completedAt = isCompleted ? new Date(createdAt.getTime() + 5 * 60_000) : null;
	void scenarios;
	return {
		id: meta.order_id,
		number: meta.order_number,
		currency: meta.currency,
		customer_note: meta.customer_note ?? '',
		created: buildDateObject(createdAt, locale, timeZone),
		paid: paidAt ? buildDateObject(paidAt, locale, timeZone) : emptyDateObject(),
		completed: completedAt ? buildDateObject(completedAt, locale, timeZone) : emptyDateObject(),
	};
}

function emptyDateObject(): ReceiptDate {
	return {
		datetime: '',
		date: '',
		time: '',
		datetime_short: '',
		datetime_long: '',
		datetime_full: '',
		date_short: '',
		date_long: '',
		date_full: '',
		date_ymd: '',
		date_dmy: '',
		date_mdy: '',
		weekday_short: '',
		weekday_long: '',
		day: '',
		month: '',
		month_short: '',
		month_long: '',
		year: '',
	};
}

/**
 * English defaults mirroring `Receipt_I18n_Labels::get_labels()`. Designers see
 * the same key set the PHP builder emits; the catchall in the schema lets
 * extensions add more without breaking validation.
 */
function buildI18nLabels(): ReceiptI18n {
	return {
		order: 'Order',
		date: 'Date',
		invoice_no: 'Invoice No.',
		reference: 'Reference',
		cashier: 'Cashier',
		customer: 'Customer',
		customer_tax_id: 'Customer Tax ID',
		prepared_for: 'Prepared For',
		processed_by: 'Processed by',
		bill_to: 'Bill To',
		ship_to: 'Ship To',
		billing_address: 'Billing Address',
		item: 'Item',
		sku: 'SKU',
		qty: 'Qty',
		unit_price: 'Unit Price',
		unit_excl: 'Unit (excl.)',
		total_excl: 'Total (excl.)',
		discount: 'Discount',
		packed: 'Packed',
		subtotal: 'Subtotal',
		subtotal_excl_tax: 'Subtotal (excl. tax)',
		total: 'Total',
		total_tax: 'Total Tax',
		grand_total_incl_tax: 'Grand Total (incl. tax)',
		tax: 'Tax',
		paid: 'Paid',
		tendered: 'Tendered',
		change: 'Change',
		tax_summary: 'Tax Summary',
		taxable_excl: 'Taxable (excl.)',
		tax_amount: 'Tax Amount',
		taxable_incl: 'Taxable (incl.)',
		invoice: 'Invoice',
		tax_invoice: 'Tax Invoice',
		quote: 'Quote',
		receipt: 'Receipt',
		gift_receipt: 'Gift Receipt',
		credit_note: 'Credit Note',
		packing_slip: 'Packing Slip',
		returned_items: 'Returned Items',
		amount: 'Amount',
		total_refunded: 'Total Refunded',
		customer_note: 'Customer Note',
		terms_and_conditions: 'Terms & Conditions',
		a_message_for_you: 'A message for you',
		thank_you: 'Thank you!',
		thank_you_purchase: 'Thank you for your purchase!',
		thank_you_shopping: 'Thank you for shopping with us!',
		thank_you_business: 'Thank you for your business.',
		tax_invoice_retain: 'This is a tax invoice. Please retain for your records.',
		gift_return_policy: 'Items may be returned or exchanged within 30 days with this receipt.',
		quote_validity:
			'This quote is valid for 30 days from the date of issue. Prices are subject to change after the validity period. This is not a receipt or confirmation of purchase.',
		quote_not_receipt: 'This is a quote, not a receipt',
		return_retain_receipt: 'Please retain this receipt for your records.',
		kitchen: 'KITCHEN',
		signature: 'Signature',
		document_type: 'Document Type',
		copy: 'Copy',
		copy_number: 'Copy No.',
	};
}
