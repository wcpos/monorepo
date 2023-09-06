import { BehaviorSubject } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';

import type { Observable } from 'rxjs';

export class Paginator<T> {
	private pageSize: number;
	private currentPage: number;
	private isEndReached: boolean;
	private nextPageTrigger$ = new BehaviorSubject<number>(0);

	constructor(pageSize: number = 10) {
		this.pageSize = pageSize;
		this.currentPage = 0;
		this.isEndReached = false;
	}

	paginate(data$: Observable<T[]>): Observable<T[]> {
		return this.nextPageTrigger$.pipe(
			switchMap(() => data$),
			map((items) => {
				this.currentPage++;
				const end = this.currentPage * this.pageSize;
				const pageItems = items.slice(0, end);
				if (pageItems.length < end) {
					this.isEndReached = true;
				}
				return pageItems;
			})
		);
	}

	nextPage(): void {
		if (!this.isEndReached) {
			this.nextPageTrigger$.next();
		}
	}

	reset(): void {
		this.currentPage = 0;
		this.isEndReached = false;
	}

	hasMore(): boolean {
		return !this.isEndReached;
	}
}
