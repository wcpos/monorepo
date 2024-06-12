import actions from './actions';
import address from './address';
import avatar_url from './avatar';
import email from './email';
import { Date } from '../../components/date';

export default {
	avatar_url,
	billing: address,
	shipping: address,
	actions,
	email,
	date_created_gmt: Date,
	date_modified_gmt: Date,
};
