import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

type Props = {
	attributes: import('@wcpos/database').ProductDocument['attributes'];
};

const ProductAttributes = ({ attributes = [] }: Props) => {
	return (
		<Box space="xxSmall">
			{attributes
				.filter((attr: any) => attr.variation)
				.map((attr: any) => (
					<Text key={`${attr.name}-${attr.id}`}>
						<Text size="small" type="secondary">{`${attr.name}: `}</Text>
						<Text size="small">{attr.options.join(', ')}</Text>
					</Text>
				))}
		</Box>
	);
};

export default ProductAttributes;
