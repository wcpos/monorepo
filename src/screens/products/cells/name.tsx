import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import EdittableText from '@wcpos/components/src/edittable-text';
import Text from '@wcpos/components/src/text';
import Box from '@wcpos/components/src/box';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const Name = ({ item: product }: Props) => {
	const name = useObservableState(product.name$, product.name);

	const handleChangeText = async (newValue: string) => {
		await product.atomicPatch({ name: newValue });
	};

	return (
		<Box space="small">
			<EdittableText
				label="Name"
				value={name}
				onChange={handleChangeText}
				hideLabel
				weight="bold"
			/>
			{product.type === 'variable' && (
				<Box space="xxSmall">
					{product.attributes
						.filter((attr: any) => attr.variation)
						.map((attr: any) => (
							<Text key={`${attr.name}-${attr.id}`}>
								<Text size="small" type="secondary">{`${attr.name}: `}</Text>
								<Text size="small">{attr.options.join(', ')}</Text>
							</Text>
						))}
				</Box>
			)}
		</Box>
	);
};

export default Name;
