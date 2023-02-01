import { faker } from '@faker-js/faker';
import { v4 as uuidv4 } from 'uuid';

export const productDefaultSchema = {
	title: 'product schema',
	version: 0,
	description: 'describes a store product',
	keyCompression: false,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: {
			type: 'string',
			maxLength: 36,
		},
		name: {
			type: 'string',
		},
		price: {
			type: 'string',
		},
	},
	indexes: [],
};

export const generateProduct = (
	uuid: string = uuidv4(),
	name: string = faker.commerce.productName(),
	price: string = faker.commerce.price()
) => {
	return {
		uuid,
		name,
		price,
	};
};
