import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import { EdittableText } from '@wcpos/components/src/edittable-text';
import Text from '@wcpos/components/src/text';

import EditShippingLineButton from './edit-shipping-line';

interface Props {
	item: import('@wcpos/database').ShippingLineDocument;
}

export const ShippingTitle = ({ item }: Props) => {
	const methodTitle = useObservableState(item.method_title$, item.method_title);

	/**
	 *
	 */
	const handleUpdate = React.useCallback(
		(newValue: string) => {
			item.incrementalPatch({ method_title: newValue });
		},
		[item]
	);

	return (
		<Box horizontal space="xSmall" style={{ width: '100%' }}>
			<Box fill>
				<EdittableText weight="bold" onChange={handleUpdate}>
					{methodTitle}
				</EdittableText>
			</Box>
			<Box distribution="center">
				<EditShippingLineButton item={item} />
			</Box>
		</Box>
	);
};
