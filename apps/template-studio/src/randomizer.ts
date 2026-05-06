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
	ReceiptLineItem,
	ReceiptOrder,
	ReceiptPayment,
	ReceiptPresentationHints,
	ReceiptRefund,
	ReceiptShipping,
	ReceiptStoreMeta,
	ReceiptTaxId,
	ReceiptTaxSummaryItem,
	ReceiptTotals,
	TaxId,
} from '@wcpos/printer/encoder';

const COFFEE_MONSTER_LOGO_URL = '/coffee-monster.png';

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

export function createRandomSeed(): number {
	const crypto = globalThis.crypto;
	if (crypto?.getRandomValues) {
		const values = new Uint32Array(1);
		crypto.getRandomValues(values);
		return values[0] >>> 0;
	}

	return Date.now() >>> 0;
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
	return createRandomSeed();
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
	companies: readonly string[];
	postcodes: readonly string[];
	regions: readonly string[];
	countryCode: string;
	dialingPrefix: string;
	currency: string;
	locale: string;
	timeZone: string;
	taxLabel: string;
	thankYouNote: string;
	i18nLabels?: Partial<ReceiptI18n>;
	statusLabels?: Partial<Record<string, string>>;
}

/**
 * Attribute pools used to populate line-item `meta` with realistic
 * key/value pairs the way WooCommerce surfaces variation attributes and
 * custom item meta via `WC_Order_Item::get_formatted_meta_data()`.
 */
const LINE_META_POOL: readonly { key: string; values: readonly string[] }[] = [
	{ key: 'Size', values: ['XS', 'S', 'M', 'L', 'XL', '12 oz', '16 oz', '250 g', '500 g'] },
	{
		key: 'Color',
		values: ['Black', 'White', 'Sand', 'Sage', 'Cream', 'Indigo', 'Burgundy'],
	},
	{ key: 'Material', values: ['Cotton', 'Linen', 'Wool', 'Bamboo', 'Recycled'] },
	{ key: 'Flavor', values: ['Vanilla', 'Chocolate', 'Caramel', 'Hazelnut', 'Matcha'] },
	{ key: 'Roast', values: ['Light', 'Medium', 'Dark', 'Espresso'] },
	{ key: 'Grind', values: ['Whole bean', 'Espresso', 'Filter', 'Coarse'] },
	{ key: 'Milk', values: ['Whole', 'Oat', 'Almond', 'Soy', 'Skim'] },
	{ key: 'Notes', values: ['No nuts', 'Extra hot', 'Gift wrapped', 'Allergy: gluten'] },
];

const FEE_META_POOL: readonly { key: string; values: readonly string[] }[] = [
	{ key: 'Reason', values: ['Late evening', 'Holiday', 'Express handling', 'Out-of-area'] },
	{ key: 'Reference', values: ['POS-FEE-001', 'POS-FEE-014', 'POS-FEE-022'] },
	{ key: 'Operator note', values: ['Approved by manager', 'Loyalty waiver'] },
];

