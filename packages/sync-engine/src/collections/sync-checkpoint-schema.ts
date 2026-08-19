import type { SyncCheckpoint } from '@wcpos/sync-core';

export type SyncCheckpointDocument = {
	/** The engine-internal checkpoint key (one row per checkpoint stream). */
	checkpointKey: string;
	checkpoint: SyncCheckpoint;
	updatedAt: string;
	/** The server's journal epoch as of the stored checkpoint (F8), or absent if never seen. */
	epoch?: string;
};

export const syncCheckpointSchema = {
	title: 'Woo/RxDB sync checkpoint schema',
	version: 0,
	primaryKey: 'checkpointKey',
	type: 'object',
	properties: {
		checkpointKey: { type: 'string', maxLength: 128 },
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
	required: ['checkpointKey', 'checkpoint', 'updatedAt'],
} as const;
