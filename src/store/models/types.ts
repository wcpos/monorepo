export interface MetaDatumProps {
	id?: number;
	key: string;
	value: string;
}

export type MetaDataProps = MetaDatumProps[];

export interface BillingProps {
	first_name: string;
	last_name: string;
	company: string;
	address_1: string;
	address_2: string;
	city: string;
	state: string;
	postcode: string;
	country: string;
	email: string;
	phone: string;
}

export interface ShippingProps {
	first_name: string;
	last_name: string;
	company: string;
	address_1: string;
	address_2: string;
	city: string;
	state: string;
	postcode: string;
	country: string;
}

export interface CustomerQuery {
	context: 'view' | 'edit';
	page: number;
	per_page: number;
	search: string;
	sFields: ('id' | 'first_name' | 'last_name')[];
	exclude: number[];
	include: number[];
	offset: number;
	order: 'asc' | 'desc';
	orderby: 'id' | 'include' | 'name' | 'registered_date';
	email: string;
	role:
	| 'all'
	| 'administrator'
	| 'editor'
	| 'author'
	| 'contributor'
	| 'subscriber'
	| 'customer'
	| 'shop_manager';
}

export interface Customer {
	first_name: string;
	last_name: string;
}

export type Customers = Customer[];
