import * as React from 'react';
import Format from '@wcpos/common/src/components/format';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

interface Props {
	item: any;
	column: any;
}

export const FormattedPrice = ({ item, column }: Props) => {
	// const { userDB, storeID } = useAppState();
	// const [currency, setCurrency] = React.useState();

	// // get currency settings
	// React.useEffect(() => {
	// 	async function fetchStore() {
	// 		if (storeID) {
	// 			const store = await userDB?.collections.stores.findOne(storeID).exec();
	// 			setCurrency(store?.accounting.currency);
	// 		}
	// 	}
	// 	fetchStore();
	// }, []);

	return <Format.Currency symbol="$">{item[column.key]}</Format.Currency>;
};

export default FormattedPrice;
