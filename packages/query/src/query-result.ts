import type { RxCollection, RxDocument } from 'rxdb';

type DocumentType<C> =
	C extends RxCollection<infer DocumentData>
		? RxDocument<DocumentData>
		: RxDocument<Record<string, unknown>>;

export interface QueryResult<TCollection = RxCollection> {
	elapsed: number;
	searchActive: boolean;
	count?: number;
	hits: {
		id: string;
		score: number;
		document: DocumentType<TCollection>;
		positions?: Record<string, object>;
		childrenSearchCount?: number;
		parentSearchTerm?: string;
	}[];
}
