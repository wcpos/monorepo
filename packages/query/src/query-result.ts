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
	/**
	 * The parent ids a relation named from matching children, resident or not; an owner's
	 * targeted demand, never the read's. Present only on a relational read with a search term.
	 */
	relatedIds?: number[];
	hits: {
		id: string;
		record: DocumentType<TCollection>;
		childrenSearchCount?: number;
		parentSearchTerm?: string;
	}[];
}
