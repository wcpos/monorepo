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
		record: DocumentType<TCollection>;
		childrenSearchCount?: number;
		parentSearchTerm?: string;
	}[];
}
