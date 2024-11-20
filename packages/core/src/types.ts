export type InitialSiteProps = {
	uuid: string;
	description: string;
	gmt_offset: string;
	home: string;
	name: string;
	timezone_string: string;
	url: string;
	wc_api_auth_url: string;
	wc_api_url: string;
	wp_api_url: string;
};

export type InitialStoresProps = {
	id: number;
	name: string;
};

export type InitialWpCredentialsProps = {
	uuid: string;
	display_name: string;
	email: string;
	firstN_nme: string;
	id: number;
	last_access: string;
	last_name: string;
	nice_name: string;
	username: string;
};

export type InitialProps = {
	homepage: string;
	manifest: string;
	site: InitialSiteProps;
	store?: InitialStoresProps;
	stores: InitialStoresProps[];
	version: string;
	wp_credentials: InitialWpCredentialsProps;
	store_id?: string;
};
