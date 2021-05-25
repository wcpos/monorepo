import * as React from 'react';
import TextInput from '@wcpos/common/src/components/textinput';

type ProductDocument = import('@wcpos/common/src/database').ProductDocument;

interface Props {
	product: ProductDocument;
}

const Name = ({ product }: Props) => {
	const handleChangeText = async (newValue: string) => {
		await product.atomicPatch({ name: newValue });
	};

	return <TextInput label="Name" value={product.name} onChange={handleChangeText} />;
};

export default Name;
