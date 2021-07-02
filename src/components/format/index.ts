import { FormatName, FormatNameProps } from './name';
import { FormatNumber, FormatNumberProps } from './number';
import { FormatList, FormatListProps } from './list';
import { FormatAddress, FormatAddressProps } from './address';
import FormatDate, { FormatDateProps } from './date';
import FormatCurrency, { FormatCurrencyProps } from './currency';

export type {
	FormatNameProps,
	FormatNumberProps,
	FormatListProps,
	FormatAddressProps,
	FormatDateProps,
	FormatCurrencyProps,
};
export default {
	Name: FormatName,
	Number: FormatNumber,
	List: FormatList,
	Address: FormatAddress,
	Date: FormatDate,
	Currency: FormatCurrency,
};
