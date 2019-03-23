import Url from 'url-parse';
import parseLinkHeader from './parse-link-header';
Url.parseLinkHeader = parseLinkHeader;
export default Url;
