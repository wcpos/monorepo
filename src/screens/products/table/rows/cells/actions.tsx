import * as React from 'react';
import Button from '@wcpos/common/src/components/button';
import Dialog from '@wcpos/common/src/components/dialog';
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
			{visible && (
				<Dialog
					sectioned
					title={product.name}
					open={visible}
					onClose={() => setVisible(false)}
					primaryAction={{ label: 'Got it!', action: () => setVisible(false) }}
					secondaryActions={[
						{ label: 'I am dumb', action: () => setVisible(false) },
						{ label: 'Share', action: () => setVisible(false) },
					]}
				>
					<ProductModal product={product} setVisible={setVisible} />
				</Dialog>
			)}
		</>
	);
};

export default Actions;
