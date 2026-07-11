import type { SyncCheckpoint } from '@wcpos/sync-core';

export type SyncCheckpointDocument = {
	id: string;
	checkpoint: SyncCheckpoint;
	updatedAt: string;
	/** The server's journal epoch as of the stored checkpoint (F8), or absent if never seen. */
	epoch?: string;
};

export const syncCheckpointSchema = {
	title: 'Woo/RxDB sync checkpoint schema',
	version: 1,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 128 },
		checkpoint: {
			type: 'object',
			properties: {
				updatedAtGmt: { type: 'string' },
				orderId: { type: 'number' },
				revision: { type: 'string' },
				sequence: { type: 'number' },
			},
			required: ['updatedAtGmt', 'orderId', 'revision', 'sequence'],
		},
		updatedAt: { type: 'string' },
		// F8 journal epoch — optional; a pre-F8 checkpoint doc simply has no epoch (treated as never-seen).
		epoch: { type: 'string' },
	},
	required: ['id', 'checkpoint', 'updatedAt'],
} as const;

export const syncCheckpointMigrationStrategies = {
	// v0 → v1: `epoch` is a new optional field (F8). Existing checkpoints carry no epoch and stay valid.
	1: (doc: SyncCheckpointDocument): SyncCheckpointDocument => doc,
};
