import type { ConflictResolutionChoice } from '@wcpos/sync-engine';

import { resolveQueuedChange } from '../../src/mutations';

it.each<ConflictResolutionChoice>(['retry-with-server-base', 'requeue-rebuilt', 'discard'])(
	'forwards %s and the mutation id unchanged',
	async (resolution) => {
		const engine = { resolveConflict: jest.fn().mockResolvedValue(undefined) };
		await resolveQueuedChange(engine, 'mutation-123', resolution);
		expect(engine.resolveConflict).toHaveBeenCalledTimes(1);
		expect(engine.resolveConflict).toHaveBeenCalledWith('mutation-123', resolution);
	}
);

it('propagates the original resolution error to the panel', async () => {
	const error = new Error('follower cannot resolve');
	const engine = { resolveConflict: jest.fn().mockRejectedValue(error) };
	await expect(resolveQueuedChange(engine, 'mutation-123', 'discard')).rejects.toBe(error);
});
