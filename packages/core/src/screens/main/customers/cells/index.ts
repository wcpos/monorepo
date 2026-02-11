import { Actions } from './actions';
import { Address } from './address';
import { Avatar } from './avatar';
import { CustomerEmail } from './email';
import { DateCell } from '../../components/date';

export const customerCells = {
	avatar_url: Avatar,
	billing: Address,
	shipping: Address,
	actions: Actions,
	email: CustomerEmail,
	date_created_gmt: DateCell,
	date_modified_gmt: DateCell,
};
