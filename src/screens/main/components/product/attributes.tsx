import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

type Props = {
	attributes: import('@wcpos/database').ProductDocument['attributes'];
	isExpanded: boolean;
	toggleVariations: () => void;
};

const ProductAttributes = ({ attributes = [] }: Props) => {
	// const [isExpanded, setIsExpanded] = React.useState(false);

	/**
	 *
	 */
	// const handlePress = React.useCallback(
	// 	(name, option) => {
	// 		setIsExpanded((prev) => !prev);
	// 		toggleVariations({ name, option });
	// 	},
	// 	[toggleVariations]
	// );

	/**
	 *
	 */
	return (
		<Box space="xxSmall">
			{attributes
				.filter((attr: any) => attr.variation)
				.map((attr: any) => (
					<Text key={`${attr.name}-${attr.id}`}>
						<Text size="small" type="secondary">{`${attr.name}: `}</Text>
						{attr.options.map((option: string, index: number) => (
							<React.Fragment key={option}>
								<Text size="small">{option}</Text>
								{index < attr.options.length - 1 && ', '}
							</React.Fragment>
						))}
					</Text>
				))}
			{/* <Link size="small" onPress={() => handlePress()}>
				{isExpanded
					? t('Collapse all variations', { _tags: 'core' })
					: t('Expand all variations', { _tags: 'core' })}
			</Link> */}
		</Box>
	);
};

export default ProductAttributes;
