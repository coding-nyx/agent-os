import * as jsJodaCore from '@js-joda/core';
import '@js-joda/timezone';

if (typeof globalThis !== 'undefined' && !(globalThis as any)['@js-joda/core']) {
  (globalThis as any)['@js-joda/core'] = jsJodaCore;
}
