import type { RxCollection, RxDocument } from 'rxdb';

type DocumentType<C> =
	C extends RxCollection<infer DocumentData>
		? RxDocument<DocumentData>
		: RxDocument<Record<string, unknown>>;

export interface QueryResult<TCollection = RxCollection> {
	searchActive?: boolean;
	/**
	 * Meaningful only while a search term is active. 'pending' marks a result
	 * that is NOT an answer to the search (the empty placeholder emitted before
	 * the engine database is bound); 'answered' marks a result derived from an
	 * actual search execution — indexed or document scan. The empty state must
	 * render "no products found" only for 'answered' results: a pending empty
	 * rendered as "not found" is indistinguishable from a missing product to the
	 * cashier (#1733).
	 */
	searchState?: 'pending' | 'answered';
	count?: number;
	hits: {
		id: string;
		record: DocumentType<TCollection>;
		childrenSearchCount?: number;
		parentSearchTerm?: string;
	}[];
}
