const maxSafeInteger = 9_007_199_254_740_991;

/** RxDB/JSON-schema field shared by persisted millisecond timestamps. */
export function timestampMsSchemaField(): {
	readonly type: 'number';
	readonly minimum: 0;
	readonly maximum: number;
	readonly multipleOf: 1;
};
export function timestampMsSchemaField(nullable: true): {
	readonly type: readonly ['number', 'null'];
	readonly minimum: 0;
	readonly maximum: number;
	readonly multipleOf: 1;
};
export function timestampMsSchemaField(nullable = false) {
	return {
		type: nullable ? (['number', 'null'] as const) : ('number' as const),
		minimum: 0 as const,
		maximum: maxSafeInteger,
		multipleOf: 1 as const,
	};
}
