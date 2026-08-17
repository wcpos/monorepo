import type { RxCollection, RxDocument } from 'rxdb';

type DocumentType<C> =
	C extends RxCollection<infer DocumentData>
		? RxDocument<DocumentData>
		: RxDocument<Record<string, unknown>>;

export interface QueryResult<TCollection = RxCollection> {
	searchActive?: boolean;
	count?: number;
	hits: {
		id: string;
		document: DocumentType<TCollection>;
		/** Native engine record when the result comes from an engine query. */
		record?: DocumentType<TCollection>;
		childrenSearchCount?: number;
		parentSearchTerm?: string;
	}[];
}
