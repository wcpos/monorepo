// note: settings schema is ignored for now
import schema from './schema.json';

export type PaymentGatewaySchema = import('./interface').WooCommercePaymentGatewaySchema;
export type PaymentGatewayDocument = import('rxdb').RxDocument<
	PaymentGatewaySchema,
	PaymentGatewayMethods
>;
export type PaymentGatewayCollection = import('rxdb').RxCollection<
	PaymentGatewayDocument,
	PaymentGatewayMethods,
	PaymentGatewayStatics
>;

type PaymentGatewayStatics = Record<string, never>;
type PaymentGatewayMethods = Record<string, never>;

/**
 *
 */
export const gateways = {
	schema,
	// statics,
	// methods,
	// attachments: {},
	// options: {
	// 	middlewares: {
	// 	},
	// },
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
