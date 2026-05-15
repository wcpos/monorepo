const STRING_FIELDS = [
	'uuid',
	'username',
	'first_name',
	'last_name',
	'email',
	'display_name',
	'nice_name',
	'last_access',
	'avatar_url',
	'access_token',
	'refresh_token',
	'date_created_gmt',
	'date_modified_gmt',
] as const;

type StringField = (typeof STRING_FIELDS)[number];

export type WPCredentialsData = Partial<Record<StringField, string>> & {
	id?: number;
	expires_at?: number;
	roles?: string[];
	stores?: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeStringArray = (value: unknown): string[] | undefined => {
	if (!Array.isArray(value)) {
		return undefined;
	}

	return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
};

const sanitizeRoles = (data: Record<string, unknown>): string[] | undefined => {
	const roles = sanitizeStringArray(data.roles);
	if (roles && roles.length > 0) {
		return roles;
	}

	return typeof data.role === 'string' && data.role.length > 0 ? [data.role] : undefined;
};

/**
 * Normalize server and legacy wp_credentials payloads before they are written
 * into RxDB. The schema is strict, so OAuth response metadata such as
 * token_type must not be persisted or old IndexedDB rows can fail migration.
 */
export const sanitizeWPCredentialsData = (data: unknown): WPCredentialsData => {
	if (!isRecord(data)) {
		return {};
	}

	const sanitized: WPCredentialsData = {};

	for (const field of STRING_FIELDS) {
		if (typeof data[field] === 'string') {
			sanitized[field] = data[field];
		}
	}

	if (typeof data.id === 'number') {
		sanitized.id = data.id;
	}

	if (typeof data.expires_at === 'number') {
		sanitized.expires_at = data.expires_at;
	}

	const roles = sanitizeRoles(data);
	if (roles !== undefined) {
		sanitized.roles = roles;
	}

	const stores = sanitizeStringArray(data.stores);
	if (stores !== undefined) {
		sanitized.stores = stores;
	}

	return sanitized;
};
