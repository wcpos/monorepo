import { firstValueFrom, NEVER, of } from 'rxjs';
import { take, toArray } from 'rxjs/operators';

import { createSelectedEntity$ } from './selected-entity';

describe('createSelectedEntity$', () => {
	it('emits a placeholder immediately when a cashier id exists but the lookup query has not resolved yet', async () => {
		const selected$ = createSelectedEntity$({
			id: '42',
			result$: NEVER,
		});

		await expect(firstValueFrom(selected$)).resolves.toEqual({ id: '42' });
	});

	it('emits a placeholder first, then the resolved customer document when the lookup query completes', async () => {
		const selected$ = createSelectedEntity$({
			id: 7,
			result$: of({
				count: 1,
				hits: [{ document: { id: 7, name: 'Ada' } }],
			}),
		});

		await expect(firstValueFrom(selected$.pipe(take(2), toArray()))).resolves.toEqual([
			{ id: 7 },
			{ id: 7, name: 'Ada' },
		]);
	});

	it('returns the guest customer when the selected id is 0', async () => {
		const guestCustomer = { id: 0, name: 'Guest' };
		const selected$ = createSelectedEntity$({
			id: 0,
			result$: NEVER,
			guestCustomer,
		});

		await expect(firstValueFrom(selected$)).resolves.toBe(guestCustomer);
	});

	it('returns null when there is no selected id', async () => {
		const selected$ = createSelectedEntity$({
			id: undefined,
			result$: NEVER,
		});

		await expect(firstValueFrom(selected$)).resolves.toBeNull();
	});

	it('emits a placeholder when a selected id exists but the lookup query is unavailable', async () => {
		const selected$ = createSelectedEntity$({
			id: '42',
			result$: undefined as any,
		});

		await expect(firstValueFrom(selected$)).resolves.toEqual({ id: '42' });
	});
});
