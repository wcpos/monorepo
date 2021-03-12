import * as React from 'react';
import Button from '../../../../../components/button';
import Modal from '../../../../../components/modal';
import ProductModal from './modal';

interface Props {
	product: any;
}

const Actions = ({ product }: Props) => {
	const [visible, setVisible] = React.useState(false);

	const handleSync = () => {
		console.log('sync');
	};

	const handleDelete = () => {
		product.remove();
	};

	return (
		<>
			<Button title="Show" onPress={() => setVisible(true)} />
			<Button title="Sync" onPress={handleSync} />
			<Button title="Delete" onPress={handleDelete} />
			{visible && (
				<Modal visible={visible}>
					<ProductModal product={product} setVisible={setVisible} />
				</Modal>
			)}
		</>
	);
};

export default Actions;
