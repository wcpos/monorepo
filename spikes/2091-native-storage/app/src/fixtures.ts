// Output byte identity with 2143/2210 is verified by harness.test.mjs at both scales.
export type Line = {
	id: number;
	name: string;
	product_id: number;
	quantity: number;
	price: number;
	subtotal: string;
	total: string;
	sku: string;
	tax_class: string;
	taxes: unknown[];
	meta_data: { key: string; value: string | { source: string; padding: string } }[];
};
export const stamp = (i: number) => ({
	_deleted: false,
	_attachments: {},
	_rev: '1-seed',
	_meta: { lwt: 1700000000000 + i },
});
export const uuid = (i: number) => String(i).padStart(8, '0');
export const rng = (seed: number) => () =>
	(seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const words = [
	'amber',
	'birch',
	'cedar',
	'delta',
	'elm',
	'fern',
	'grove',
	'quartz',
	'cobalt',
	'maple',
];
export function line(i: number) {
	const row: Line = {
		id: i,
		name: `Item ${i}`,
		product_id: i,
		quantity: 1,
		price: 10,
		subtotal: '10',
		total: '10',
		sku: `SKU-${i}`,
		tax_class: '',
		taxes: [],
		meta_data: [
			{ key: '_woocommerce_pos_uuid', value: uuid(i) },
			{ key: '_woocommerce_pos_data', value: { source: 'pos', padding: '' } },
		],
	};
	(row.meta_data[1].value as { source: string; padding: string }).padding = 'x'.repeat(
		Math.max(0, 400 - JSON.stringify(row).length)
	);
	return row;
}
export function fixtures(n: number) {
	const random = rng(2143),
		products = [],
		orders = [];
	for (let i = 1; i <= n; i++) {
		const name = `${words[Math.floor(random() * words.length)]} ${words[Math.floor(random() * words.length)]} ${i}`;
		const status = random() < 0.9 ? 'publish' : 'draft',
			stockStatus = random() < 0.85 ? 'instock' : 'outofstock',
			type = random() < 0.8 ? 'simple' : 'variable';
		const payload = {
			id: i,
			name,
			slug: `fixture-${i}`,
			sku: `SKU-${i}`,
			global_unique_id: `501234${i}`,
			description: '',
			short_description: '',
			type,
			status,
			parent_id: 0,
			stock_status: stockStatus,
			manage_stock: false,
			stock_quantity: null,
			price: '10',
			regular_price: '10',
			sale_price: '',
			on_sale: false,
			featured: false,
			date_created_gmt: '2026-09-01T00:00:00',
			date_modified_gmt: '2026-09-01T00:00:00',
			permalink: `https://example.invalid/product/${i}`,
			images: [{ id: i, src: `https://example.invalid/${i}.jpg` }],
			categories: [{ id: 1, name: 'Items', slug: 'items' }],
			tags: [],
			brands: [],
			attributes: [],
			variations: [],
			meta_data: [{ id: 5000000 + i, key: '_woocommerce_pos_uuid', value: uuid(i) }],
		};
		const product = {
			uuid: uuid(i),
			remoteId: String(i),
			price: 10,
			stockStatus,
			type,
			categoryIds: [1],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
			payload,
			sync: {},
			local: {},
			...stamp(i),
		};
		payload.description = 'x'.repeat(Math.max(0, 2000 - JSON.stringify(product).length));
		products.push(product);
		const prose = Array.from(
			{ length: 10 },
			(_, j) => words[(Math.imul(i + 1, 1664525 + j * 2) >>> 0) % 7]
		).join(' ');
		const order = {
			uuid: uuid(i),
			remoteId: i,
			number: String(i),
			dateCreatedGmt: new Date(1700000000000 + i * 1000).toISOString(),
			status: ['pos-open', 'pos-partial', 'pending', 'completed', 'cancelled'][
				Math.floor(i / 4) % 5
			],
			total: 10,
			customerId: i % 100,
			sync: {},
			local: {},
			...stamp(i),
			payload: {
				meta_data: [
					{ id: 1, key: '_pos_user', value: String((i % 4) + 1) },
					{ id: 2, key: '_pos_store', value: String((Math.floor(i / 4) % 2) + 1) },
					...Array.from({ length: 4 + (i % 5) }, (_, j) => ({
						id: j + 3,
						key: `extra_${j}`,
						value: prose,
					})),
				],
				line_items: [] as Line[],
			},
		};
		order.payload.line_items = Array.from({ length: 1 + Math.floor(random() * 8) }, (_, j) =>
			line(i * 10 + j)
		);
		orders.push(order);
	}
	return { products, orders };
}

export type Product = ReturnType<typeof fixtures>['products'][number];
export type Order = ReturnType<typeof fixtures>['orders'][number];
