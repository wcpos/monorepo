import * as React from 'react';

import Format from '@wcpos/react-native-jsonschema-format';

interface Props {
	item: any;
	column: any;
}

export const FormattedDate = ({ item, column }: Props) => {
	return item[column.key] ? <Format.Date value={item[column.key]} /> : null;
};

export default FormattedDate;
