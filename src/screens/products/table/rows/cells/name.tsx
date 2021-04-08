import * as React from 'react';
import TextInput from '@wcpos/common/src/components/textinput';

type ProductDocument = import('@wcpos/common/src/database/products').ProductDocument;

interface Props {
	product: ProductDocument;
}

const Name = ({ product }: Props) => {
	const handleChangeText = async (newValue: string) => {
		await product.atomicPatch({ name: newValue });
	};

	return <TextInput value={product.name} onChangeText={handleChangeText} />;
};

export default Name;
