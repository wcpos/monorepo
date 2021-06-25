import actions from './actions';
import Address from './address';
import customer from './customer';
import customerNote from './note';
import status from './status';

export default {
	actions,
	billing: Address,
	shipping: Address,
	customer,
	customerNote,
	status,
};