const SHIPPING_META_POOL: readonly { key: string; values: readonly string[] }[] = [
	{ key: 'Carrier', values: ['UPS', 'FedEx', 'DHL', 'USPS', 'Royal Mail', 'Correos'] },
	{
		key: 'Tracking',
		values: ['1Z999AA10123456784', '7489-2233-9911', 'JD0002390321', 'UA123456789ES'],
	},
	{ key: 'Service', values: ['Ground', 'Express', 'Same-day', 'Pickup point'] },
	{ key: 'ETA', values: ['2-3 business days', 'Tomorrow', 'Today before 18:00'] },
];

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
	companies: ['Acme Provisions S.L.', 'Northwind Trading', 'Helios Holdings', 'Verde Atelier'],
	postcodes: ['08001', '28013', '1100-024', '75001', '00184', '10115'],
	regions: ['Catalunya', 'Madrid', 'Lisboa', 'Île-de-France', 'Lazio', 'Berlin'],
	countryCode: 'ES',
	dialingPrefix: '+34',
	currency: 'EUR',
	locale: 'es_ES',
	timeZone: 'Europe/Madrid',
	taxLabel: 'IVA',
	thankYouNote: '¡Gracias por su compra!',
	i18nLabels: {
		order: 'Pedido',
		date: 'Fecha',
		invoice_no: 'N.º de factura',
		reference: 'Referencia',
		cashier: 'Cajero',
		customer: 'Cliente',
		customer_tax_id: 'ID fiscal del cliente',
		prepared_for: 'Preparado para',
		processed_by: 'Procesado por',
		bill_to: 'Facturar a',
		ship_to: 'Enviar a',
		billing_address: 'Dirección de facturación',
		item: 'Artículo',
		sku: 'Referencia',
		qty: 'Cant.',
		unit_price: 'Precio unitario',
		unit_excl: 'Unidad (sin imp.)',
		total_excl: 'Total (sin imp.)',
		discount: 'Descuento',
		packed: 'Preparado',
		subtotal: 'Subtotal',
		subtotal_excl_tax: 'Subtotal (sin impuestos)',
		total: 'Total',
		refund_total: 'Total reembolsado',
		total_tax: 'Total impuestos',
		total_incl_tax: 'Total (con impuestos)',
		tax: 'Impuesto',
		paid: 'Pagado',
		tendered: 'Entregado',
		change: 'Cambio',
		tax_summary: 'Resumen de impuestos',
		taxable_excl: 'Base imponible (sin imp.)',
		tax_amount: 'Importe del impuesto',
		taxable_incl: 'Base imponible (con imp.)',
		invoice: 'Factura',
		receipt: 'Recibo',
		tax_invoice: 'Factura fiscal',
		quote: 'Presupuesto',
		gift_receipt: 'Recibo regalo',
		credit_note: 'Nota de crédito',
		packing_slip: 'Albarán',
		returned_items: 'Artículos devueltos',
		amount: 'Importe',
		total_refunded: 'Total reembolsado',
		customer_note: 'Nota del cliente',
		terms_and_conditions: 'Términos y condiciones',
		a_message_for_you: 'Un mensaje para ti',
		thank_you: 'Gracias',
		thank_you_purchase: '¡Gracias por su compra!',
		thank_you_shopping: '¡Gracias por comprar con nosotros!',
		thank_you_business: 'Gracias por su confianza.',
		gift_return_policy:
			'Los artículos se pueden devolver o cambiar en un plazo de 30 días con este recibo.',
		quote_validity:
			'Este presupuesto es válido durante 30 días desde la fecha de emisión. Los precios pueden cambiar después del periodo de validez. Esto no es un recibo ni una confirmación de compra.',
		quote_not_receipt: 'Esto es un presupuesto, no un recibo',
		return_retain_receipt: 'Conserve este recibo para sus registros.',
		kitchen: 'COCINA',
		signature: 'Firma',
		document_type: 'Tipo de documento',
		copy: 'Copia',
		copy_number: 'N.º de copia',
		status: 'Estado',
		completed: 'Completado',
	},
	statusLabels: {
		pending: 'Pendiente de pago',
		processing: 'Procesando',
		'on-hold': 'En espera',
		completed: 'Completado',
		cancelled: 'Cancelado',
		refunded: 'Reembolsado',
		failed: 'Fallido',
	},
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
	companies: ['شركة الواحة', 'مؤسسة الخير التجارية', 'مجموعة النخيل'],
	postcodes: ['11564', '21412', '12211', '34325'],
	regions: ['الرياض', 'المنطقة الشرقية', 'مكة المكرمة'],
	countryCode: 'SA',
	dialingPrefix: '+966',
	currency: 'SAR',
	locale: 'ar_SA',
	timeZone: 'Asia/Riyadh',
	taxLabel: 'ضريبة القيمة المضافة',
	thankYouNote: 'شكراً لزيارتكم!',
	i18nLabels: {
		order: 'الطلب',
		date: 'التاريخ',
		invoice_no: 'رقم الفاتورة',
		reference: 'المرجع',
		cashier: 'البائع',
		customer: 'العميل',
		customer_tax_id: 'الرقم الضريبي للعميل',
		prepared_for: 'معدّ لـ',
		processed_by: 'تمت المعالجة بواسطة',
		bill_to: 'الفاتورة إلى',
		ship_to: 'الشحن إلى',
		billing_address: 'عنوان الفاتورة',
		item: 'الصنف',
		sku: 'رمز المنتج',
		qty: 'الكمية',
		unit_price: 'سعر الوحدة',
		unit_excl: 'الوحدة (غير شامل)',
		total_excl: 'الإجمالي (غير شامل)',
		discount: 'الخصم',
		packed: 'معبأ',
		subtotal: 'المجموع الفرعي',
		subtotal_excl_tax: 'المجموع الفرعي (بدون ضريبة)',
		total: 'الإجمالي',
		refund_total: 'إجمالي الاسترداد',
		total_tax: 'إجمالي الضريبة',
		total_incl_tax: 'الإجمالي (شامل الضريبة)',
		tax: 'الضريبة',
		paid: 'المدفوع',
		tendered: 'المبلغ المدفوع',
		change: 'الباقي',
		tax_summary: 'ملخص الضريبة',
		taxable_excl: 'الخاضع للضريبة (غير شامل)',
		tax_amount: 'مبلغ الضريبة',
		taxable_incl: 'الخاضع للضريبة (شامل)',
		invoice: 'فاتورة',
		receipt: 'إيصال',
		tax_invoice: 'فاتورة ضريبية',
		quote: 'عرض سعر',
		gift_receipt: 'إيصال هدية',
		credit_note: 'إشعار دائن',
		packing_slip: 'قسيمة تعبئة',
		returned_items: 'الأصناف المرتجعة',
		amount: 'المبلغ',
		total_refunded: 'إجمالي المبلغ المسترد',
		customer_note: 'ملاحظة العميل',
		terms_and_conditions: 'الشروط والأحكام',
		a_message_for_you: 'رسالة لك',
		thank_you: 'شكراً',
		thank_you_purchase: 'شكراً لعملية الشراء!',
		thank_you_shopping: 'شكراً لتسوقكم معنا!',
		thank_you_business: 'شكراً لتعاملكم معنا.',
		gift_return_policy: 'يمكن إرجاع أو استبدال الأصناف خلال 30 يوماً مع هذا الإيصال.',
		quote_validity:
			'عرض السعر هذا صالح لمدة 30 يوماً من تاريخ الإصدار. قد تتغير الأسعار بعد انتهاء مدة الصلاحية. هذا ليس إيصالاً أو تأكيداً للشراء.',
		quote_not_receipt: 'هذا عرض سعر وليس إيصالاً',
		return_retain_receipt: 'يرجى الاحتفاظ بهذا الإيصال لسجلاتك.',
		kitchen: 'المطبخ',
		signature: 'التوقيع',
		document_type: 'نوع المستند',
		copy: 'نسخة',
		copy_number: 'رقم النسخة',
		status: 'الحالة',
		completed: 'مكتمل',
	},
	statusLabels: {
		pending: 'بانتظار الدفع',
		processing: 'قيد المعالجة',
		'on-hold': 'قيد الانتظار',
		completed: 'مكتمل',
		cancelled: 'ملغى',
		refunded: 'مسترد',
		failed: 'فشل',
	},
};

