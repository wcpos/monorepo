import { from, combineLatest, Observable } from 'rxjs';
import { switchMap, map, tap } from 'rxjs/operators';
import isFinite from 'lodash/isFinite';
import { calcTaxes, sumTaxes } from '../utils';

type LineItemDocument = import('../../').LineItemDocument;

/**
 * WooCommerce Order Line Item methods
 */
export default {};
