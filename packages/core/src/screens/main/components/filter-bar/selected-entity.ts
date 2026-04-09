import { Observable, of } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

interface QueryHit<T> {
	document: T;
}

interface QueryResult<T> {
	count?: number;
	hits: QueryHit<T>[];
}

interface CreateSelectedEntityOptions<T> {
	id: string | number | null | undefined;
	result$?: Observable<QueryResult<T>>;
	guestCustomer?: T;
}

interface LoadingSelectedEntity {
	id: string | number;
	__isLoading: true;
	first_name: string;
}

function createLoadingEntity<T extends { id?: string | number }>(
	id: string | number
): T & LoadingSelectedEntity {
	return {
		id,
		__isLoading: true,
		first_name: 'Loading...',
	} as unknown as T & LoadingSelectedEntity;
}

export function createSelectedEntity$<T extends { id?: string | number }>({
	id,
	result$,
	guestCustomer,
}: CreateSelectedEntityOptions<T>): Observable<T | null> {
	if (id === 0) {
		return of((guestCustomer ?? ({ id: 0 } as T)) as T);
	}

	if (id === null || id === undefined || id === '') {
		return of(null);
	}

	if (!result$) {
		return of(createLoadingEntity<T>(id));
	}

	return result$.pipe(
		map((result) => {
			if (result.count === 1 || (result.count === undefined && result.hits.length === 1)) {
				return result.hits[0].document;
			}

			if (result.count === 0 || (result.count === undefined && result.hits.length === 0)) {
				return { id } as T;
			}

			return null;
		}),
		startWith(createLoadingEntity<T>(id))
	);
}