const CJK_POOL: LocalePool = {
	storeNames: ['和菓子の店 さくら', '東京コーヒー商會', '京都パン工房'],
	streets: ['銀座 4-12-7', '心斎橋筋 2-3-1', '元町 1-8-22'],
	cities: ['東京, 日本', '大阪, 日本', '京都, 日本'],
	customerNames: ['佐藤 花子', '田中 太郎', '高橋 美咲', '鈴木 健'],
	cashierNames: ['伊藤 さくら', '渡辺 拓海'],
	productNames: ['抹茶ラテ', '黒糖まんじゅう', '醤油ラーメン', '焼き鳥', '苺ショートケーキ'],
	longProductNames: ['宇治抹茶を使った濃厚抹茶ロールケーキ（季節限定・要冷蔵・8切れ入り）'],
	companies: ['株式会社さくら', '東京和菓子合同会社'],
	postcodes: ['100-0005', '530-0001', '604-8005'],
	regions: ['東京都', '大阪府', '京都府'],
	countryCode: 'JP',
	dialingPrefix: '+81',
	currency: 'JPY',
	locale: 'ja_JP',
	timeZone: 'Asia/Tokyo',
	taxLabel: '消費税',
	thankYouNote: 'またのご来店をお待ちしております。',
	i18nLabels: {
		order: '注文',
		date: '日付',
		invoice_no: '請求書番号',
		reference: '参照',
		cashier: 'レジ担当',
		customer: '顧客',
		customer_tax_id: '顧客税番号',
		prepared_for: '宛先',
		processed_by: '処理担当',
		bill_to: '請求先',
		ship_to: '配送先',
		billing_address: '請求先住所',
		item: '商品',
		sku: '品番',
		qty: '数量',
		unit_price: '単価',
		unit_excl: '単価（税抜）',
		total_excl: '合計（税抜）',
		discount: '割引',
		packed: '梱包済み',
		subtotal: '小計',
		subtotal_excl_tax: '小計（税抜）',
		total: '合計',
		refund_total: '返金合計',
		total_tax: '税額合計',
		total_incl_tax: '合計（税込）',
		tax: '税',
		paid: '支払い済み',
		tendered: '預り金',
		change: 'お釣り',
		tax_summary: '税の内訳',
		taxable_excl: '課税対象（税抜）',
		tax_amount: '税額',
		taxable_incl: '課税対象（税込）',
		invoice: '請求書',
		receipt: '領収書',
		tax_invoice: '適格請求書',
		quote: '見積書',
		gift_receipt: 'ギフトレシート',
		credit_note: 'クレジットノート',
		packing_slip: '納品書',
		returned_items: '返品商品',
		amount: '金額',
		total_refunded: '返金合計',
		customer_note: '顧客メモ',
		terms_and_conditions: '利用規約',
		a_message_for_you: 'あなたへのメッセージ',
		thank_you: 'ありがとうございます',
		thank_you_purchase: 'お買い上げありがとうございます。',
		thank_you_shopping: 'ご来店ありがとうございます。',
		thank_you_business: 'お取引いただきありがとうございます。',
		gift_return_policy: '返品・交換には30日以内にこのレシートをご提示ください。',
		quote_validity:
			'この見積書は発行日から30日間有効です。有効期限後は価格が変更される場合があります。これは領収書または購入確認ではありません。',
		quote_not_receipt: 'これは見積書であり領収書ではありません',
		return_retain_receipt: 'この領収書は保管してください。',
		kitchen: 'キッチン',
		signature: '署名',
		document_type: '書類種別',
		copy: 'コピー',
		copy_number: 'コピー番号',
		status: 'ステータス',
		completed: '完了',
	},
	statusLabels: {
		pending: '支払い待ち',
		processing: '処理中',
		'on-hold': '保留中',
		completed: '完了',
		cancelled: 'キャンセル',
		refunded: '返金済み',
		failed: '失敗',
	},
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
	const store = buildStore(rand, pool);
	const customer = buildCustomer(rand, pool);
	const cashier = buildCashier(rand, pool);

	const lines = buildLineItems(rand, pool, scenarios, taxRate, pricesEnteredWithTax);
	// An empty cart suppresses every other line-driven scenario so totals collapse to zero.
	const populated = !scenarios.emptyCart;
	const fees = populated && scenarios.hasFees ? buildFees(rand, taxRate, pool.taxLabel) : [];
	const shipping =
		populated && scenarios.hasShipping ? buildShipping(rand, taxRate, pool.taxLabel) : [];
	const discounts = populated && scenarios.hasDiscounts ? buildDiscounts(rand, taxRate) : [];

	const refunds = populated && scenarios.refund ? buildRefunds(rand, lines, pool, taxRate) : [];
	const totals = computeTotals(lines, fees, shipping, discounts, refunds);
	const taxSummary = buildTaxSummary(lines, fees, shipping, discounts, taxRate, pool.taxLabel);

	const orderCreated = pickOrderDate(rand, seed);
	const order = buildOrder(
		rand,
		scenarios,
		seed,
		orderCurrency,
		orderCreated,
		pool.locale,
		pool.timeZone,
		pool.statusLabels
	);
	const payments = buildPayments(rand, scenarios, totals.total_incl, orderCurrency, totals);
	if (refunds.length > 0) {
		for (const payment of payments) {
			payment.method_title = `Refund — ${payment.method_title}`;
		}
	}
	const presentationHints: ReceiptPresentationHints = {
		display_tax: displayTax,
		prices_entered_with_tax: pricesEnteredWithTax,
		rounding_mode: roundingMode,
		locale: pool.locale,
		order_barcode_type: 'code128',
	};
	const fiscal: ReceiptFiscal = scenarios.fiscal ? buildFiscal(rand, order) : {};
	const i18n = buildI18nLabels(refunds.length > 0, pool);

	// Attach customer tax IDs at the very end so the rand draws don't shift
	// the seeded sequence used by payments, fiscal, etc.
	applyCustomerTaxIds(rand, customer, pool);

	return {
		id: `random-${formatSeed(seed)}`,
		order,
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
		refunds,
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

function buildTaxIds(rand: () => number, pool: LocalePool): TaxId[] {
	if (rand() >= 0.7) return [];
	// Pool's currency / locale steers the typed entries. Multiple entries
	// per store are realistic — DE stores commonly render USt-IdNr. +
	// Steuernummer + HRB on every receipt for Impressumspflicht compliance.
	switch (pool.currency) {
		case 'EUR': {
			// Rotate between a few EU jurisdictions for snapshot variety.
			const pick = Math.floor(rand() * 3);
			if (pick === 0) {
				// Germany — three lines (USt-IdNr. + Steuernummer + HRB).
				return [
					{
						type: 'eu_vat',
						value: `DE${Math.floor(rand() * 900_000_000 + 100_000_000)}`,
						country: 'DE',
						label: 'USt-IdNr.',
					},
					{
						type: 'de_steuernummer',
						value: `05/${Math.floor(rand() * 900 + 100)}/${Math.floor(rand() * 90_000 + 10_000)}`,
						country: 'DE',
						label: 'Steuernummer',
					},
					{
						type: 'de_hrb',
						value: `HRB München ${Math.floor(rand() * 900_000 + 100_000)}`,
						country: 'DE',
						label: 'Handelsregister',
					},
				];
			}
			if (pick === 1) {
				// France — SIRET + EU VAT.
				const siren = Math.floor(rand() * 900_000_000 + 100_000_000);
				return [
					{
						type: 'eu_vat',
						value: `FR${Math.floor(rand() * 90 + 10)}${siren}`,
						country: 'FR',
						label: 'TVA intracommunautaire',
					},
					{
						type: 'fr_siret',
						value: `${siren}${Math.floor(rand() * 90_000 + 10_000)}`,
						country: 'FR',
						label: 'SIRET',
					},
				];
			}
			// Spain — ES NIF + EU VAT (original LATIN-pool default).
			return [
				{
					type: 'eu_vat',
					value: `ES${Math.floor(rand() * 90_000_000 + 10_000_000)}A`,
					country: 'ES',
					label: 'IVA',
				},
				{
					type: 'es_nif',
					value: `${Math.floor(rand() * 90_000_000 + 10_000_000)}B`,
					country: 'ES',
					label: 'NIF',
				},
			];
		}
		case 'GBP':
			// UK — VAT + Companies House number.
			return [
				{
					type: 'gb_vat',
					value: `GB${Math.floor(rand() * 900_000_000 + 100_000_000)}`,
					country: 'GB',
					label: 'UK VAT',
				},
				{
					type: 'gb_company',
					value: `${Math.floor(rand() * 90_000_000 + 10_000_000)}`,
					country: 'GB',
					label: 'Company registration',
				},
			];
		case 'CHF':
			return [
				{
					type: 'ch_uid',
					value: `CHE-${Math.floor(rand() * 900 + 100)}.${Math.floor(rand() * 900 + 100)}.${Math.floor(rand() * 900 + 100)}`,
					country: 'CH',
					label: 'UID',
				},
			];
		case 'SAR':
			return [
				{
					type: 'sa_vat',
					value: `3${Math.floor(rand() * 1e14)
						.toString()
						.padStart(14, '0')}`,
					country: 'SA',
					label: pool.taxLabel,
				},
			];
		case 'JPY':
			// JP isn't in the shipped Tax_Id_Types registry yet — emit as 'other'
			// with a JP-shaped 13-digit qualified-issuer value. Add a typed
			// constant in a follow-up if needed.
			return [
				{
					type: 'other',
					value: `T${Math.floor(rand() * 1e13)
						.toString()
						.padStart(13, '0')}`,
					country: 'JP',
					label: 'Qualified Invoice Issuer No.',
				},
			];
		default:
			return [{ type: 'other', value: `TAX-${Math.floor(rand() * 1_000_000)}`, label: 'Tax ID' }];
	}
}

function buildStore(rand: () => number, pool: LocalePool): ReceiptStoreMeta {
	const hasHours = rand() < 0.85;
	const openingDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const openingInline = openingDays.map((d) => `${d} 9:00–18:00`).join(', ');
	const openingVertical = openingDays.map((d) => `${d}: 9:00–18:00`).join('\n');
	// PRNG draw order is preserved (cityRegion → name → street → postcode).
	// We split cityRegion ("City, CC") to derive structured `city` without
	// adding extra rand draws — adding a state pick would shift downstream
	// snapshots and isn't necessary for EU/JP/SA stores.
	const cityRegion = pickFrom(rand, pool.cities);
	const name = pickFrom(rand, pool.storeNames);
	const street = pickFrom(rand, pool.streets);
	const postcode = pickFrom(rand, pool.postcodes);
	const [cityName] = cityRegion.split(/[,،]/).map((part) => part.trim());
	return {
		name,
		address: {
			address_1: street,
			city: cityName,
			postcode,
			country: pool.countryCode,
		},
		address_lines: [street, cityRegion, postcode],
		tax_ids: buildTaxIds(rand, pool),
		tax_id: undefined, // will be derived by the encoder/template if needed
		phone:
			rand() < 0.9 ? `${pool.dialingPrefix} 555 ${Math.floor(rand() * 9000 + 1000)}` : undefined,
		email: rand() < 0.9 ? 'hello@example.com' : undefined,
		logo: (rand(), COFFEE_MONSTER_LOGO_URL), // Preserve old logo/no-logo PRNG draw.
		opening_hours: hasHours ? 'Mon–Sat 9:00–18:00' : null,
		opening_hours_vertical: hasHours ? openingVertical : null,
		opening_hours_inline: hasHours ? openingInline : null,
		opening_hours_notes: rand() < 0.5 ? 'Closed on public holidays' : null,
		personal_notes: rand() < 0.5 ? 'Follow us @example' : null,
		policies_and_conditions:
			rand() < 0.7 ? 'Returns accepted within 30 days with this receipt.' : null,
		footer_imprint: rand() < 0.5 ? `VAT ${pool.countryCode}0000000000 · Reg. 12345` : null,
	};
}

function buildAddress(
	rand: () => number,
	pool: LocalePool,
	fullName: string,
	options: { includeCompany?: boolean } = {}
): Record<string, string> {
	// Mirrors the WC address shape (`first_name`, `last_name`, `company`,
	// `address_1`, `address_2`, `city`, `state`, `postcode`, `country`,
	// `email`, `phone`) so logicless templates can iterate `customer.billing_address`.
	const [firstName, ...rest] = fullName.split(' ');
	const lastName = rest.join(' ');
	const cityPart = pickFrom(rand, pool.cities).split(/[,،]/)[0]?.trim() ?? '';
	return {
		first_name: firstName ?? '',
		last_name: lastName,
		company: options.includeCompany && rand() < 0.5 ? pickFrom(rand, pool.companies) : '',
		address_1: pickFrom(rand, pool.streets),
		address_2: rand() < 0.4 ? `Apt ${Math.floor(rand() * 99) + 1}` : '',
		city: cityPart,
		state: pickFrom(rand, pool.regions),
		postcode: pickFrom(rand, pool.postcodes),
		country: pool.countryCode,
		email: 'customer@example.com',
		phone: `${pool.dialingPrefix} 555 ${Math.floor(rand() * 9000 + 1000)}`,
	};
}

/**
 * Maps a country code to a plausible TaxId entry. Mirrors the canonical TaxId
 * shape used by PHP `Tax_Id_Reader::parse_meta_map`. Used by the randomizer to
 * synthesise `customer.tax_ids[]` for snapshots so designers can see how
 * structured tax IDs render across locales (EU VAT, GB VAT, AU ABN, SA VAT,
 * etc.).
 */
function buildTaxIdForCountry(rand: () => number, countryCode: string): ReceiptTaxId {
	const digits = (n: number) => String(Math.floor(rand() * 10 ** n)).padStart(n, '0');
	switch (countryCode) {
		case 'GB':
			return { type: 'gb_vat', value: `GB${digits(9)}`, country: 'GB', label: null };
		case 'AU':
			return { type: 'au_abn', value: digits(11), country: 'AU', label: null };
		case 'SA':
			return { type: 'sa_vat', value: `3${digits(14)}`, country: 'SA', label: null };
		case 'JP':
			return { type: 'other', value: `T${digits(13)}`, country: 'JP', label: null };
		case 'US':
			return { type: 'us_ein', value: `${digits(2)}-${digits(7)}`, country: 'US', label: null };
		case 'CA':
			return { type: 'ca_gst_hst', value: `${digits(9)}RT0001`, country: 'CA', label: null };
		default:
			return {
				type: 'eu_vat',
				value: `${countryCode}${digits(9)}`,
				country: countryCode,
				label: null,
			};
	}
}

function buildCustomer(rand: () => number, pool: LocalePool): ReceiptCustomer {
	const isGuest = rand() < 0.3;
	const fullName = pickFrom(rand, pool.customerNames);
	const customer: ReceiptCustomer = {
		id: isGuest ? 0 : Math.floor(rand() * 9999) + 1,
		name: isGuest ? 'Guest customer' : fullName,
	};
	if (!isGuest) {
		// Real customers in the live app almost always have a billing address.
		customer.billing_address = buildAddress(rand, pool, fullName, { includeCompany: true });
		// ~70% have a separate shipping address; otherwise it mirrors billing or is omitted.
		if (rand() < 0.7) {
			customer.shipping_address = buildAddress(rand, pool, fullName);
		}
		// Preserve the original rand draws for the legacy scalar `tax_id` so
		// downstream PRNG sequence (payments, fiscal, etc.) stays stable.
		// Structured `tax_ids[]` is attached later in `applyCustomerTaxIds`.
		if (rand() < 0.6) {
			customer.tax_id = `${pool.countryCode}${Math.floor(rand() * 900_000_000) + 100_000_000}`;
		}
	} else if (rand() < 0.3) {
		// Guest checkouts occasionally still capture an address.
		customer.billing_address = buildAddress(rand, pool, 'Walk-in Customer');
	}
	return customer;
}

/**
 * Attaches structured `tax_ids[]` to the customer when a legacy `tax_id` was
 * generated. Runs AFTER all other rand-consuming builders so the extra draws
 * don't shift the PRNG sequence used by payments/fiscal — preserves existing
 * test seeds and snapshot determinism for non–tax-id fields.
 *
 * Overwrites the legacy scalar with a properly-typed value so designers see
 * realistic country-specific formats (GB VAT, AU ABN, SA VAT, etc.) rather
 * than the generic `<CC>9-digit` legacy fallback.
 */
function applyCustomerTaxIds(
	rand: () => number,
	customer: ReceiptCustomer,
	pool: LocalePool
): void {
	// Only attach when the legacy code path produced a tax_id; guests and
	// the 40% of real customers without a legacy tax_id remain untouched.
	if (!customer.tax_id) return;
	const primary = buildTaxIdForCountry(rand, pool.countryCode);
	customer.tax_id = primary.value;
	customer.tax_ids = [primary];
	// ~25% chance of a secondary ID (e.g. cross-border B2B trader with
	// both an EU VAT and a national fiscal code).
	if (rand() < 0.25) {
		customer.tax_ids.push({
			type: 'other',
			value: `REG-${Math.floor(rand() * 900_000) + 100_000}`,
			country: pool.countryCode,
			label: 'Company registration',
		});
	}
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
	pricesEnteredWithTax: boolean
): ReceiptLineItem[] {
	const lines: ReceiptLineItem[] = [];
	const totalLines = scenarios.cartSize;
	for (let index = 0; index < totalLines; index += 1) {
		const useLong = scenarios.longNames && (index === 0 || rand() < 0.4);
		const name = useLong
			? pickFrom(rand, pool.longProductNames)
			: pickFrom(rand, pool.productNames);
		const qty = Math.floor(rand() * 3) + 1;
		const unitBase = round(rand() * 25 + 1.5);
		const unitInclTax = pricesEnteredWithTax
			? round(unitBase)
			: round(unitBase * (1 + taxRate / 100));
		const unitExclTax = pricesEnteredWithTax
			? round(unitBase / (1 + taxRate / 100))
			: round(unitBase);
		const lineSubInc = round(unitInclTax * qty);
		const lineSubExc = round(unitExclTax * qty);
		const taxAmount = round(lineSubInc - lineSubExc);
		lines.push({
			key: `line-${index}-${formatSeed(seedFromRand(rand))}`,
			sku: rand() < 0.85 ? `SKU-${Math.floor(rand() * 9999)}` : undefined,
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
			meta: buildLineMeta(rand, useLong),
			taxes:
				taxRate > 0
					? [
							{
								code: `vat-${taxRate}`,
								rate: taxRate,
								label: `${pool.taxLabel} ${taxRate}%`,
								amount: taxAmount,
							},
						]
					: [],
		});
	}
	// Sprinkle per-line refund info on a couple of items when in refund mode so
	// snapshots/templates exercise the new qty_refunded / total_refunded fields.
	if (scenarios.refund && lines.length > 0) {
		const targets = Math.max(1, Math.floor(lines.length / 2));
		for (let i = 0; i < targets; i += 1) {
			const line = lines[i] as ReceiptLineItem;
			const fullQty = Math.abs(line.qty);
			const refundedQty = fullQty <= 1 ? fullQty : 1 + Math.floor(rand() * (fullQty - 1));
			const ratio = fullQty === 0 ? 0 : refundedQty / fullQty;
			line.qty_refunded = refundedQty;
			line.total_refunded = round(Math.abs(line.line_total_incl ?? 0) * ratio);
		}
	}
	return lines;
}

/** Seed-extractor used to keep generated keys distinct without needing a separate counter. */
function seedFromRand(rand: () => number): number {
	return Math.floor(rand() * 0xffffffff);
}

/**
 * Build a realistic `meta` array for a line item, drawn from the attribute
 * pool above. Most products carry 1–3 attribute pairs in the live app
 * (variations + custom item meta surfaced via WC's `get_formatted_meta_data()`).
 */
function buildLineMeta(
	rand: () => number,
	useLong: boolean
): { key: string; value: string }[] | undefined {
	const populationRoll = rand();
	if (populationRoll < 0.15) return undefined; // ~15% of lines have no meta — plain SKUs
	const desired = useLong ? 2 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 3);
	const used = new Set<string>();
	const result: { key: string; value: string }[] = [];
	for (let attempts = 0; attempts < 12 && result.length < desired; attempts += 1) {
		const entry = pickFrom(rand, LINE_META_POOL);
		if (used.has(entry.key)) continue;
		used.add(entry.key);
		result.push({ key: entry.key, value: pickFrom(rand, entry.values) });
	}
	return result;
}

function buildKeyValueMetaFromPool(
	rand: () => number,
	pool: readonly { key: string; values: readonly string[] }[],
	count: number
): { key: string; value: string }[] {
	const used = new Set<string>();
	const result: { key: string; value: string }[] = [];
	for (let attempts = 0; attempts < 12 && result.length < count; attempts += 1) {
		const entry = pickFrom(rand, pool);
		if (used.has(entry.key)) continue;
		used.add(entry.key);
		result.push({ key: entry.key, value: pickFrom(rand, entry.values) });
	}
	return result;
}

function taxableExcl(totalIncl: number, taxRate: number): number {
	return round(totalIncl / (1 + taxRate / 100));
}

function buildFees(rand: () => number, taxRate: number, taxLabel: string): ReceiptFee[] {
	const labels = ['Service charge', 'Eco fee', 'Delivery fee'];
	const count = 1 + Math.floor(rand() * 2);
	return Array.from({ length: count }, (_, index) => {
		const total = round(rand() * 4 + 0.5);
		const totalExcl = taxableExcl(total, taxRate);
		const taxAmount = round(total - totalExcl);
		const fee: ReceiptFee = {
			label: labels[index % labels.length] as string,
			total,
			total_incl: total,
			total_excl: totalExcl,
		};
		if (rand() < 0.5) {
			fee.meta = buildKeyValueMetaFromPool(rand, FEE_META_POOL, 1 + Math.floor(rand() * 2));
		}
		if (taxRate > 0 && rand() < 0.7) {
			fee.taxes = [
				{
					code: `vat-${taxRate}`,
					rate: taxRate,
					label: `${taxLabel} ${taxRate}%`,
					amount: taxAmount,
				},
			];
		}
		return fee;
	});
}

function buildShipping(rand: () => number, taxRate: number, taxLabel: string): ReceiptShipping[] {
	const methodIds = ['flat_rate', 'free_shipping', 'local_pickup'] as const;
	const count = rand() < 0.25 ? 2 : 1;
	const result: ReceiptShipping[] = [];
	for (let i = 0; i < count; i += 1) {
		const total = round(rand() * 12 + 3);
		const totalExcl = taxableExcl(total, taxRate);
		const taxAmount = round(total - totalExcl);
		const shipping: ReceiptShipping = {
			label: pickFrom(rand, ['Standard shipping', 'Local pickup', 'Same-day courier', 'Express']),
			method_id: pickFrom(rand, methodIds),
			total,
			total_incl: total,
			total_excl: totalExcl,
		};
		if (rand() < 0.7) {
			shipping.meta = buildKeyValueMetaFromPool(
				rand,
				SHIPPING_META_POOL,
				1 + Math.floor(rand() * 3)
			);
		}
		if (taxRate > 0 && rand() < 0.7) {
			shipping.taxes = [
				{
					code: `vat-${taxRate}`,
					rate: taxRate,
					label: `${taxLabel} ${taxRate}%`,
					amount: taxAmount,
				},
			];
		}
		result.push(shipping);
	}
	return result;
}

function buildDiscounts(rand: () => number, taxRate: number): ReceiptDiscount[] {
	const codes = ['WELCOME10', 'LOYALTY5', 'SUMMER25', 'STAFF'];
	const count = 1 + Math.floor(rand() * 2);
	return Array.from({ length: count }, () => {
		const total = round(rand() * 6 + 1);
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
			code,
			codes: extra ? `${code}, ${extra}` : code,
			// Discount magnitudes are POSITIVE in the receipt-data contract,
			// matching WC's `WC_Order_Item_Coupon::get_discount()` and
			// `WC_Order::get_discount_total()`. Templates that visually present
			// deductions render with a leading `-` (see every gallery template
			// in woocommerce-pos/templates/gallery — `-{{total_incl_display}}`).
			total,
			total_incl: total,
			total_excl: taxableExcl(total, taxRate),
		};
	});
}

