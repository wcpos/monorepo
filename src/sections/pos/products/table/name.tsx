import React, { Fragment } from 'react';
import Text from '../../../../components/text';
import useAPI from '../../../../hooks/use-api';

interface Props {
	product: any;
	display: any;
}

const Variations = ({ product }) => {
	// const variations = useAPI('products/' + product.remote_id + '/variations');
	return <Text>Variations</Text>;
};

const Name = ({ product, display }: Props) => {
	const show = property => {
		return true;
	};

	return (
		<Fragment>
			<Text>{product.name}</Text>
			{show('sku') && <Text size="small">{product.sku}</Text>}
			{product.isVariable() && <Variations product={product} />}
		</Fragment>
	);
};

export default Name;
