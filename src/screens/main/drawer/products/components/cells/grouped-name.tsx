import * as React from 'react';

import find from 'lodash/find';
import { useObservableState, ObservableResource, useObservableSuspense } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, tap, map } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import EdittableText from '@wcpos/components/src/edittable-text';
import Text from '@wcpos/components/src/text';

interface Props {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
}

/**
 * @TODO - this needs to be in a Product provider, because products may not be downlaoded yet
 */
const GroupedNames = ({ groupedResource }) => {
	const grouped = useObservableSuspense(groupedResource);
	const names = grouped.map((doc) => doc.name);

	return (
		<Text>
			<Text size="small" type="secondary">
				Grouped:{' '}
			</Text>
			<Text size="small">{names.join(', ')}</Text>
		</Text>
	);
};

/**
 *
 */
const GroupedName = ({ item: product, column }: Props) => {
	const { display } = column;
	const name = useObservableState(product.name$, product.name);

	/**
	 *
	 */
	const handleChangeText = async (newValue: string) => {
		await product.atomicPatch({ name: newValue });
	};

	/**
	 *
	 */
	const groupedResource = React.useMemo(
		() =>
			new ObservableResource(
				product.grouped_products$.pipe(
					switchMap((ids) => product.collection.find({ selector: { id: { $in: ids } } }).$)
				)
			),
		[product.collection, product.grouped_products$]
	);

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	/**
	 *
	 */

	return (
		<Box space="xSmall">
			<EdittableText
				label="Name"
				value={name}
				onChange={handleChangeText}
				hideLabel
				weight="bold"
			/>

			<GroupedNames groupedResource={groupedResource} />
		</Box>
	);
};

export default GroupedName;