function buildRefunds(
	rand: () => number,
	lines: ReceiptLineItem[],
	pool: LocalePool,
	taxRate: number
): ReceiptRefund[] {
	const refundReasons = [
		'Customer return',
		'Damaged item',
		'Wrong size',
		'Duplicate charge',
		'Goodwill gesture',
	];
	const gateways = [
		{ id: 'stripe', title: 'Stripe' },
		{ id: 'paypal', title: 'PayPal' },
		{ id: 'cash', title: 'Cash' },
	] as const;
	const refundedByName = pickFrom(rand, pool.cashierNames);
	const refundedById = Math.floor(rand() * 99) + 1;
	const gateway = gateways[refundedById % gateways.length];
	// Build refund lines from the lines that were marked refunded.
	const refundLines = lines
		.filter((line) => (line.qty_refunded ?? 0) > 0)
		.map((line) => buildRefundLine(line, taxRate, pool.taxLabel));
	const refundAmount = round(refundLines.reduce((sum, line) => sum + (line.total ?? 0), 0));
	const refundSubtotal = refundAmount;
	const refundTaxTotal =
		taxRate > 0 ? round(refundSubtotal - taxableExcl(refundSubtotal, taxRate)) : 0;
	const refundId = 1000 + Math.floor(rand() * 9000);
	const refundReason = pickFrom(rand, refundReasons);
	const refundedPayment = rand() < 0.5;
	return [
		{
			id: refundId,
			amount: refundAmount,
			subtotal: refundSubtotal,
			tax_total: refundTaxTotal,
			reason: refundReason,
			refunded_by_id: refundedById,
			refunded_by_name: refundedByName,
			refunded_payment: refundedPayment,
			destination: refundedPayment ? 'original_method' : 'manual',
			gateway_id: gateway.id,
			gateway_title: gateway.title,
			processing_mode: refundedPayment ? 'provider' : 'manual',
			lines: refundLines,
		},
	];
}

