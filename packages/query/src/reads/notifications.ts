import { type Observable, of } from 'rxjs';
import { map, skip, startWith, switchMap } from 'rxjs/operators';

import { observeFollowedCollection } from '../use-local-collection';

import type { NotificationRow, StoreLocalDatabase } from './store-local';

/**
 * Clear the old session's list and badge counts before each new query answers, including
 * store/subscriber switches and in-place resets. Logout must emit [], not EMPTY: the provider
 * outlives logout, so silence would leave the previous session's notifications on screen.
 */
export function observeNotifications(
	database: StoreLocalDatabase,
	subscriberId: string | null
): Observable<NotificationRow[]> {
	return observeFollowedCollection<NotificationRow>(database, 'notifications').pipe(
		switchMap((collection) =>
			collection && subscriberId !== null
				? collection.find({ selector: { subscriberId }, sort: [{ createdAt: 'desc' }] }).$.pipe(
						map((docs) => docs.map((doc) => doc.toJSON())),
						startWith([])
					)
				: of([])
		)
	);
}

/** In-place replacements for this database only, excluding the initial binding. */
export function observeNotificationsReplaced(database: StoreLocalDatabase): Observable<void> {
	return observeFollowedCollection<NotificationRow>(database, 'notifications').pipe(
		skip(1),
		map(() => undefined)
	);
}
