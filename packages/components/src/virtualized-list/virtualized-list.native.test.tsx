import * as React from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

import { render } from '@testing-library/react';

import { List, Root } from './virtualized-list';

it('lets native list actions handle the first tap while the keyboard is open', () => {
	let scrollProps: ScrollViewProps | undefined;
	const view = render(
		<Root>
			<List
				data={[]}
				estimatedItemSize={50}
				renderItem={() => null}
				renderScrollComponent={(props) => {
					scrollProps = props;
					return <ScrollView {...props} />;
				}}
			/>
		</Root>
	);

	// Exercise our list and the real FlashList forwarding path. Native E2E checks
	// the gesture itself; jsdom cannot reproduce iOS keyboard responder capture.
	expect(scrollProps?.keyboardShouldPersistTaps).toBe('handled');
	view.unmount();
});