function buildRefundLine(
	line: ReceiptLineItem,
	taxRate: number,
	taxLabel: string
): ReceiptRefund['lines'][number] {
	const qty = line.qty_refunded ?? 0;
	const totalIncl = round(line.total_refunded ?? 0);
	const totalExcl = taxRate > 0 ? taxableExcl(totalIncl, taxRate) : totalIncl;
	const taxAmount = round(totalIncl - totalExcl);
	const unitTotal = qty === 0 ? 0 : round(totalIncl / qty);
	const unitTotalExcl = qty === 0 ? 0 : round(totalExcl / qty);

	return {
		name: line.name,
		sku: line.sku,
		qty,
		total: totalIncl,
		total_incl: totalIncl,
		total_excl: totalExcl,
		line_total: totalIncl,
		line_total_incl: totalIncl,
		line_total_excl: totalExcl,
		unit_total: unitTotal,
		unit_total_incl: unitTotal,
		unit_total_excl: unitTotalExcl,
		taxes:
			taxRate > 0
				? [
						{
							code: `vat-${taxRate}`,
							rate: taxRate,
							label: `${taxLabel} ${taxRate}%`,
							amount: taxAmount,
						},
					]
				: [],
	};
}

function computeTotals(
	lines: ReceiptLineItem[],
	fees: ReceiptFee[],
	shipping: ReceiptShipping[],
	discounts: ReceiptDiscount[],
	refunds: ReceiptRefund[]
): ReceiptTotals {
	const lineSubInc = lines.reduce((sum, line) => sum + (line.line_subtotal_incl ?? 0), 0);
	const lineSubExc = lines.reduce((sum, line) => sum + (line.line_subtotal_excl ?? 0), 0);
	const feeTotalIncl = fees.reduce((sum, fee) => sum + fee.total_incl, 0);
	const feeTotalExcl = fees.reduce((sum, fee) => sum + fee.total_excl, 0);
	const shipTotalIncl = shipping.reduce((sum, item) => sum + item.total_incl, 0);
	const shipTotalExcl = shipping.reduce((sum, item) => sum + item.total_excl, 0);
	const discountTotalIncl = discounts.reduce((sum, item) => sum + item.total_incl, 0);
	const discountTotalExcl = discounts.reduce((sum, item) => sum + item.total_excl, 0);
	// Discounts are positive magnitudes (matches WC) — subtract from grand.
	const grandIncl = round(lineSubInc + feeTotalIncl + shipTotalIncl - discountTotalIncl);
	const grandExcl = round(lineSubExc + feeTotalExcl + shipTotalExcl - discountTotalExcl);
	const refundTotal = refunds.reduce((sum, refund) => sum + (refund.amount ?? 0), 0);
	const totals: ReceiptTotals = {
		subtotal: round(lineSubInc),
		subtotal_incl: round(lineSubInc),
		subtotal_excl: round(lineSubExc),
		discount_total: round(discountTotalIncl),
		discount_total_incl: round(discountTotalIncl),
		discount_total_excl: round(discountTotalExcl),
		tax_total: round(grandIncl - grandExcl),
		total: grandIncl,
		total_incl: grandIncl,
		total_excl: grandExcl,
		paid_total: grandIncl,
		change_total: 0,
	};
	if (refunds.length > 0) {
		totals.refund_total = round(refundTotal);
	}
	return totals;
}

