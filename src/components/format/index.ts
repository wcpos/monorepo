import { FormatName, FormatNameProps } from './name';
import { FormatNumber, FormatNumberProps } from './number';
import { FormatList, FormatListProps } from './list';
import { FormatAddress, FormatAddressProps } from './address';
import FormatDate, { FormatDateProps } from './date';

export type {
	FormatNameProps,
	FormatNumberProps,
	FormatListProps,
	FormatAddressProps,
	FormatDateProps,
};
export default {
	Name: FormatName,
	Number: FormatNumber,
	List: FormatList,
	Address: FormatAddress,
	Date: FormatDate,
};
