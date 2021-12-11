import Url from 'url-parse';
import parseLinkHeader from './parse-link-header';

Object.assign(Url, { parseLinkHeader });
export default Url as typeof Url & { parseLinkHeader: typeof parseLinkHeader };
