import * as React from 'react';
import { View } from 'react-native';
import { useObservableState, useObservable, useObservableSuspense } from 'observable-hooks';
import { Observable } from 'rxjs';
import { switchMap, filter } from 'rxjs/operators';
import { isRxDocument } from 'rxdb/plugins/core';
import Segment from '@wcpos/common/src/components/segment';
import Text from '@wcpos/common/src/components/text';
import Tag from '@wcpos/common/src/components/tag';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import useUIResource from '@wcpos/common/src/hooks/use-ui-resource';
import CustomerSelect from '../../common/customer-select';
import AddCustomer from '../../common/add-edit-customer';
import UISettings from '../../common/ui-settings';
import Totals from './totals';

const Cart = () => {
	const ui = useObservableSuspense(useUIResource('pos.cart'));

	return (
		<Segment.Group>
			<Segment>
				<UISettings ui={ui} />
			</Segment>
		</Segment.Group>
	);
};

export default Cart;
