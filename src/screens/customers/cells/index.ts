import avatarUrl from './avatar';
import actions from './actions';
import Address from './address';
import Name from './name';
import email from './email';

export default {
	avatarUrl,
	firstName: Name,
	lastName: Name,
	email,
	billing: Address,
	shipping: Address,
	actions,
};
