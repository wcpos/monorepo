import * as React from 'react';
import Format from '@wcpos/common/src/components/format';

interface Props {
	item: any;
	column: any;
}

export const FormattedDate = ({ item, column }: Props) => {
	return item[column.key] ? <Format.Date value={item[column.key]} /> : null;
};

export default FormattedDate;
