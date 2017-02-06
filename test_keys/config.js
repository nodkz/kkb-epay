const path = require('path');

module.exports = {
  merchantId: '92061101',
  merchantName: 'Test shop',
  merchantCertificateId: '00C182B189',
  certPrvPass: 'nissan',
  certPrv: path.resolve(__dirname, './cert.prv'),
  certPub: path.resolve(__dirname, './cert.pub'),
  kkbcaPub: path.resolve(__dirname, './kkbca_test.pub'),
  serverEndpoint: 'https://testpay.kkb.kz',
};
