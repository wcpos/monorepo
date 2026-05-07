import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ReceiptDataSchema, ReceiptI18nSchema } from '@wcpos/printer/encoder';

import { createPrng, createRandomReceipt, formatSeed, parseSeed } from '../randomizer';

describe('template-studio randomizer', () => {
	it('produces canonical-shape ReceiptData that validates against the schema', () => {
		const result = createRandomReceipt({ seed: 'seed-default' });
		const parsed = ReceiptDataSchema.safeParse(result.data);
		expect(parsed.success).toBe(true);
		if (!parsed.success) throw new Error(parsed.error.message);
	});

	it('is deterministic for a given seed', () => {
		const a = createRandomReceipt({ seed: 0xc0ffee });
		const b = createRandomReceipt({ seed: 0xc0ffee });
		expect(JSON.stringify(a.data)).toEqual(JSON.stringify(b.data));
		expect(a.scenarios).toEqual(b.scenarios);
	});

	it('uses the bundled Coffee Monster logo for HTML template previews', () => {
		const result = createRandomReceipt({ seed: 'coffee-logo' });

		expect(result.data.store.logo).toContain('coffee-monster.png');
		expect(result.data.store.logo).not.toMatch(/^https?:\/\//);
		expect(fs.existsSync(path.resolve('public/coffee-monster.png'))).toBe(true);
	});

	it('populates structured store.address alongside address_lines[]', () => {
		const result = createRandomReceipt({ seed: 'store-address' });

		expect(result.data.store.address).toBeDefined();
		// All locale pools either pick a Latin/CJK/RTL country code, but the type
		// is always a 2-letter ISO code.
		expect(result.data.store.address?.country).toMatch(/^[A-Z]{2}$/);
		expect(result.data.store.address?.address_1).toBeTruthy();
		expect(result.data.store.address?.city).toBeTruthy();
		expect(result.data.store.address?.postcode).toBeTruthy();
		// The pre-formatted address_lines[] is still populated for templates that
		// just iterate.
		expect(result.data.store.address_lines).toContain(result.data.store.address?.address_1);
	});

	it('produces different shapes for different seeds', () => {
		const a = createRandomReceipt({ seed: 1 });
		const b = createRandomReceipt({ seed: 2 });
		expect(JSON.stringify(a.data)).not.toEqual(JSON.stringify(b.data));
	});

	it('honors scenario overrides for empty cart', () => {
		const result = createRandomReceipt({ seed: 1, overrides: { emptyCart: true } });
		expect(result.scenarios.emptyCart).toBe(true);
		expect(result.data.lines).toEqual([]);
		expect(result.data.totals.total_incl).toBe(0);
	});

	it('honors scenario overrides for refund (positive qty + refunds[] populated)', () => {
		const result = createRandomReceipt({
			seed: 7,
			overrides: { refund: true, emptyCart: false, cartSize: 2 },
		});
		expect(result.scenarios.refund).toBe(true);
		// An order with refunds is still an order — line qtys stay positive,
		// the refund is captured in the refunds[] block.
		expect(result.data.lines.length).toBeGreaterThan(0);
		expect(result.data.lines.every((line) => line.qty > 0)).toBe(true);
		expect(result.data.refunds.length).toBeGreaterThan(0);
	});

	it('does not emit synthetic refunds for an empty cart', () => {
		const result = createRandomReceipt({
			seed: 7,
			overrides: { refund: true, emptyCart: true },
		});

		expect(result.scenarios.refund).toBe(true);
		expect(result.scenarios.emptyCart).toBe(true);
		expect(result.data.lines).toEqual([]);
		expect(result.data.refunds).toEqual([]);
		expect(result.data.totals.refund_total).toBeUndefined();
	});

	it('emits a refunds[] block with positive amount when refund scenario is enabled', () => {
		const result = createRandomReceipt({
			seed: 2,
			overrides: { refund: true, emptyCart: false, cartSize: 2 },
		});

		expect(result.data.refunds.length).toBeGreaterThan(0);
		const refund = result.data.refunds[0]!;
		expect(refund.amount).toBeGreaterThan(0);
		expect(refund.lines.length).toBeGreaterThan(0);
		// Refund qtys / totals are stored as positive numbers in the refund block.
		expect(refund.lines.every((line) => (line.qty ?? 0) > 0)).toBe(true);
		expect(
			refund.lines.every(
				(line) =>
					line.line_total === line.total &&
					line.line_total_incl === line.total_incl &&
					line.line_total_excl === line.total_excl &&
					(line.unit_total ?? 0) > 0 &&
					(line.unit_total_incl ?? 0) > 0 &&
					(line.unit_total_excl ?? 0) > 0
			)
		).toBe(true);
	});

	it('populates refund dates with the same date variants exposed on order dates', () => {
		const result = createRandomReceipt({
			seed: 'refund-date-variants',
			overrides: { refund: true, emptyCart: false, cartSize: 2 },
		});

		const refund = result.data.refunds[0];
		expect(refund?.date).toBeDefined();
		expect(Object.keys(refund?.date ?? {}).sort()).toEqual(
			Object.keys(result.data.order.created).sort()
		);
		expect(refund?.date?.datetime).toBeTruthy();
		expect(refund?.date?.date_short).toBeTruthy();
		expect(refund?.date?.datetime_full).toBeTruthy();
	});

	it('keeps order totals positive on refund scenarios and exposes refund_total + net_total', () => {
		const result = createRandomReceipt({
			seed: 'refund',
			overrides: { refund: true, emptyCart: false, cartSize: 2 },
		});

		// Refund scenarios still produce a normal positive receipt — the refund
		// info is in `refunds[]` and `totals.refund_total`, never via flipped
		// signs or hijacked labels.
		expect(result.data.i18n.total).toBe('Total');
		expect(result.data.lines.every((line) => line.qty > 0 && line.line_total_incl >= 0)).toBe(true);
		expect(result.data.totals.total_incl).toBeGreaterThanOrEqual(0);
		expect(result.data.totals.refund_total).toBeGreaterThan(0);
		expect(result.data.totals.net_total).toBe(
			Math.max(
				Math.round((result.data.totals.total_incl - (result.data.totals.refund_total ?? 0)) * 100) /
					100,
				0
			)
		);
	});

	it('localizes labels when shuffle resolves an RTL locale', () => {
		const result = createRandomReceipt({
			seed: 9,
			overrides: { rtl: true, multicurrency: false, emptyCart: false },
		});

		expect(result.data.presentation_hints.locale).toBe('ar_SA');
		expect(result.data.order.currency).toBe('SAR');
		expect(result.data.i18n?.subtotal).toBe('المجموع الفرعي');
		expect(result.data.i18n?.total).toBe('الإجمالي');
		expect(result.data.i18n?.thank_you).toBe('شكراً');
	});

	it('exposes every canonical production i18n label in generated receipt data', () => {
		const canonicalLabelKeys = [
			'order',
			'date',
			'invoice_no',
			'reference',
			'cashier',
			'customer',
			'customer_tax_id',
			'customer_tax_ids',
			'tax_id_eu_vat',
			'tax_id_gb_vat',
			'tax_id_sa_vat',
			'tax_id_au_abn',
			'tax_id_br_cpf',
			'tax_id_br_cnpj',
			'tax_id_in_gst',
			'tax_id_it_cf',
			'tax_id_it_piva',
			'tax_id_es_nif',
			'tax_id_ar_cuit',
			'tax_id_ca_gst_hst',
			'tax_id_us_ein',
			'tax_id_other',
			'store_tax_ids',
			'store_tax_id_label_eu_vat',
			'store_tax_id_label_gb_vat',
			'store_tax_id_label_sa_vat',
			'store_tax_id_label_au_abn',
			'store_tax_id_label_br_cpf',
			'store_tax_id_label_br_cnpj',
			'store_tax_id_label_in_gst',
			'store_tax_id_label_it_cf',
			'store_tax_id_label_it_piva',
			'store_tax_id_label_es_nif',
			'store_tax_id_label_ar_cuit',
			'store_tax_id_label_ca_gst_hst',
			'store_tax_id_label_us_ein',
			'store_tax_id_label_de_ust_id',
			'store_tax_id_label_de_steuernummer',
			'store_tax_id_label_de_hrb',
			'store_tax_id_label_nl_kvk',
			'store_tax_id_label_fr_siret',
			'store_tax_id_label_fr_siren',
			'store_tax_id_label_gb_company',
			'store_tax_id_label_ch_uid',
			'store_tax_id_label_other',
			'customer_tax_id_label_eu_vat',
			'customer_tax_id_label_gb_vat',
			'customer_tax_id_label_sa_vat',
			'customer_tax_id_label_au_abn',
			'customer_tax_id_label_br_cpf',
			'customer_tax_id_label_br_cnpj',
			'customer_tax_id_label_in_gst',
			'customer_tax_id_label_it_cf',
			'customer_tax_id_label_it_piva',
			'customer_tax_id_label_es_nif',
			'customer_tax_id_label_ar_cuit',
			'customer_tax_id_label_ca_gst_hst',
			'customer_tax_id_label_us_ein',
			'customer_tax_id_label_de_ust_id',
			'customer_tax_id_label_de_steuernummer',
			'customer_tax_id_label_de_hrb',
			'customer_tax_id_label_nl_kvk',
			'customer_tax_id_label_fr_siret',
			'customer_tax_id_label_fr_siren',
			'customer_tax_id_label_gb_company',
			'customer_tax_id_label_ch_uid',
			'customer_tax_id_label_other',
			'prepared_for',
			'processed_by',
			'bill_to',
			'ship_to',
			'billing_address',
			'item',
			'sku',
			'qty',
			'unit_price',
			'unit_excl',
			'total_excl',
			'discount',
			'packed',
			'item_short',
			'sku_short',
			'qty_short',
			'unit_excl_short',
			'tax_rate_short',
			'tax_amount_short',
			'total_incl_tax_short',
			'taxable_excl_short',
			'taxable_incl_short',
			'subtotal',
			'subtotal_excl_tax',
			'total',
			'total_tax',
			'total_incl_tax',
			'grand_total_incl_tax',
			'tax',
			'paid',
			'tendered',
			'change',
			'tax_summary',
			'taxable_excl',
			'tax_amount',
			'taxable_incl',
			'invoice',
			'tax_invoice',
			'quote',
			'receipt',
			'gift_receipt',
			'credit_note',
			'packing_slip',
			'returned_items',
			'amount',
			'total_refunded',
			'refunded',
			'net_total',
			'customer_note',
			'terms_and_conditions',
			'a_message_for_you',
			'thank_you',
			'thank_you_purchase',
			'thank_you_shopping',
			'thank_you_business',
			'gift_return_policy',
			'quote_validity',
			'quote_not_receipt',
			'return_retain_receipt',
			'kitchen',
			'signature',
			'document_type',
			'copy',
			'copy_number',
			'status',
			'completed',
			'printed',
			'opening_hours',
		] as const;
		const receipt = createRandomReceipt({ seed: 'canonical-i18n-labels' });

		expect(Object.keys(receipt.data.i18n ?? {}).sort()).toEqual(
			expect.arrayContaining([...canonicalLabelKeys].sort())
		);
		expect(Object.keys(ReceiptI18nSchema.shape).sort()).toEqual(
			expect.arrayContaining([...canonicalLabelKeys].sort())
		);
		expect(receipt.data.i18n?.printed).toBe('Printed');
		expect(receipt.data.i18n?.refund_total).toBeDefined();
	});

	it('localizes every detailed receipt i18n label used by the gallery fixture', () => {
		const english = {
			bill_to: 'Bill To',
			cashier: 'Cashier',
			change: 'Change',
			customer_note: 'Customer Note',
			customer_tax_id: 'Customer Tax ID',
			date: 'Date',
			discount: 'Discount',
			invoice_no: 'Invoice No.',
			item: 'Item',
			order: 'Order',
			paid: 'Paid',
			prepared_for: 'Prepared For',
			processed_by: 'Processed by',
			qty: 'Qty',
			reference: 'Reference',
			returned_items: 'Returned Items',
			ship_to: 'Ship To',
			sku: 'SKU',
			status: 'Status',
			subtotal: 'Subtotal',
			subtotal_excl_tax: 'Subtotal (excl. tax)',
			tax: 'Tax',
			tax_amount: 'Tax Amount',
			tax_amount_short: 'Tax',
			tax_rate_short: 'Tax %',
			tax_invoice: 'Tax Invoice',
			tax_summary: 'Tax Summary',
			taxable_excl: 'Taxable (excl.)',
			taxable_excl_short: 'Taxable excl.',
			taxable_incl: 'Taxable (incl.)',
			taxable_incl_short: 'Taxable incl.',
			tendered: 'Tendered',
			terms_and_conditions: 'Terms & Conditions',
			thank_you_business: 'Thank you for your business.',
			thank_you_purchase: 'Thank you for your purchase!',
			thank_you_shopping: 'Thank you for shopping with us!',
			total: 'Total',
			total_excl: 'Total (excl.)',
			total_incl_tax: 'Total (incl. tax)',
			total_incl_tax_short: 'Total incl.',
			total_refunded: 'Total Refunded',
			total_tax: 'Total Tax',
			unit_excl: 'Unit (excl.)',
			unit_excl_short: 'Unit excl.',
			item_short: 'Item',
			qty_short: 'Qty',
			sku_short: 'SKU',
			opening_hours: 'Opening Hours',
		} as const;
		const detailedReceiptKeys = Object.keys(english) as (keyof typeof english)[];

		const localizedReceipts = [
			createRandomReceipt({
				seed: 'spanish-labels',
				overrides: { rtl: false },
				weights: { rtl: 0 },
			}),
			createRandomReceipt({ seed: 'arabic-labels', overrides: { rtl: true } }),
		];

		for (const receipt of localizedReceipts) {
			for (const key of detailedReceiptKeys) {
				expect(
					receipt.data.i18n?.[key],
					`${receipt.data.presentation_hints.locale}.${key}`
				).toBeTruthy();
				if (key !== 'total' && key !== 'subtotal') {
					expect(
						receipt.data.i18n?.[key],
						`${receipt.data.presentation_hints.locale}.${key}`
					).not.toBe(english[key]);
				}
			}
		}
	});

	it('exposes an editable order barcode type presentation hint', () => {
		const result = createRandomReceipt({ seed: 'barcode-type' });
		expect(result.data.presentation_hints.order_barcode_type).toBe('code128');
	});

	it('localizes labels and currency when shuffle resolves a Japanese locale', () => {
		let result: ReturnType<typeof createRandomReceipt> | undefined;
		for (let seed = 1; seed < 100 && !result; seed += 1) {
			const candidate = createRandomReceipt({
				seed,
				overrides: {
					rtl: false,
					multicurrency: false,
					emptyCart: false,
					refund: false,
					cartSize: 1,
				},
			});
			if (candidate.data.presentation_hints.locale === 'ja_JP') result = candidate;
		}
		if (!result) throw new Error('no Japanese locale seed found in range');

		expect(result.data.order.currency).toBe('JPY');
		expect(result.data.i18n?.subtotal).toBe('小計');
		expect(result.data.i18n?.total).toBe('合計');
		expect(result.data.i18n?.thank_you).toBe('ありがとうございます');
		expect(result.data.i18n?.opening_hours).toBe('営業時間');
	});

	it('emits Spanish status label translations for the expected Woo status set', () => {
		const expectedStatusLabels = {
			pending: 'Pendiente de pago',
			processing: 'Procesando',
			'on-hold': 'En espera',
			completed: 'Completado',
			cancelled: 'Cancelado',
			refunded: 'Reembolsado',
			failed: 'Fallido',
		} as const;
		const receiptsByStatus = new Map<
			keyof typeof expectedStatusLabels,
			ReturnType<typeof createRandomReceipt>
		>();

		// Studio receipts feed templates that prefer order.status_label over
		// the raw wc_status; make sure localized pools populate both.
		for (let seed = 1; seed < 1000 && receiptsByStatus.size < 7; seed += 1) {
			const receipt = createRandomReceipt({
				seed,
				overrides: { rtl: false, multicurrency: false, emptyCart: false },
			});
			const status = receipt.data.order.wc_status;
			if (receipt.data.presentation_hints.locale === 'es_ES' && status in expectedStatusLabels) {
				receiptsByStatus.set(status as keyof typeof expectedStatusLabels, receipt);
			}
		}

		for (const expectedStatus of Object.keys(
			expectedStatusLabels
		) as (keyof typeof expectedStatusLabels)[]) {
			const candidate = receiptsByStatus.get(expectedStatus);
			if (!candidate) throw new Error(`no ${expectedStatus} status seed found in range`);

			expect(candidate.data.order.wc_status).toBe(expectedStatus);
			expect(candidate.data.order.status_label).toBe(expectedStatusLabels[expectedStatus]);
		}
	});

	it('produces real-order timestamps when wc_status is completed', () => {
		// All scenarios produce real orders now — there's no quote/kitchen mode
		// that suppresses payment / completed dates. Filter to a completed order
		// to assert paid/completed timestamps trail creation.
		let completed: ReturnType<typeof createRandomReceipt> | undefined;
		for (let seed = 1; seed < 50 && !completed; seed += 1) {
			const candidate = createRandomReceipt({
				seed,
				overrides: { emptyCart: false, multiPayment: false, cartSize: 1 },
			});
			if (candidate.data.order.wc_status === 'completed') {
				completed = candidate;
			}
		}
		if (!completed) throw new Error('no completed status seed found in range');

		expect(completed.data.payments.length).toBeGreaterThan(0);
		const order = completed.data.order;
		expect(order).toBeDefined();
		if (!order) throw new Error('completed order data missing');
		expect(order.paid).toBeDefined();
		expect(order.completed).toBeDefined();
		expect(order.paid.datetime).toBeTruthy();
		expect(order.completed.datetime).toBeTruthy();
	});

	it('marks processing orders as paid but not completed', () => {
		let processing: ReturnType<typeof createRandomReceipt> | undefined;
		for (let seed = 1; seed < 50 && !processing; seed += 1) {
			const candidate = createRandomReceipt({
				seed,
				overrides: { emptyCart: false, multiPayment: false, cartSize: 1 },
			});
			if (candidate.data.order.wc_status === 'processing') {
				processing = candidate;
			}
		}
		if (!processing) throw new Error('no processing status seed found in range');

		const order = processing.data.order;
		expect(order).toBeDefined();
		if (!order) throw new Error('processing order data missing');
		expect(order.paid.datetime).toBeTruthy();
		expect(order.completed.datetime).toBe('');
	});

	it('honors RTL override (Arabic locale + SAR currency without multicurrency override)', () => {
		const result = createRandomReceipt({
			seed: 9,
			overrides: { rtl: true, multicurrency: false, emptyCart: false },
		});
		expect(result.data.presentation_hints.locale).toBe('ar_SA');
		expect(result.data.order.currency).toBe('SAR');
	});

	it('labels structured store tax IDs for receipt templates', () => {
		const result = createRandomReceipt({
			seed: 'rtl',
			overrides: { rtl: true, multicurrency: false, emptyCart: false },
		});

		expect(result.data.store.tax_ids?.length).toBeGreaterThan(0);
		for (const taxId of result.data.store.tax_ids ?? []) {
			expect(taxId.label).toMatch(/\S/);
		}
	});

	it('produces fiscal data when fiscal override is on', () => {
		const result = createRandomReceipt({ seed: 11, overrides: { fiscal: true } });
		expect(result.data.fiscal.immutable_id).toBeTruthy();
		expect(result.data.fiscal.qr_payload).toBeTruthy();
	});

	it('produces multi-payment splits that sum to grand total', () => {
		const result = createRandomReceipt({
			seed: 13,
			overrides: { multiPayment: true, emptyCart: false, cartSize: 3 },
		});
		expect(result.data.payments.length).toBeGreaterThanOrEqual(2);
		const sum = result.data.payments.reduce((acc, p) => acc + p.amount, 0);
		expect(Math.round(sum * 100) / 100).toBe(result.data.totals.total_incl);
	});

	it('keeps grand totals internally consistent when fees, shipping, and discounts are present', () => {
		const result = createRandomReceipt({
			seed: 21,
			overrides: {
				emptyCart: false,
				refund: false,
				hasDiscounts: true,
				hasFees: true,
				hasShipping: true,
				cartSize: 2,
			},
		});
		const lineTotalExcl = result.data.lines.reduce(
			(sum, line) => sum + (line.line_subtotal_excl ?? 0),
			0
		);
		const feeTotalExcl = result.data.fees.reduce((sum, fee) => sum + fee.total_excl, 0);
		const shippingTotalExcl = result.data.shipping.reduce((sum, item) => sum + item.total_excl, 0);
		const discountTotalExcl = result.data.discounts.reduce((sum, item) => sum + item.total_excl, 0);
		expect(discountTotalExcl).toBeGreaterThan(0);
		const expectedGrandExcl =
			Math.round((lineTotalExcl + feeTotalExcl + shippingTotalExcl - discountTotalExcl) * 100) /
			100;

		expect(result.data.totals.total_excl).toBe(expectedGrandExcl);
		expect(result.data.totals.tax_total).toBe(
			Math.round((result.data.totals.total_incl - expectedGrandExcl) * 100) / 100
		);
		const summaryTax = result.data.tax_summary.reduce((sum, tax) => sum + tax.tax_amount, 0);
		expect(Math.round(summaryTax * 100) / 100).toBe(result.data.totals.tax_total);
	});

	it('keeps seeded date formatting stable across runtime time zones', () => {
		const originalTimeZone = process.env.TZ;
		try {
			process.env.TZ = 'UTC';
			const utc = createRandomReceipt({ seed: 'seed-timezone' });
			process.env.TZ = 'Pacific/Honolulu';
			const honolulu = createRandomReceipt({ seed: 'seed-timezone' });

			expect(honolulu.data.order).toEqual(utc.data.order);
		} finally {
			if (originalTimeZone === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTimeZone;
			}
		}
	});

	it('parses textual seeds via FNV fallback', () => {
		const a = parseSeed('seed-rtl');
		const b = parseSeed('seed-rtl');
		expect(a).toBe(b);
		expect(parseSeed('seed-rtl')).not.toBe(parseSeed('seed-fiscal'));
	});

	it('formats seed as a stable 4-hex token', () => {
		expect(formatSeed(0xdeadbeef)).toBe('beef');
		expect(formatSeed(1)).toBe('0001');
	});

	it('exposes a usable xorshift PRNG closure', () => {
		const rand = createPrng(0x1234);
		const values = Array.from({ length: 8 }, () => rand());
		for (const value of values) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
		const next = createPrng(0x1234);
		const second = Array.from({ length: 8 }, () => next());
		expect(values).toEqual(second);
	});
});
