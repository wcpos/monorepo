import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import EdittableText from '@wcpos/components/src/edittable-text';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const Name = ({ item: product }: Props) => {
	const name = useObservableState(product.name$, product.name);

	const handleChangeText = async (newValue: string) => {
		await product.atomicPatch({ name: newValue });
	};

	return <EdittableText label="Name" value={name} onChange={handleChangeText} hideLabel />;
};

export default Name;
