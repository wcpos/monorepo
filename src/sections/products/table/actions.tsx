import React from 'react';
import Button from '../../../components/button';
import Modal from '../../../components/modal';
import ProductModal from './modal';

type Props = {
	product: any;
};

const Actions = ({ product }: Props) => {
	const [visible, setVisible] = React.useState(false);

	const handleDelete = () => {
		product.destroyPermanently();
	};

	const handleShow = () => {
		setVisible(true);
	};

	return (
		<React.Fragment>
			<Button title="Delete" onPress={handleDelete} />
			<Button title="Show" onPress={handleShow} />
			{visible && (
				<Modal visible={visible}>
					<ProductModal product={product} setVisible={setVisible} />
				</Modal>
			)}
		</React.Fragment>
	);
};

export default Actions;
