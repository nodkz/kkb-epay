import KkbEpayClient from './kkbEpayClient';
import testConfig from '../test_keys/config';

export default KkbEpayClient;
export function getTestClient() {
  return new KkbEpayClient(testConfig);
}
