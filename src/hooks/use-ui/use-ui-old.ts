import { Q } from '@nozbe/watermelondb';
import { filter, map, tap } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import useAppState from '../use-app-state';

type Section = 'pos_products' | 'pos_cart' | 'products';
type UI = typeof import('../../database/models/store/ui/ui');

/**
 *
 * @param section
 */
const useUI = (section: Section): ObservableResource<UI> => {
	const [{ storeDB }] = useAppState();
	const uiCollection = storeDB.collections.get('uis');

	const init = async () => {
		await storeDB.action(async () => {
			const newUI = await uiCollection.create((ui: UI) => {
				ui.section = section;
			});
			newUI.reset();
		});
	};

	const ui$ = uiCollection
		.query(Q.where('section', section))
		.observeWithColumns(['width', 'sortBy', 'sortDirection'])
		.pipe(
			filter((uis: UI[]) => {
				if (uis.length > 0) {
					return true;
				}
				init();
				return false;
			}),
			map((uis: UI[]) => uis[0]),
			tap((result) => console.log('UI found from useUI', result))
		);

	return new ObservableResource(ui$);
};

export default useUI;
