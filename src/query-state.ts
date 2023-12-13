import { BehaviorSubject } from 'rxjs';

interface QueryState {
	id: string;
	state$: BehaviorSubject<any>;
}

export const createQueryState = (id: string, initialQuery: any): QueryState => {
	return {
		id,
		state$: new BehaviorSubject(initialQuery),
	};
};

export const updateQuery = (queryState: QueryState, newQuery: any) => {
	queryState.state$.next(newQuery);
};
