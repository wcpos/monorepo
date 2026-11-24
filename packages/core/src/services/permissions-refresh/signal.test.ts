import { permissionsSignal$, reportPermissionsSignal } from './signal';

it('publishes stamps and refusals to subscribers', () => {
	const next = jest.fn();
	const subscription = permissionsSignal$.subscribe(next);
	reportPermissionsSignal({ kind: 'stamp', stamp: '0123456789abcdef' });
	reportPermissionsSignal({ kind: 'refused' });
	expect(next.mock.calls).toEqual([
		[{ kind: 'stamp', stamp: '0123456789abcdef' }],
		[{ kind: 'refused' }],
	]);
	subscription.unsubscribe();
});

it.each(['', '0123456789abcde', '0123456789abcdef0', '0123456789ABCDEF', 'g123456789abcdef'])(
	'drops invalid stamp %s',
	(stamp) => {
		const next = jest.fn();
		const subscription = permissionsSignal$.subscribe(next);
		reportPermissionsSignal({ kind: 'stamp', stamp });
		expect(next).not.toHaveBeenCalled();
		subscription.unsubscribe();
	}
);
