import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { schema as productSchema } from './product';
import { schema as productVariationSchema } from './product_variation';
import { schema as orderSchema } from './order';
import { schema as orderLineItemSchema } from './order_line_item';
import { schema as customerSchema } from './customer';
import { schema as uiSchema } from './ui';
import { schema as uiColumnSchema } from './ui_column';

const schema = appSchema({
	version: 21,
	tables: [
		tableSchema(productSchema),
		tableSchema(productVariationSchema),
		tableSchema(orderSchema),
		tableSchema(orderLineItemSchema),
		tableSchema(customerSchema),
		tableSchema(uiSchema),
		tableSchema(uiColumnSchema),
	],
});

export default schema;
