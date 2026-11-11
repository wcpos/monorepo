import { useBarcode } from '../products/use-barcode';

/**
 * The products search box is unmounted while the checkout column is open, so there is no
 * search to write: a not-found, ambiguous or variable-parent scan shows its scan toast only.
 */
const NO_SEARCH = () => {};
const NO_CLEAR = () => {};

/** The scan consumer while the checkout column stands in for the products pane. Renders nothing. */
export function TenderScans(): null {
	useBarcode(NO_SEARCH, NO_CLEAR);
	return null;
}
