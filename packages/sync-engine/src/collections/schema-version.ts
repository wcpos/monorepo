export type PersistedSchedulerSchemaVersion = 1 | 2 | 3 | 4;

export type PersistedSchedulerSchemaVersionMarker<
	TVersion extends PersistedSchedulerSchemaVersion = PersistedSchedulerSchemaVersion,
> = {
	schemaVersion: TVersion;
};

export function markPersistedSchedulerDocument<
	T extends object,
	TVersion extends PersistedSchedulerSchemaVersion,
>(document: T, schemaVersion: TVersion): T & PersistedSchedulerSchemaVersionMarker<TVersion> {
	return { ...document, schemaVersion };
}
