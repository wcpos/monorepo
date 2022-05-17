import * as React from 'react';
import EdittableText from '@wcpos/components/src/edittable-text';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const Name = ({ item: product }: Props) => {
	const handleChangeText = async (newValue: string) => {
		await product.atomicPatch({ name: newValue });
	};

	return <EdittableText label="Name" value={product.name} onChange={handleChangeText} hideLabel />;
};

export default Name;
