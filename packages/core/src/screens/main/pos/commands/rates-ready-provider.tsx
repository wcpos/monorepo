import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { BehaviorSubject, combineLatest, type Observable, Subscription } from 'rxjs';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useQueryRuntime } from '@wcpos/query';
import { useCoverageGeneration } from '@wcpos/query/query-state';
import { getLogger } from '@wcpos/utils/logger';

import { ratesReady } from './rates-ready';
import { useT } from '../../../../contexts/translations';
import { useTaxSettings } from '../../contexts/tax-rates';

import type { RatesReady } from './settlement-coordinator';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);
// eslint-disable-next-line wcpos/no-rx-in-context-value -- #3843 spec: the readiness channel, read only in pipelines (the coordinator, whenReady); dated 2026-11-26.
const Context = React.createContext<{
	ready$: Observable<RatesReady>;
	whenReady: (key?: string) => Promise<boolean>;
} | null>(null);

let engines = 0;

/** Remounted per engine: the eager state would hand a new engine the old one's last verdict. */
function Publish({ rates }: { rates: ReturnType<typeof ratesReady> }) {
	const manager = useQueryRuntime();
	// Coverage says the lane synced once; only a database read says `allRates` is an answer (#3186).
	const { ratesRead } = useTaxSettings();
	const generation = useCoverageGeneration(manager.engine, 'taxRates');
	const { coverage$ } = rates;
	const coverage = useObservableEagerState(coverage$);
	// Publish readiness only with committed config inputs, never ahead of the rates render.
	React.useLayoutEffect(() => {
		rates.publish(coverage.complete, generation, ratesRead);
	}, [rates, coverage, generation, ratesRead]);
	return null;
}

/** The rates readiness, once per engine: the coordinator settles on it, a customer write waits on it. */
export function RatesReadyProvider({ children }: { children: React.ReactNode }) {
	const manager = useQueryRuntime();
	const { rates, key } = React.useMemo(
		() => ({ rates: ratesReady(manager.engine), key: ++engines }),
		[manager.engine]
	);
	const online = useOnlineStatus().status === 'online-website-available';
	const [online$] = React.useState(() => new BehaviorSubject(online));
	const [pending] = React.useState(() => new Map<string, Subscription>());
	const t = useT();
	React.useLayoutEffect(() => online$.next(online), [online, online$]);
	React.useEffect(() => rates.watch(), [rates]);
	const value = React.useMemo(() => {
		// True on the first ready verdict; false once a later call takes the key, the scope moves, or offline.
		const whenReady = (key?: string) =>
			new Promise<boolean>((resolve) => {
				const wait = new Subscription(() => resolve(false));
				if (key) pending.get(key)?.unsubscribe();
				if (key) pending.set(key, wait);
				wait.add(
					manager.engine.events(({ type }) => {
						if (type === 'scope-switched' || type === 'collection-reset') wait.unsubscribe();
					})
				);
				const verdicts = combineLatest([rates.ready$, online$]);
				wait.add(
					verdicts.subscribe(([{ ready }, isOnline]) => {
						if (!ready && isOnline) return;
						if (ready) resolve(true);
						else
							cartLogger.warn('Customer not set: offline before the tax rates', {
								showToast: true,
								toast: {
									title: t('common.device_went_offline'),
									text2: t('common.reconnect_then_retry'),
								},
							});
						wait.unsubscribe();
					})
				);
			});
		return { ready$: rates.ready$, whenReady };
	}, [manager.engine, rates, online$, pending, t]);
	return (
		<Context.Provider value={value}>
			{children}
			{/* After the children: their layout effects (the coordinator's inputs) run first. */}
			<Publish key={key} rates={rates} />
		</Context.Provider>
	);
}

/** No fallback outside a provider, the same as `useCartConfigReader`. */
export function useRatesReady() {
	const value = React.useContext(Context);
	if (!value) throw new Error('useRatesReady requires RatesReadyProvider');
	return value;
}

/** The caller contract of `retaxForCustomerWrite`: awaited outside the slot; per key, the last call wins. */
export const useWhenRatesReady = () => useRatesReady().whenReady;
