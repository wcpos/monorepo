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
		return of({ id } as T);
	}

	return result$.pipe(
		map((result) => {
			if (result.count === 1) {
				return result.hits[0].document;
			}

			return null;
		}),
		startWith({ id } as T)
	);
}
