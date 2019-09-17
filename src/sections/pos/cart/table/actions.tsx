import React from 'react';
import Button from '../../../../components/button';
import useDatabase from '../../../../hooks/use-database';

type Props = {
	item: any;
};

const Actions = ({ item }: Props) => {
	const { storeDB } = useDatabase();

	const destroyItem = async () => {
		await storeDB.action(async () => {
			await item.destroyPermanently();
		});
	};

	return <Button title="X" onPress={destroyItem} />;
};

export default Actions;
