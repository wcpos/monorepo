import { Actions } from './actions';
import { Address } from './address';
import { Avatar } from './avatar';
import { CustomerEmail } from './email';
import { RecordDateCell } from '../../components/record-date-cell';

export const customerCells = {
	avatar_url: Avatar,
	billing: Address,
	shipping: Address,
	actions: Actions,
	email: CustomerEmail,
	date_created_gmt: RecordDateCell,
	date_modified_gmt: RecordDateCell,
};
