export type SyncCheckpoint = {
	updatedAtGmt: string;
	orderId: number;
	revision: string;
	sequence: number;
};

export type SyncMetadata = {
	revision: string;
	checkpoint: SyncCheckpoint;
	partial: boolean;
	source: 'woo-rest' | 'custom-pull' | 'snapshot' | 'skeleton';
};

export type WooOrderPayload = Record<string, unknown> & {
	id?: number;
	date_modified_gmt?: string;
};

export type WooProductPayload = Record<string, unknown> & {
	id?: number;
	date_modified_gmt?: string;
};

/**
 * Filter/sort columns promoted out of the opaque `payload` blob to indexed top-level fields so
 * RxDB Mango `.where()`/sort can touch them (payload bytes unchanged). The #241 harness measured
 * this as a 2-3× win (wider in-browser) at ~even insert cost. Derived from the Woo order payload
 * via `promotedOrderColumns`; backfilled from payload by the orderSchema v1 migration.
 */
export type PromotedOrderColumns = {
	number: string;
	dateCreatedGmt: string;
	status: string;
	total: string;
	customerId: number;
};

export type OrderDocument = {
	id: string;
	wooOrderId: number | null;
	payload: WooOrderPayload;
	sync: SyncMetadata;
	local: {
		dirty: boolean;
		pendingMutationIds: string[];
	};
};

/** The STORED order shape: the in-flight document plus the promoted filter/sort columns the orders
 * collection indexes. Added at the storage boundary (the repository) and present on every doc read
 * back from RxDB. The in-flight `OrderDocument` stays free of storage concerns. */
export type StoredOrderDocument = OrderDocument & PromotedOrderColumns;

/** Project the promoted order columns from a Woo order payload. Pure; the single source of the
 * promotion mapping (used by the storage boundary AND the schema migration backfill). */
export function promotedOrderColumns(payload: WooOrderPayload): PromotedOrderColumns {
	return {
		number: String(payload.number ?? ''),
		dateCreatedGmt: String(payload.date_created_gmt ?? ''),
		status: String(payload.status ?? ''),
		total: String(payload.total ?? ''),
		customerId: Number(payload.customer_id ?? 0),
	};
}

/** Attach the promoted columns (derived from `doc.payload`) to an order document for storage. */
export function withOrderColumns<T extends { payload: WooOrderPayload }>(
	doc: T
): T & PromotedOrderColumns {
	return { ...doc, ...promotedOrderColumns(doc.payload) };
}

/** Numeric ids from a Woo taxonomy array (categories/brands: `[{ id, name, ... }]`). Defensive — the
 * payload is opaque, so non-arrays and malformed entries are dropped. */
function taxonomyIds(value: unknown): number[] {
	return Array.isArray(value)
		? value
				.map((entry) => Number((entry as { id?: unknown } | null)?.id))
				.filter((n) => Number.isFinite(n) && n > 0)
		: [];
}

/**
 * A promoted numeric column value that preserves decimals but maps a missing (null/undefined)
 * or non-finite (NaN/±Infinity) input to `null` — so the column is always valid JSON and a real
 * `0` is distinguishable from "unmanaged". Used for decimal stock (P2-2).
 */
