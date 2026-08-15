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
		childrenSearchCount?: number;
		parentSearchTerm?: string;
	}[];
}
