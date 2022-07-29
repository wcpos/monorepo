import avatar_url from './avatar';
import actions from './actions';
import address from './address';
import name from './name';
import email from './email';

export default {
	avatar_url,
	first_name: name,
	last_name: name,
	email,
	billing: address,
	shipping: address,
	actions,
};
