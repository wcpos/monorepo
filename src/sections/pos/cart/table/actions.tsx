import React from 'react';
import Button from '../../../../components/button';

type Props = {
	item: any;
};

const Actions = ({ item }: Props) => {
	const destroyItem = async () => {
		// await item.collection.database.action(async () => {
		// 	item.experimentalDestroyPermanently();
		// });
		await item.destroy();
	};

	return <Button title="X" onPress={destroyItem} />;
};

export default Actions;
