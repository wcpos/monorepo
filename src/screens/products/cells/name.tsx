import * as React from 'react';
import TextInput from '@wcpos/components/src/textinput';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const Name = ({ item: product }: Props) => {
	const handleChangeText = async (newValue: string) => {
		await product.atomicPatch({ name: newValue });
	};

	return <TextInput label="Name" value={product.name} onChange={handleChangeText} hideLabel />;
};

export default Name;
