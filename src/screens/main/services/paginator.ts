import { RxDocument } from 'rxdb';
import { BehaviorSubject, Subscription } from 'rxjs';
import { switchMap, map, tap } from 'rxjs/operators';

import type { Observable } from 'rxjs';

/**
 *
 */
export class PaginatorService<T> {
	public readonly subs: Subscription[] = [];
	private isEndReached: boolean = false;

	public readonly subjects = {
		currentPage: new BehaviorSubject<number>(1),
		result: new BehaviorSubject<RxDocument<T>[]>([]),
	};

	readonly currentPage$: Observable<number> = this.subjects.currentPage.asObservable();
	readonly result$: Observable<RxDocument<T>[]> = this.subjects.result.asObservable();

	constructor(
		private readonly data$: Observable<RxDocument<T>[]>,
		private readonly pageSize: number = 10
	) {
		/**
		 * Subscribe to currentPage$
		 */
		this.subs.push(
			this.data$
				.pipe(
					switchMap((items) =>
						this.currentPage$.pipe(
							map((currentPage) => {
								const end = currentPage * this.pageSize;
								const pageItems = items.slice(0, end);
								this.isEndReached = pageItems.length < end;
								return pageItems;
							})
						)
					)
				)
				.subscribe(this.subjects.result)
		);
	}

	/**
	 * Exposing a BehaviorSubject as an Observable means we can subscribe many times
	 * without having to run the logic each subscription. This is useful for the UI,
	 * where we want to subscribe to the same data in multiple places.
	 */
	get $(): Observable<T[]> {
		return this.result$;
	}

	nextPage(): void {
		if (!this.isEndReached) {
			const page = this.subjects.currentPage.value + 1;
			this.subjects.currentPage.next(page);
		}
	}

	reset(): void {
		this.isEndReached = false;
		this.subjects.currentPage.next(1);
	}

	hasMore(): boolean {
		return !this.isEndReached;
	}

	cancel() {
		this.subs.forEach((sub) => sub.unsubscribe());

		this.subjects.currentPage.complete();
		this.subjects.result.complete();
	}
}