export function finiteOrNull(value: unknown): number | null {
	if (value == null) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

/**
 * Promoted product filter/sort columns (INC-2a; the attribute "any" facet array is INC-2b). `price`
 * is numeric for range filters; `categoryIds`/`brandIds` are membership arrays for multi-select.
 */
export type PromotedProductColumns = {
	price: number;
	stockStatus: string;
	type: string;
	categoryIds: number[];
	brandIds: number[];
	onSale: boolean;
	featured: boolean;
	/**
	 * Managed stock level, promoted for POS quantity filter/sort (P2-2). `null` when Woo
	 * stock management is off. DECIMAL-preserving on purpose — WooCommerce POS allows
	 * fractional stock (e.g. 3.6 kg), so this must NOT be coerced to an integer the way
	 * plain WC assumes; the schema deliberately omits an integer/multipleOf bound.
	 */
	stockQuantity: number | null;
};

export type StoredProductDocument = ProductDocument & PromotedProductColumns;

/** Project the promoted product columns from a Woo product payload. Pure; the single source of the
 * mapping (storage boundary AND the schema migration backfill). */
export function promotedProductColumns(payload: WooProductPayload): PromotedProductColumns {
	return {
		// Rounded to cents so the indexed price column satisfies the schema's multipleOf:0.01.
		price: Math.round((Number(payload.price) || 0) * 100) / 100,
		stockStatus: String(payload.stock_status ?? ''),
		type: String(payload.type ?? ''),
		categoryIds: taxonomyIds(payload.categories),
		brandIds: taxonomyIds(payload.brands),
		onSale: Boolean(payload.on_sale),
		featured: Boolean(payload.featured),
		// DECIMAL-preserving: Number('3.6') === 3.6 — no rounding/(int) coercion. null when
		// stock management is off (Woo serves null), distinguished from a real 0 stock. A
		// non-finite value (NaN/±Infinity — never valid JSON stock) also maps to null.
		stockQuantity: finiteOrNull(payload.stock_quantity),
	};
}

/** Attach the promoted columns (derived from `doc.payload`) to a product document for storage. */
export function withProductColumns<T extends { payload: WooProductPayload }>(
	doc: T
): T & PromotedProductColumns {
	return { ...doc, ...promotedProductColumns(doc.payload) };
}

export type ProductSyncMetadata = {
	revision: string;
	partial: boolean;
	source: 'woo-rest' | 'snapshot' | 'skeleton';
};

export type ProductDocument = {
	id: string;
	wooProductId: number | null;
	payload: WooProductPayload;
	sync: ProductSyncMetadata;
	local: {
		dirty: boolean;
		pendingMutationIds: string[];
	};
};

export type PullResponse = {
	documents: OrderDocument[];
	/**
	 * wooOrderIds of orders deleted server-side (F6). A SEPARATE channel from `documents` — the
	 * client resolves each to its stored uuid key and removes the local order. Present (and
	 * non-empty) only when the client requested `include_deletes`; the server coalesces each order
	 * to its net state per page, so an id never appears in both `documents` and `deletes`.
	 */
	deletes?: number[];
	/**
	 * Journal epoch (F8) — a stable id for the server's current `sequence` generation. When the
	 * client stored a different epoch, the sequence space was reset (fresh install / cleared option)
	 * and the client must resync from zero. Sibling of the checkpoint, NOT baked into the sequence.
	 */
	epoch?: string;
	/**
	 * Journal head (F8) — the server's highest emitted sequence (MAX). A client whose checkpoint
	 * sequence exceeds this has a cursor past the head (the AUTO_INCREMENT space reset beneath it)
	 * and must resync from zero — the backstop for a same-epoch reset (restore/truncate).
	 */
	head?: number;
	checkpoint: SyncCheckpoint;
	hasMore: boolean;
};

/** Per-phase server timings the pull endpoint may report alongside a batch (wire shape). */
export type ServerPhaseMetrics = Partial<
	Record<
		| 'candidate_query_ms'
		| 'serialize_documents_ms'
		| 'assemble_response_ms'
		| 'hydrate_documents_ms'
		| 'revision_hash_ms',
		number
	>
> &
	Record<string, number | undefined>;

/**
 * Optional server-side cost report riding on the pull envelope (`PullResponse & { metrics? }`).
 * Part of the wire protocol — the engine's custom pull adapter parses it — even though its main
 * consumers are the bench recorders.
 */
export type ServerMetrics = {
	duration_ms?: number;
	memory_peak_bytes?: number;
	document_count?: number;
	phases?: ServerPhaseMetrics;
	compression_mode?: string;
	cache_transform?: string;
	transport?: string;
};

export function normalizeCheckpoint(
	input: Partial<SyncCheckpoint> | null | undefined
): SyncCheckpoint {
	return {
		updatedAtGmt: input?.updatedAtGmt ?? '1970-01-01T00:00:00.000Z',
		orderId: input?.orderId ?? 0,
		revision: input?.revision ?? '',
		sequence: input?.sequence ?? 0,
	};
}

/**
 * Parse a WooCommerce `*_gmt` datetime to epoch milliseconds for INSTANT
 * comparison — the canonical form behind checkpoint-advance / freshness checks.
 *
 * Regression guard (1.9.x bug fa7b51add): Woo serializes `date_modified_gmt`
 * with an inconsistent — and often absent — timezone designator (bare
 * `2026-05-20T10:05:00`, the MySQL space form `2026-05-20 10:05:00`, `…Z`, or
 * `…+00:00`). A raw string compare treats two forms of the SAME instant as
 * different, which defeats the custom pull's stall guard and can spin an
 * infinite pull loop. Every `*_gmt` value is UTC by contract, so a
 * designator-less datetime is forced to UTC before parsing — otherwise
 * `Date.parse` reads it as HOST-LOCAL time. Empty/invalid input maps to epoch 0
 * (the "beginning of time" the null checkpoint normalizes to).
 *
 * This normalizes only for COMPARISON; the checkpoint's stored `updatedAtGmt`
 * string is echoed back to the server as the pull cursor verbatim, so it is
 * never rewritten here.
 */
export function checkpointInstantMs(updatedAtGmt: string | null | undefined): number {
	if (updatedAtGmt == null) {
		return 0;
	}
	const trimmed = updatedAtGmt.trim();
	if (trimmed === '') {
		return 0;
	}
	// MySQL 'YYYY-MM-DD HH:MM:SS' → ISO 'YYYY-MM-DDTHH:MM:SS'.
	let iso = trimmed.replace(' ', 'T');
	// Force UTC when no timezone designator is present (trailing `Z` or `±HH:MM` /
	// `±HHMM`); the date part's `-` separators never match the anchored offset.
	if (!/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(iso)) {
		iso += 'Z';
	}
	const ms = Date.parse(iso);
	return Number.isNaN(ms) ? 0 : ms;
}

export function orderDocumentId(orderId: number): string {
	return `woo-order:${orderId}`;
}

export function productDocumentId(productId: number): string {
	return `woo-product:${productId}`;
}

export function customerDocumentId(customerId: number): string {
	return `woo-customer:${customerId}`;
}
