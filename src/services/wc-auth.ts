import { Observable, from, of } from 'rxjs';
import { tap, map, concatMap, startWith, switchMap, catchError } from 'rxjs/operators';
import http from '../lib/http';
import Url from '../lib/url-parse';

const getWpApiUrlFromHeadResponse = (response) => {
	const link = response?.headers?.link;
	const parsed = Url.parseLinkHeader(link);
	return parsed?.['https://api.w.org/']?.url;
};

const fetchSiteHead = (url: string) => from(http.head(url)).pipe(map(getWpApiUrlFromHeadResponse));

export const testables = { fetchSiteHead, getWpApiUrlFromHeadResponse };

export default {};
