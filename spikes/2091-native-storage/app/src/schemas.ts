import { fillWithDefaultSettings, type RxJsonSchema } from 'rxdb/plugins/core';

import type { Doc } from './types';
const string = (maxLength: number) => ({ type: 'string', maxLength }),
	object = { type: 'object', additionalProperties: true };
const number = { type: 'number', minimum: 0, maximum: 100000000, multipleOf: 1 };
const productFields = {
	uuid: string(128),
	remoteId: string(64),
	price: { ...number, minimum: -100000000, multipleOf: 0.01 },
	stockStatus: string(24),
	type: string(24),
	categoryIds: { type: 'array', items: number },
	brandIds: { type: 'array', items: number },
	onSale: { type: 'boolean' },
	featured: { type: 'boolean' },
	stockQuantity: { type: ['number', 'null'] },
	payload: {
		...object,
		properties: { status: string(16), name: string(200) },
		required: ['status', 'name'],
	},
	sync: object,
	local: object,
};
const orderFields = {
	uuid: string(128),
	remoteId: number,
	number: string(64),
	dateCreatedGmt: string(32),
	status: string(32),
	total: { type: 'number' },
	customerId: number,
	payload: object,
	sync: object,
	local: object,
};
const definitions: [string, Record<string, unknown>, (string | string[])[]][] = [
	[
		'products',
		productFields,
		[
			'stockStatus',
			'price',
			['type', 'stockStatus'],
			'remoteId',
			'payload.status',
			['payload.status', 'stockStatus'],
			'payload.name',
		],
	],
	['orders', orderFields, [['dateCreatedGmt'], ['status', 'dateCreatedGmt'], 'remoteId']],
	[
		'mutations',
		{
			id: string(64),
			collection: string(32),
			operation: string(32),
			createdAt: number,
			payload: object,
		},
		[],
	],
];
export const schemas = Object.fromEntries(
	definitions.map(([name, properties, indexes]) => [
		name,
		fillWithDefaultSettings({
			version: 0,
			primaryKey: name === 'mutations' ? 'id' : 'uuid',
			type: 'object',
			properties,
			required: Object.keys(properties),
			indexes,
		} as unknown as RxJsonSchema<Doc>),
	])
);
