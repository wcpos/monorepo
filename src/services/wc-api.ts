import http from './http';

class WcApiService {
	private baseUrl: string;
	private collection: string;
	private key: string;
	private secret: string;
	private http: any;

	constructor(args: { baseUrl: string; collection: string; key: string; secret: string }) {
		const { baseUrl, collection, key, secret } = args;
		this.baseUrl = baseUrl;
		this.collection = collection;
		this.key = key;
		this.secret = secret;

		// todo construct with args?
		this.http = http;
	}

	async fetch() {
		const { data } = await this.http(this.baseUrl + this.collection, {
			auth: {
				username: this.key,
				password: this.secret,
			},
		});
		return data;
	}
}

export default WcApiService;
