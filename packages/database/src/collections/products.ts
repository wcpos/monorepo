import { productsLiteral } from './schemas/products';

type SchemaNode = {
	type?: string | readonly string[];
	properties?: Readonly<Record<string, SchemaNode>>;
	items?: SchemaNode;
	default?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getDefaultForType = (schema: SchemaNode): unknown => {
	const type = Array.isArray(schema.type)
		? schema.type.find((entry) => entry !== 'null')
		: schema.type;

	switch (type) {
		case 'string':
			return '';
		case 'number':
		case 'integer':
			return 0;
		case 'boolean':
			return false;
		case 'array':
			return [];
		case 'object':
			return {};
		default:
			return undefined;
	}
};

const coercePrimitive = (schema: SchemaNode, value: unknown): unknown => {
	const schemaType = Array.isArray(schema.type)
		? schema.type.find((type) => type !== 'null')
		: schema.type;

	switch (schemaType) {
		case 'number':
		case 'integer':
			return Number(value);
		case 'string':
			return isRecord(value) ? JSON.stringify(value) : String(value || '');
		case 'boolean':
			return typeof value === 'string' ? value === 'true' : Boolean(value);
		default:
			return value;
	}
};

const coerceBySchema = (
	schema: SchemaNode,
	value: unknown,
	root: Record<string, unknown>
): unknown => {
	if (schema.type === 'object' && schema.properties) {
		const source = isRecord(value) ? value : {};
		const coerced: Record<string, unknown> = {};

		for (const [key, childSchema] of Object.entries(schema.properties)) {
			if (key === 'uuid' && Array.isArray(root.meta_data)) {
				const uuidMeta = root.meta_data.find(
					(meta): meta is { key: string; value: unknown } =>
						isRecord(meta) && meta.key === '_woocommerce_pos_uuid'
				);
				if (uuidMeta) {
					coerced.uuid = String(uuidMeta.value || '');
					continue;
				}
			}

			if (Object.prototype.hasOwnProperty.call(source, key)) {
				coerced[key] = coerceBySchema(childSchema, source[key], root);
			} else if (Object.prototype.hasOwnProperty.call(childSchema, 'default')) {
				coerced[key] = childSchema.default;
			} else {
				coerced[key] = getDefaultForType(childSchema);
			}
		}

		return coerced;
	}

	if (schema.type === 'array') {
		return Array.isArray(value)
			? value.map((item) => coerceBySchema(schema.items ?? {}, item, root))
			: [];
	}

	return coercePrimitive(schema, value);
};

const normalizeProductInput = (data: Record<string, unknown>): Record<string, unknown> => {
	const normalized = { ...data };

	if (isRecord(normalized._links)) {
		normalized.links = normalized._links;
		delete normalized._links;
	}

	if (Array.isArray(normalized.meta_data)) {
		const whitelist = ['_woocommerce_pos', '_pos'];
		normalized.meta_data = normalized.meta_data.filter((meta) => {
			if (!isRecord(meta) || typeof meta.key !== 'string') {
				return false;
			}

			const key = meta.key;
			return !key.startsWith('_') || whitelist.some((prefix) => key.startsWith(prefix));
		});
	}

	return normalized;
};

/**
 * Normalize legacy product documents before schema/storage migration writes them
 * into the current strict collection. Product rows are server-cache data and
 * older rows can contain stale REST payload shapes (private meta objects,
 * `_links`, nullable fields, etc.) that the current schema no longer accepts.
 */
export const sanitizeProductData = (data: unknown): Record<string, unknown> => {
	if (!isRecord(data)) {
		return {};
	}

	const normalized = normalizeProductInput(data);
	const coerced = coerceBySchema(
		productsLiteral as unknown as SchemaNode,
		normalized,
		normalized
	) as Record<string, unknown>;

	if (coerced.uuid === '' && (typeof data.id === 'number' || typeof data.id === 'string')) {
		coerced.uuid = String(data.id);
	}

	return coerced;
};
