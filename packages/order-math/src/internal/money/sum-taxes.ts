import flatten from 'lodash/flatten';
import groupBy from 'lodash/groupBy';
import map from 'lodash/map';
import sumBy from 'lodash/sumBy';
import toNumber from 'lodash/toNumber';

/**
 *
 */
export function sumTaxes({ taxes }: { taxes: { total: number; [key: string]: any }[] }) {
	const sum = sumBy(taxes, (tax) => tax.total);
	return sum;
}

/**
 *
 */
export function sumItemizedTaxes({
	taxes,
}: {
	taxes: { id: number; total: number; [key: string]: any }[];
}) {
	// group taxes by id
	const groupedTaxes = groupBy(flatten(taxes), 'id');
	return map(groupedTaxes, (itemized, id) => ({
		id: toNumber(id), // groupBy converts the key to a string
		total: sumTaxes({ taxes: itemized }),
	}));
}
