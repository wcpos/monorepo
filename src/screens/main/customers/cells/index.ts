import { Actions } from './actions';
import { Address } from './address';
import { Avatar } from './avatar';
import { CustomerEmail } from './email';
import { Date } from '../../components/date';

export default {
	avatar_url: Avatar,
	billing: Address,
	shipping: Address,
	actions: Actions,
	email: CustomerEmail,
	date_created_gmt: Date,
	date_modified_gmt: Date,
};
