import actions from './actions';
import address from './address';
import avatar_url from './avatar';
import email from './email';
import name from './name';

export default {
	avatar_url,
	first_name: name,
	last_name: name,
	email,
	billing: address,
	shipping: address,
	actions,
};
