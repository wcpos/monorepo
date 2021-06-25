import * as React from 'react';
import TextInput from '@wcpos/common/src/components/textinput';

type Props = {
	item: import('@wcpos/common/src/database').ProductDocument;
};

const Name = ({ item: product }: Props) => {
	const handleChangeText = async (newValue: string) => {
		await product.atomicPatch({ name: newValue });
	};

	return <TextInput label="Name" value={product.name} onChange={handleChangeText} hideLabel />;
};

export default Name;
