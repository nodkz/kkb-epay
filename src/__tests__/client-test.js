/* @flow */
/* eslint-disable no-new */

import path from 'path';
import KkbEpayClient from '../kkbEpayClient';
import testConfig from '../../test_keys/config';

describe('KkbEpayClient', () => {
  const client = new KkbEpayClient(testConfig);
  const clientSelfSigned = new KkbEpayClient({
    ...testConfig,
    kkbcaPub: testConfig.certPub,
  });

  describe('constructor()', () => {
    it('should throw if opt.merchantId not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...testConfig,
          merchantId: undefined,
        });
      }).toThrowError(/should provide `merchantId`/);
    });

    it('should throw if opt.merchantName not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...testConfig,
          merchantName: undefined,
        });
      }).toThrowError(/should provide `merchantName`/);
    });

    it('should throw if opt.merchantCertificateId not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...testConfig,
          merchantCertificateId: undefined,
        });
      }).toThrowError(/should provide `merchantCertificateId`/);
    });

    it('should throw if opt.certPrvPass not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...testConfig,
          certPrvPass: undefined,
        });
      }).toThrowError(/should provide `certPrvPass`/);
    });

    it('should throw if opt.certPrv not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...testConfig,
          certPrv: undefined,
        });
      }).toThrowError(/should provide `certPrv`/);
    });

    it('should throw if opt.certPub not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...testConfig,
          certPub: undefined,
        });
      }).toThrowError(/should provide `certPub`/);
    });

    it('should throw if opt.kkbcaPub not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...testConfig,
          kkbcaPub: undefined,
        });
      }).toThrowError(/should provide `kkbcaPub`/);
    });
  });

  describe('_readFile()', () => {
    it('should return Promise', () => {
      const p = client._readFile('file');
      expect(p).toBeInstanceOf(Promise);
      return p.catch(() => {});
    });

    it('should reject if file is not provided', () => {
      // $FlowFixMe
      return client._readFile().catch(e => {
        expect(e).toBeDefined();
      });
    });

    it('should resolve with file content', async () => {
      const data = await client._readFile(path.resolve(__dirname, '../__mocks__/readFileTest.txt'));
      expect(data).toMatchSnapshot();
    });
  });

  describe('_sign()', () => {
    it('should return Promise', () => {
      const p = client._sign('test');
      expect(p).toBeInstanceOf(Promise);
      return p.catch(() => {});
    });

    it('should reject if provided empty data', () => {
      // $FlowFixMe
      return client._sign().catch(e => {
        expect(e.message).toMatch(/string.*buffer/i);
      });
    });

    it('should reject if provided wrong passphrase', () => {
      const client2 = new KkbEpayClient({
        ...testConfig,
        certPrvPass: 'wrongPassphrase',
      });
      return client2._sign('Test').catch(e => {
        expect(e).toBeDefined();
      });
    });

    it('should resolve with signed data string', async () => {
      const data = await client._sign('Test');
      expect(data).toMatchSnapshot();
    });

    it('should invert sign if opts.invertSign = true', async () => {
      const client2 = new KkbEpayClient({
        ...testConfig,
        invertSign: false,
      });
      const client3 = new KkbEpayClient({
        ...testConfig,
        invertSign: true,
      });
      const data = 'Test';
      const sign = await client2._sign(data);
      const signInverted = await client3._sign(data);
      expect(sign).not.toEqual(signInverted);

      const signBuffer = Buffer.from(sign, 'base64');
      signBuffer.reverse();
      expect(signBuffer.toString('base64')).toEqual(signInverted);
    });
  });

  describe('_verify()', () => {
    it('should return Promise', () => {
      const p = clientSelfSigned._verify('test', 'sign');
      expect(p).toBeInstanceOf(Promise);
      return p.catch(() => {});
    });

    it('should reject if provided empty data', () => {
      // $FlowFixMe
      return clientSelfSigned._verify().catch(e => {
        expect(e.message).toMatch(/string.*buffer/i);
      });
    });

    it('should resolve with false if provided wrong sign', () => {
      const data = 'Test';
      const sign = 'wrongSign';
      return clientSelfSigned._verify(data, sign).then(result => {
        expect(result).toBeFalsy();
      });
    });

    it('should resolve with true if provided correct sign', async () => {
      const data = 'Test';
      const sign = await clientSelfSigned._sign(data);
      await clientSelfSigned._verify(data, sign).then(result => {
        expect(result).toBeTruthy();
      });
    });
  });

  describe('_parseXml()', () => {
    it('should return Promise', () => {
      const p = client._parseXml('test');
      expect(p).toBeInstanceOf(Promise);
      return p.catch(() => {});
    });

    it('should reject with error on empty xmlString', () => {
      // $FlowFixMe
      return client._parseXml().catch(e => {
        expect(e.message).toContain('must be non-empty string');
      });
    });

    it('should resolve with js object', async () => {
      const res = await client._parseXml('<document><bank name="Kazkom"></bank></document>');
      expect(res).toEqual({
        document: {
          bank: [{ $: { name: 'Kazkom' } }],
        },
      });
    });
  });

  describe('_parseResponse()', () => {
    it('should return Promise', () => {
      const p = client._parseBankResponse('test');
      expect(p).toBeInstanceOf(Promise);
      return p.catch(() => {});
    });

    it('should reject with error on empty argument', () => {
      // $FlowFixMe
      return client._parseBankResponse().catch(e => {
        expect(e).toBeDefined();
      });
    });

    it('should reject with error on empty <bank_sign>', () => {
      return client
        ._parseBankResponse('<document><bank name="Kazkom"></bank></document>')
        .catch(e => {
          expect(e.message).toContain('should have non-empty `bank_sign`');
        });
    });

    it('should reject with error invalid <bank_sign>', async () => {
      const xml = await client._readFile(
        path.resolve(__dirname, '../__mocks__/createOrderResponseInvalidSign.txt')
      );

      try {
        await client._parseBankResponse(xml.trim());
      } catch (e) {
        expect(e.message).toContain('has unverified/wrong `bank_sign`');
      }
    });

    it('should resolve with <bank> data', async () => {
      const xml = await client._readFile(
        path.resolve(__dirname, '../__mocks__/createOrderResponse.txt')
      );
      const result = await client._parseBankResponse(xml.trim());
      expect(result).toBeDefined();
    });
  });

  describe('_beautifyResponse()', () => {
    it('should remove arrays', () => {
      expect(client._beautifyResponse([{ body: 1 }])).toEqual({ body: 1 });

      expect(client._beautifyResponse([{ body: 1 }, { body: 2 }])).toEqual({
        body: 1,
        '1': { body: 2 },
      });
    });

    it('should expand args under $ key', () => {
      expect(client._beautifyResponse({ $: { arg1: 1, arg2: 2 } })).toEqual({
        arg1: 1,
        arg2: 2,
      });
    });

    it('should return regular keys', () => {
      expect(client._beautifyResponse({ key1: 1, key2: 2 })).toEqual({
        key1: 1,
        key2: 2,
      });
    });

    it('should return combined keys and args', () => {
      expect(client._beautifyResponse({ key1: 1, key2: 2, $: { arg1: 1, arg2: 2 } })).toEqual({
        key1: 1,
        key2: 2,
        arg1: 1,
        arg2: 2,
      });
    });

    it('should remove arrays in regular keys', () => {
      expect(client._beautifyResponse({ key1: [{ subKey1: 11, subKey2: 12 }], key2: 2 })).toEqual({
        key1: {
          subKey1: 11,
          subKey2: 12,
        },
        key2: 2,
      });
    });

    it('should match success response', async () => {
      const xml = await client._readFile(
        path.resolve(__dirname, '../__mocks__/createOrderResponse.txt')
      );
      const result = await client._parseBankResponse(xml.trim());
      expect(client._beautifyResponse(result)).toEqual({
        name: 'Kazkommertsbank JSC',
        customer: {
          name: 'test',
          mail: 'SeFrolov@kkb.kz',
          phone: '+333333333',
          merchant: {
            cert_id: '00c183d70b',
            name: 'New Demo Shop',
            order: {
              amount: '10',
              currency: '398',
              department: { amount: '10', merchant_id: '92061103' },
              order_id: '0202171211',
            },
          },
          merchant_sign: { type: 'RSA' },
        },
        customer_sign: { type: 'RSA' },
        results: {
          timestamp: '2017-02-02 17:13:03',
          payment: {
            merchant_id: '92061103',
            card: '440564-XX-XXXX-6150',
            amount: '10',
            reference: '170202171303',
            approval_code: '171303',
            response_code: '00',
            Secure: 'No',
            card_bin: '',
            c_hash: '13988BBF7C6649F799F36A4808490A3E',
          },
        },
      });
    });

    it('should match error response', async () => {
      const xml = await client._readFile(
        path.resolve(__dirname, '../__mocks__/createOrderResponseError.txt')
      );
      const result = await client._parseXml(xml);
      expect(client._beautifyResponse(result)).toEqual({
        response: {
          error: {
            _: 'Error Message',
            code: '00',
            time: '2006-11-22 12:20:30',
            type: 'system | auth',
          },
          order_id: '123456',
          session: { id: '1234654656545' },
        },
      });
    });
  });

  describe('_createXml()', () => {
    it('should return string', () => {
      const str = client._createXml('root', { a: 1, b: 2 });
      expect(str).toEqual('<root><a>1</a><b>2</b></root>');
    });

    it('should accept args', () => {
      const str = client._createXml('root', { $: { a: 1, b: 2 }, t: 3 });
      expect(str).toEqual('<root a="1" b="2"><t>3</t></root>');
    });
  });

  describe('_createOrderXML()', () => {
    it('should create signed doc', async () => {
      const signedOrder = await client._createOrderXML('000333', 500, 398);
      expect(signedOrder).toMatchSnapshot();

      // $FlowFixMe
      const marchantData = signedOrder.match(/(<merchant.*<\/merchant>)/i)[1];
      // $FlowFixMe
      const marchantSign = signedOrder.match(/<merchant_sign.*>(.+)<\/merchant_sign>/i)[1];
      expect(marchantData).toMatchSnapshot();
      expect(marchantSign).toMatchSnapshot();
      expect(await clientSelfSigned._verify(marchantData, marchantSign)).toBeTruthy();
    });
  });

  describe('createOrder()', () => {
    const createOrderOpts = {
      orderId: '000001',
      amount: 500,
      currency: 398,
      callbackUrl: '/process',
      successUrl: '/success',
      failureUrl: '/failure',
      email: '',
      ln: 'rus',
    };

    it('should check orderId option', () => {
      return client
        .createOrder({
          ...createOrderOpts,
          orderId: '1',
        })
        .catch(e => {
          expect(e.message).toContain('minLength 6 symbols and maxLength 15');
        });
    });

    it('should check amount option', () => {
      return client
        .createOrder({
          ...createOrderOpts,
          amount: 0,
        })
        .catch(e => {
          expect(e.message).toContain('`opts.amount` as positive number');
        });
    });

    it('should check callbackUrl option', () => {
      return client
        .createOrder({
          ...createOrderOpts,
          callbackUrl: '',
        })
        .catch(e => {
          expect(e.message).toContain('should provide `opts.callbackUrl`');
        });
    });

    it('should check successUrl option', () => {
      return client
        .createOrder({
          ...createOrderOpts,
          successUrl: '',
        })
        .catch(e => {
          expect(e.message).toContain('should provide `opts.successUrl`');
        });
    });

    it('should check failureUrl option', () => {
      return client
        .createOrder({
          ...createOrderOpts,
          failureUrl: '',
        })
        .catch(e => {
          expect(e.message).toContain('should provide `opts.failureUrl`');
        });
    });

    it('should resolve valid result', async () => {
      const res = await client.createOrder(createOrderOpts);
      expect(res).toEqual({
        BackLink: '/success',
        FailureBackLink: '/failure',
        Language: 'rus',
        PostLink: '/process',
        Signed_Order_B64:
          'PGRvY3VtZW50PjxtZXJjaGFudCBjZXJ0X2lkPSIwMEMxODJCMTg5IiBuYW1lPSJUZXN0IHNob3AiPjxvcmRlciBvcmRlcl9pZD0iMDAwMDAxIiBhbW91bnQ9IjUwMCIgY3VycmVuY3k9IjM5OCI+PGRlcGFydG1lbnQgbWVyY2hhbnRfaWQ9IjkyMDYxMTAxIiBhbW91bnQ9IjUwMCIvPjwvb3JkZXI+PC9tZXJjaGFudD48bWVyY2hhbnRfc2lnbiB0eXBlPSJSU0EiPlBEcVZEMkpSNzhzUjI3SUxodjFvZk5GeFF5aVp0anQ3UHRFV2NORlBIRVZRODJGRlRCMVcyWmZuazhHcHdSMlF6dnRNb0U0QzlJbkVSTjlGWkRHMkR3PT08L21lcmNoYW50X3NpZ24+PC9kb2N1bWVudD4=',
        email: '',
      });
    });
  });

  describe('processResponseCreateOrder()', () => {
    it('should return Promise', () => {
      const p = client.processResponseCreateOrder('<xml />');
      expect(p).toBeInstanceOf(Promise);
      return p.catch(() => {});
    });

    it('should resolve with parsed data on valid response', async () => {
      const validResponseXml = await client._readFile(
        path.resolve(__dirname, '../__mocks__/createOrderResponse.txt')
      );

      const res = await client.processResponseCreateOrder(validResponseXml);
      expect(res).toEqual({
        timestamp: '2017-02-02 17:13:03',
        name: 'test',
        mail: 'SeFrolov@kkb.kz',
        phone: '+333333333',
        orderId: '0202171211',
        amount: '10',
        currency: '398',
        merchantId: '92061103',
        card: '440564-XX-XXXX-6150',
        reference: '170202171303',
        approvalCode: '171303',
        responseCode: '00',
        Secure: 'No',
        card_bin: '',
        c_hash: '13988BBF7C6649F799F36A4808490A3E',
      });
    });

    it('should reject if error response from bank', () => {
      return client
        ._readFile(path.resolve(__dirname, '../__mocks__/createOrderResponseError.txt'))
        .then(xml => client.processResponseCreateOrder(xml))
        .catch(e => {
          expect(e.message).toContain('Response should have non-empty `bank_sign` property.');
        });
    });

    it('should reject if invalid sign', () => {
      return client
        ._readFile(path.resolve(__dirname, '../__mocks__/createOrderResponseInvalidSign.txt'))
        .then(xml => client.processResponseCreateOrder(xml))
        .catch(e => {
          expect(e.message).toContain('Response has unverified/wrong `bank_sign`');
        });
    });
  });

  describe('_changePaymentXml()', () => {
    it('should create signed proceed command', async () => {
      const signedCmd = await client._changePaymentXml({
        cmd: 'complete',
        reference: 'referenceNumber',
        approvalCode: 'approvalCode',
        orderId: 'orderId',
        amount: 500,
        currency: 398,
      });
      expect(signedCmd).toMatchSnapshot();
    });

    it('should has `reason` tag for reverse command', async () => {
      const signedCmd = await client._changePaymentXml({
        cmd: 'reverse',
        reference: 'referenceNumber',
        approvalCode: 'approvalCode',
        orderId: 'orderId',
        amount: 500,
        currency: 398,
      });
      expect(signedCmd).toContain('<reason>Return payment</reason>');
      expect(signedCmd).toMatchSnapshot();
    });
  });

  describe('_processResponseChangePayment()', () => {
    it('should return Promise', () => {
      const p = client._processResponseChangePayment('<xml />');
      expect(p).toBeInstanceOf(Promise);
      return p.catch(() => {});
    });

    it('should resolve with parsed data on valid response', async () => {
      const validResponseXml = await client._readFile(
        path.resolve(__dirname, '../__mocks__/changePaymentResponse.txt')
      );

      const res = await client._processResponseChangePayment(validResponseXml);
      expect(res).toEqual({
        SessionID: 'A1A94337B1F3336277ABD4D289BAD12A',
        amount: '10',
        approvalCode: '171303',
        cmd: 'complete',
        code: '00',
        currency: '398',
        message: 'Approved',
        orderId: '0202171211',
        reference: '170202171303',
      });
    });
  });

  describe('changePayment()', () => {
    const changePaymentOpts = {
      cmd: 'refund',
      reference: '170202171303',
      approvalCode: '171303',
      orderId: '0202171211',
      amount: 10,
      currency: 398,
    };

    it('should return Promise', () => {
      // $FlowFixMe
      const p = client.changePayment({});
      expect(p).toBeInstanceOf(Promise);
      return p.catch(() => {});
    });

    it('should reject with error on empty opts', () => {
      // $FlowFixMe
      return client.changePayment({}).catch(e => {
        expect(e.message).toContain('provide all required options');
      });
    });

    it('should reject with error on wrong cmd', () => {
      return (
        client
          // $FlowFixMe
          .changePayment({
            ...changePaymentOpts,
            cmd: 'non-existed',
          })
          .catch(e => {
            expect(e.message).toContain('reverse, complete, refund');
          })
      );
    });

    // this test makes request to Kazkom server
    // just an example
    // may not work, if kazkom clear data or change order
    it.skip('should return result', async () => {
      const res = await client.changePayment(changePaymentOpts);
      expect(res).toMatchObject({
        amount: '10',
        approvalCode: '171303',
        cmd: 'complete',
        code: '00',
        currency: '398',
        orderId: '0202171211',
        reference: '170202171303',
      });
    });

    it('should reject with wrong opts', () => {
      return client
        .changePayment({
          ...changePaymentOpts,
          cmd: 'complete',
          reference: '000000000',
          approvalCode: '000000',
        })
        .catch(e => {
          expect(e.message).toBeDefined();
        });
    });
  });
});
