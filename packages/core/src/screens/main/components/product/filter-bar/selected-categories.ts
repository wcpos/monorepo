import { combineLatest, Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { isRxDocument } from 'rxdb';

import type { Option } from '@wcpos/components/combobox/types';

import { pullDocumentSafely } from '../../filter-bar/pull-document-safely';

type ProductCategoryCollection = import('@wcpos/database').ProductCategoryCollection;
type ProductCategoryDocument = import('@wcpos/database').ProductCategoryDocument;

type PullDocument = (id: number, collection: ProductCategoryCollection) => Promise<unknown>;

interface CreateSelectedCategoryOptionsParams {
	ids: number[] | undefined;
	collection: ProductCategoryCollection;
	pullDocument: PullDocument;
	loadingLabel: string;
}

function getCategoryName(
	doc: ProductCategoryDocument | { name?: string } | null
): string | undefined {
	if (!doc) return undefined;
	if (isRxDocument(doc)) {
		return (doc as ProductCategoryDocument).get('name') as string | undefined;
	}
	return doc.name;
}

export function createSelectedCategoryOptions$({
	ids,
	collection,
	pullDocument,
	loadingLabel,
}: CreateSelectedCategoryOptionsParams): Observable<Option[]> {
	if (!ids || ids.length === 0) {
		return of([]);
	}

	const pullsInFlight = new Set<number>();
	const selectedCategoryStreams = ids.map((id) =>
		collection.findOne({ selector: { id } }).$.pipe(
			tap((doc) => {
				if (!doc && !pullsInFlight.has(id)) {
					pullsInFlight.add(id);
					queueMicrotask(() => {
						void pullDocumentSafely(pullDocument, id, collection).finally(() =>
							pullsInFlight.delete(id)
						);
					});
				}
			}),
			map((doc) => ({
				value: String(id),
				label: getCategoryName(doc as ProductCategoryDocument | null) ?? loadingLabel,
			}))
		)
	);

	return combineLatest(selectedCategoryStreams);
}
