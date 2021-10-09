export type InitialSiteProps = {
	description: string;
	gmtOffset: string;
	home: string;
	name: string;
	timezoneString: string;
	url: string;
	wcApiAuthUrl: string;
	wcApiUrl: string;
	wpApiUrl: string;
};

export type InitialStoresProps = {
	id: number;
	name: string;
};

export type InitialWpCredentialsProps = {
	displayName: string;
	email: string;
	firstName: string;
	id: number;
	lastAccess: string;
	lastName: string;
	niceName: string;
	username: string;
};

export type InitialProps = {
	homepage: string;
	manifest: string;
	site: InitialSiteProps;
	stores: InitialStoresProps;
	version: string;
	wpCredentials: InitialWpCredentialsProps;
};
