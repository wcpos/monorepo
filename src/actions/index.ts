import { ajax } from 'rxjs/ajax';
import { map, catchError } from 'rxjs/operators';

const user = {
	id: 1,
	username: 'kilbot',
	first_name: 'Paul',
	last_name: 'Kilmurray',
	display_name: undefined,
	email: undefined,
	key_id: undefined,
	consumer_key: 'ck_1a29408e838b208753db0ca57278e85f5fb7e06a',
	consumer_secret: 'cs_bfe153d029365e6f761ed88812fa3cc36d5b179e',
	last_access: undefined,
};

export async function sync(type: string) {
	return await ajax({
		url: 'https://dev.local/wp/latest/wp-json/wc/v3/' + type,
		withCredentials: true,
		user: user.consumer_key,
		password: user.consumer_secret,
		headers: {
			Authorization:
				'Basic Y2tfMWEyOTQwOGU4MzhiMjA4NzUzZGIwY2E1NzI3OGU4NWY1ZmI3ZTA2YTpjc19iZmUxNTNkMDI5MzY1ZTZmNzYxZWQ4ODgxMmZhM2NjMzZkNWIxNzll',
			'X-WCPOS': '1',
		},
	}).pipe(
		map(ajaxResponse => ajaxResponse.response),
		// @ts-ignore
		catchError(error => console.log('error: ', error))
	);
}
