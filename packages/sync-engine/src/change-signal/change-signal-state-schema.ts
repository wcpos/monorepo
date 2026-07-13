/**
 * Durable change-signal engine state (A4). A single row holding the engine's
 * advanced cursor + integrity baselines + config-fingerprint baseline so a reload
 * restores where the freshness loop left off instead of re-priming to head.
 *
 * The engine state (`ReplicationActions['nextState']`) is stored as an opaque JSON
 * string — `BaselineDigests` is a `Map`, which RxDB can't model directly, so the
 * persistence layer (changeSignalStatePersistence.ts) handles the Map<->entries
 * round-trip and this schema stays a plain string blob.
 */
export type ChangeSignalStateDocument = {
	id: string;
	state: string;
	updatedAt: string;
};

export const CHANGE_SIGNAL_STATE_ID = 'change-signal:web';

export const changeSignalStateSchema = {
	title: 'Woo/RxDB change-signal engine state schema',
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 64 },
		state: { type: 'string' },
		updatedAt: { type: 'string' },
	},
	required: ['id', 'state', 'updatedAt'],
} as const;
