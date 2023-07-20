import * as React from 'react';

import { useObservableRef } from 'observable-hooks';

type ProductDocument = import('@wcpos/database/src/collections/products').ProductDocument;

/**
 *
 */
const useVariationsQuery = () => {
	const [shownVariations, shownVariations$] = useObservableRef({});

	/**
	 *
	 */
	const setVariationsQuery = React.useCallback(
		(parent: ProductDocument, attribute: { name: string; option: string }) => {
			const { uuid, variations } = parent;
			const queryMap = { ...shownVariations.current }; // Create a copy of the current queryMap

			if (!queryMap[uuid]) {
				queryMap[uuid] = {
					parent,
					query: {
						selector: {
							attributes: { $allMatch: [] },
						},
					},
				};
			}

			if (attribute !== undefined) {
				const queryList = queryMap[uuid].query.selector.attributes.$allMatch;
				const existingQueryIndex = queryList.findIndex((q) => q.name === attribute.name);
				if (existingQueryIndex === -1) {
					queryList.push(attribute);
				} else {
					queryList[existingQueryIndex] = attribute;
				}
			} else {
				delete queryMap[uuid];
			}

			shownVariations.current = queryMap;
		},
		[shownVariations]
	);

	return { shownVariations$, setVariationsQuery };
};

export default useVariationsQuery;
