import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { Observable, of } from 'rxjs';

import { Text } from '@wcpos/tailwind/src/text';

import type { UISettingState, UISettingID } from '../contexts/ui-settings';

type Props<T extends UISettingID> = {
	item: import('rxdb').RxDocument;
	column: UISettingState<T>['columns'][number];
};

/**
 *
 */
export const TextCell = <T extends UISettingID>({ item, column }: Props<T>) => {
	const textObservable = item[column.key + '$'] as Observable<string> | undefined;
	const text = useObservableEagerState(textObservable ? textObservable : of(null));

	return <Text>{String(text)}</Text>;
};