function buildTaxSummary(
	lines: ReceiptLineItem[],
	fees: ReceiptFee[],
	shipping: ReceiptShipping[],
	discounts: ReceiptDiscount[],
	taxRate: number,
	taxLabel: string
): ReceiptTaxSummaryItem[] {
	const taxableExcl =
		lines.reduce((sum, line) => sum + (line.line_subtotal_excl ?? 0), 0) +
		fees.reduce((sum, fee) => sum + fee.total_excl, 0) +
		shipping.reduce((sum, item) => sum + item.total_excl, 0) +
		discounts.reduce((sum, item) => sum - item.total_excl, 0);
	const taxableIncl =
		lines.reduce((sum, line) => sum + (line.line_subtotal_incl ?? 0), 0) +
		fees.reduce((sum, fee) => sum + fee.total_incl, 0) +
		shipping.reduce((sum, item) => sum + item.total_incl, 0) +
		discounts.reduce((sum, item) => sum - item.total_incl, 0);
	if (taxRate === 0 || (taxableIncl === 0 && taxableExcl === 0)) return [];
	return [
		{
			code: `vat-${taxRate}`,
			rate: taxRate,
			label: `${taxLabel} ${taxRate}%`,
			taxable_amount_excl: round(taxableExcl),
			tax_amount: round(taxableIncl - taxableExcl),
			taxable_amount_incl: round(taxableIncl),
			compound: false,
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
	grandTotal: number,
	currency: string,
	totals: ReceiptTotals
): ReceiptPayment[] {
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
			payment.transaction_id = `**** **** **** ${1000 + Math.floor(rand() * 8999)}`;
		} else if (method.id === 'cash') {
			payment.transaction_id = `${currency} cash drawer`;
			if (amount > 0) {
				// Round tendered up to the nearest "round number" so change is non-zero,
				// matching how cash gets handed over in real life.
				const tendered = Math.ceil(amount / 5) * 5;
				payment.tendered = round(tendered);
				payment.change = round(tendered - amount);
			}
		} else if (method.id === 'bank_transfer') {
			const partA = Math.floor(rand() * 100_000_000)
				.toString()
				.padStart(8, '0');
			const partB = Math.floor(rand() * 100_000_000)
				.toString()
				.padStart(8, '0');
			payment.transaction_id = `IBAN ES${partA}${partB}`;
		} else if (method.id === 'wallet') {
			payment.transaction_id = `WAL-${formatSeed(seedFromRand(rand)).toUpperCase()}-${1000 + Math.floor(rand() * 8999)}`;
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

function buildOrder(
	rand: () => number,
	scenarios: ResolvedScenarios,
	seed: number,
	currency: string,
	createdAt: Date,
	locale: string,
	timeZone: string,
	statusLabels: Partial<Record<string, string>> = WC_STATUS_LABELS
): ReceiptOrder {
	void scenarios;
	const orderId = 1000 + (seed % 9000);
	const wcStatus = pickFrom(rand, [
		'pending',
		'completed',
		'processing',
		'on-hold',
		'cancelled',
		'refunded',
		'failed',
	] as const);
	const createdVia = pickFrom(rand, ['woocommerce-pos', 'checkout', 'admin', 'rest-api'] as const);
	const customerNote =
		rand() < 0.25
			? pickFrom(rand, ['Please gift wrap', 'Leave at front desk', 'Call on arrival'])
			: '';
	// Paid/completed timestamps trail creation; paid statuses keep date_paid even
	// when fulfillment has not completed yet.
	const isPaid = wcStatus === 'processing' || wcStatus === 'completed';
	const isCompleted = wcStatus === 'completed';
	const paidAt = isPaid ? new Date(createdAt.getTime() + 60_000) : null;
	const completedAt = isCompleted ? new Date(createdAt.getTime() + 5 * 60_000) : null;
	return {
		id: orderId,
		number: `${orderId}`,
		currency,
		customer_note: customerNote,
		wc_status: wcStatus,
		status_label: statusLabels[wcStatus] ?? WC_STATUS_LABELS[wcStatus],
		created_via: createdVia,
		created: buildDateObject(createdAt, locale, timeZone),
		paid: paidAt ? buildDateObject(paidAt, locale, timeZone) : emptyDateObject(),
		completed: completedAt ? buildDateObject(completedAt, locale, timeZone) : emptyDateObject(),
	};
}

// Mirrors `wc_get_order_status_name()` for the seven default WC statuses,
// in English. The studio runs without a Woo install, so we hard-code the
// labels — production receipts get the real translations from the API.
const WC_STATUS_LABELS = {
	pending: 'Pending payment',
	processing: 'Processing',
	'on-hold': 'On hold',
	completed: 'Completed',
	cancelled: 'Cancelled',
	refunded: 'Refunded',
	failed: 'Failed',
} as const;

function buildFiscal(rand: () => number, order: ReceiptOrder): ReceiptFiscal {
	const isReprint = rand() < 0.2;
	const hash = formatSeed(seedFromRand(rand)) + formatSeed(seedFromRand(rand));
	const agency = pickFrom(rand, ['AEAT', 'ZATCA', 'NTA', 'AFIP'] as const);
	const extraFields: Record<string, string> = {
		// Spanish AEAT TicketBAI / Saudi ZATCA-style identifiers — gives templates
		// realistic jurisdiction-specific keys to render.
		invoice_serial: `${order.number}-${formatSeed(seedFromRand(rand)).toUpperCase()}`,
		signature_algorithm: 'sha256',
		issuer_id: `ISS-${formatSeed(seedFromRand(rand)).toUpperCase()}`,
	};
	if (agency === 'ZATCA') {
		extraFields.zatca_uuid = `ZATCA-${formatSeed(seedFromRand(rand)).toUpperCase()}-${formatSeed(seedFromRand(rand))}`;
		extraFields.zatca_invoice_type = pickFrom(rand, ['standard', 'simplified']);
	}
	return {
		immutable_id: `IMM-${formatSeed(seedFromRand(rand))}-${order.id}`,
		receipt_number: `R-${order.number}-${formatSeed(seedFromRand(rand))}`,
		sequence: order.id,
		hash,
		signature_excerpt: hash.slice(0, 8).toUpperCase(),
		qr_payload: `wcpos://receipt/${order.number}/${formatSeed(seedFromRand(rand))}`,
		tax_agency_code: agency,
		signed_at: order.created.datetime,
		document_label: pickFrom(rand, ['Tax Invoice', 'Receipt', 'Fiscal Receipt'] as const),
		is_reprint: isReprint,
		reprint_count: isReprint ? 1 + Math.floor(rand() * 3) : 0,
		extra_fields: extraFields,
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
function buildI18nLabels(hasRefunds = false, pool?: LocalePool): ReceiptI18n {
	const labels: ReceiptI18n = {
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
		total: hasRefunds ? 'Refund Total' : 'Total',
		refund_total: 'Refund Total',
		total_tax: 'Total Tax',
		total_incl_tax: 'Total (incl. tax)',
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
		thank_you: 'Thank you',
		thank_you_purchase: 'Thank you for your purchase!',
		thank_you_shopping: 'Thank you for shopping with us!',
		thank_you_business: 'Thank you for your business.',
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
		status: 'Status',
		completed: 'Completed',
	};
	const localized = { ...labels, ...pool?.i18nLabels };
	return {
		...localized,
		total: hasRefunds
			? (localized.refund_total ?? localized.total ?? labels.refund_total)
			: (localized.total ?? labels.total),
	};
}
