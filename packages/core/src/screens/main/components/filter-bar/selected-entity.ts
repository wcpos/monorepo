import { Observable, of } from 'rxjs';
import { filter, map, startWith, switchMap } from 'rxjs/operators';

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
	fallbackOnEmpty?: boolean;
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

function resultBelongsToSelectedId<T extends { id?: string | number }>(
	result: QueryResult<T>,
	id: string | number
): boolean {
	const isSingleHit =
		result.count === 1 || (result.count === undefined && result.hits.length === 1);

	if (!isSingleHit) {
		return true;
	}

	const documentID = result.hits[0]?.document?.id;

	return documentID === undefined || String(documentID) === String(id);
}

export function createSelectedEntity$<T extends { id?: string | number }>({
	id,
	result$,
	guestCustomer,
	fallbackOnEmpty = true,
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
		filter((result) => resultBelongsToSelectedId(result, id)),
		map((result) => {
			if (result.count === 1 || (result.count === undefined && result.hits.length === 1)) {
				return result.hits[0].document;
			}

			if (result.count === 0 || (result.count === undefined && result.hits.length === 0)) {
				return fallbackOnEmpty ? ({ id } as T) : createLoadingEntity<T>(id);
			}

			return null;
		}),
		startWith(createLoadingEntity<T>(id))
	);
}

export type SelectedEntityInput<T extends { id?: string | number }> = readonly [
	id: string | number | null | undefined,
	result$: Observable<QueryResult<T>> | undefined,
	guestCustomer?: T,
	fallbackOnEmpty?: boolean,
];

export function createSelectedEntityFromInputs$<T extends { id?: string | number }>(
	inputs$: Observable<SelectedEntityInput<T>>
): Observable<T | null> {
	return inputs$.pipe(
		switchMap(([id, result$, guestCustomer, fallbackOnEmpty]) =>
			createSelectedEntity$({
				id,
				result$,
				guestCustomer,
				fallbackOnEmpty,
			})
		)
	);
}
