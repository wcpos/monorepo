import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import ProductModal from './modal';

interface Props {
	product: any;
}

const Actions = ({ product }: Props) => {
	const [visible, setVisible] = React.useState(false);

	const handleSync = () => {
		const replicationState = product.syncRestApi({
			push: {},
		});
		replicationState.run(false);
	};

	const handleDelete = () => {
		product.remove();
	};

	return (
		<>
			<Button title="Show" onPress={() => setVisible(true)} />
			<Button title="Sync" onPress={handleSync} />
			<Button title="Delete" onPress={handleDelete} />
			{visible && <ProductModal product={product} onClose={() => setVisible(false)} />}
		</>
	);
};

export default Actions;
