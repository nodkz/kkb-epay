import KkbEpayClient from '../kkbEpayClient.js'
import path from 'path';

const config = {
  merchantId: '92061101',
  merchantName: 'Test shop',
  merchantCertificateId: '00C182B189',
  certPrvPass: 'nissan',
  certPrv: path.resolve(__dirname, '../__mocks__/data/cert.prv'),
  certPub: path.resolve(__dirname, '../__mocks__/data/cert.pub'),
  kkbcaPub: path.resolve(__dirname, '../__mocks__/data/kkbca_test.pub'),
};

describe('KkbEpayClient', () => {
  describe('constructor()', () => {
    it('should throw if opt.merchantId not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...config,
          merchantId: undefined,
        });
      }).toThrow(/should provide `merchantId`/);
    });

    it('should throw if opt.merchantName not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...config,
          merchantName: undefined,
        });
      }).toThrow(/should provide `merchantName`/);
    });

    it('should throw if opt.merchantCertificateId not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...config,
          merchantCertificateId: undefined,
        });
      }).toThrow(/should provide `merchantCertificateId`/);
    });

    it('should throw if opt.certPrvPass not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...config,
          certPrvPass: undefined,
        });
      }).toThrow(/should provide `certPrvPass`/);
    });

    it('should throw if opt.certPrv not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...config,
          certPrv: undefined,
        });
      }).toThrow(/should provide `certPrv`/);
    });

    it('should throw if opt.certPub not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...config,
          certPub: undefined,
        });
      }).toThrow(/should provide `certPub`/);
    });

    it('should throw if opt.kkbcaPub not provided', () => {
      expect(() => {
        new KkbEpayClient({
          ...config,
          kkbcaPub: undefined,
        });
      }).toThrow(/should provide `kkbcaPub`/);
    });
  });

  describe('_readFile()', () => {
    const client = new KkbEpayClient(config);

    it('should return Promise', () => {
      const p = client._readFile();
      expect(p).toBeInstanceOf(Promise);
      return p.catch(e => {});
    });

    it('should reject if file is not provided', () => {
      return client._readFile().catch((e) => {
        expect(e).toBeDefined();
      });
    });

    it('should resolve with file content', async () => {
      const data = await client._readFile(
        path.resolve(__dirname, '../__mocks__/readFileTest.txt')
      );
      expect(data).toMatchSnapshot();
    });
  });

  describe('_sign()', () => {
    const client = new KkbEpayClient(config);

    it('should return Promise', () => {
      const p = client._sign('test');
      expect(p).toBeInstanceOf(Promise);
      return p.catch(e => {});
    });

    it('should reject if provided empty data', () => {
      return client._sign().catch((e) => {
        expect(e.toString()).toMatch(/Data must be a string or a buffer/);
      });
    });

    it('should reject if provided wrong passphrase', () => {
      const client2 = new KkbEpayClient({
        ...config,
        certPrvPass: 'wrongPassphrase'
      });
      return client2._sign('Test').catch((e) => {
        expect(e).toBeDefined();
      });
    });

    it('should resolve with signed data string', async () => {
      const data = await client._sign('Test');
      expect(data).toMatchSnapshot();
    });

    it('should invert sign if opts.invertSign = true', async () => {
      const client2 = new KkbEpayClient({
        ...config,
        invertSign: false,
      });
      const client3 = new KkbEpayClient({
        ...config,
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
    const client = new KkbEpayClient({
      ...config,
      kkbcaPub: path.resolve(__dirname, '../__mocks__/data/cert.pub'),
    });

    it('should return Promise', () => {
      const p = client._verify('test');
      expect(p).toBeInstanceOf(Promise);
      return p.catch(e => {});
    });

    it('should reject if provided empty data', () => {
      return client._verify().catch((e) => {
        expect(e.toString()).toMatch(/Data must be a string or a buffer/);
      });
    });

    it('should resolve with false if provided wrong sign', () => {
      const data = 'Test';
      const sign = 'wrongSign';
      return client._verify('Test', sign).then((result) => {
        expect(result).toBeFalsy();
      });
    });

    it('should resolve with true if provided correct sign', async () => {
      const data = 'Test';
      const sign = await client._sign(data);
      await client._verify(data, sign).then((result) => {
        expect(result).toBeTruthy();
      });
    });
  });

  describe('_parseXml()', () => {
    const client = new KkbEpayClient(config);

    it('should return Promise', () => {
      const p = client._parseXml('test');
      expect(p).toBeInstanceOf(Promise);
      return p.catch(e => {});
    });

    it('should reject with error on empty xmlString', () => {
      return client._parseXml().catch((e) => {
        expect(e.message).toMatch(/must be non-empty string/);
      });
    });

    it('should resolve with js object', async () => {
      const res = await client._parseXml(
        '<document><bank name="Kazkom"></bank></document>'
      );
      expect(res).toEqual({
        document: {
          bank: [
            { $: { name: 'Kazkom' } },
          ]
        }
      });
    });
  });

  describe('_parseResponse()', () => {
    const client = new KkbEpayClient(config);

    it('should return Promise', () => {
      const p = client._parseResponse('test');
      expect(p).toBeInstanceOf(Promise);
      return p.catch(e => {});
    });

    it('should reject with error on empty argument', () => {
      return client._parseResponse().catch((e) => {
        expect(e).toBeDefined();
      });
    });

    it('should reject with error on empty <bank_sign>', () => {
      return client._parseResponse('<document><bank name="Kazkom"></bank></document>')
        .catch((e) => {
          expect(e.message).toMatch(/should have non-empty `bank_sign`/);
        });
    });

    it('should reject with error invalid <bank_sign>', async () => {
      const xml = await client._readFile(
        path.resolve(__dirname, '../__mocks__/testResponseInvalidSign.txt')
      );

      try {
        await client._parseResponse(xml.trim());
      } catch (e) {
        expect(e.message).toMatch(/has unverified\/wrong `bank_sign`/);
      }
    });

    it('should resolve with <bank> data', async () => {
      const xml = await client._readFile(
        path.resolve(__dirname, '../__mocks__/testResponse.txt'),
      );
      const result = await client._parseResponse(xml.trim());
      expect(result).toBeDefined();
    });
  });
});
