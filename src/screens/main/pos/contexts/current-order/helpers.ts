import isEmpty from 'lodash/isEmpty';

/**
 *
 */
export const addItem = async (currentOrder, $push) =>
	currentOrder.incrementalUpdate({
		$push,
	});

/**
 *
 */
export const increaseQuantity = async (lineItem) =>
	lineItem.incrementalUpdate({
		$inc: {
			quantity: 1,
		},
	});

/**
 *
 */
const filteredMetaData = (metaData) => (metaData || []).filter((md) => !md.key.startsWith('_'));

/**
 *
 */
export const priceToNumber = (price?: string) => parseFloat(isEmpty(price) ? '0' : price);

/**
 *
 */
export const getDateCreated = () => {
	const date = new Date();
	const dateGmt = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	const date_created = date.toISOString().split('.')[0];
	const date_created_gmt = dateGmt.toISOString().split('.')[0];
	return { date_created, date_created_gmt };
};

/**
 *
 */
export const processNewOrder = async (order, ordersCollection, data) => {
	await order.remove();
	const newOrder = await ordersCollection.insert({
		...order.toJSON(),
		...getDateCreated(),
		...data,
	});
	return newOrder;
};

/**
 *
 */
export const processExistingOrder = async (order, product, existing) => {
	if (existing.length === 1) {
		await increaseQuantity(existing[0]);
	} else {
		await addItem(order, { line_items: product });
	}
};
