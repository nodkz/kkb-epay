/* @flow */
/* eslint-disable class-methods-use-this */

import fs from 'fs';
import crypto from 'crypto';
import xml2js from 'xml2js';
import objectPath from 'object-path';

type absolutePathStringT = string;

export type KkbEpayClientOptsT = {
  merchantId: string,
  merchantName: string,
  merchantCertificateId: string,
  certPrv: absolutePathStringT,
  certPrvPass: string,
  certPub: absolutePathStringT,
  kkbcaPub: absolutePathStringT,
  invertSign?: boolean,
};

export default class KkbEpayClient {
  opts: KkbEpayClientOptsT;

  constructor(opts: KkbEpayClientOptsT) {
    if (!opts.merchantId) {
      throw new Error(
        'You should provide `merchantId` option (string). ' +
          'See provided by Qazkom variable MERCHANT_ID in `config.txt`',
      );
    }
    if (!opts.merchantName) {
      throw new Error(
        'You should provide `merchantName` option (string). ' +
          'See provided by Qazkom variable MERCHANT_NAME in `config.txt`',
      );
    }
    if (!opts.merchantCertificateId) {
      throw new Error(
        'You should provide `merchantCertificateId` option (string). ' +
          'See provided by Qazkom variable MERCHANT_CERTIFICATE_ID in `config.txt`',
      );
    }
    if (!opts.certPrvPass) {
      throw new Error(
        'You should provide `certPrvPass` option (string). ' +
          'See provided by Qazkom variable PRIVATE_KEY_PASS in `config.txt`',
      );
    }
    if (!opts.certPrv) {
      throw new Error(
        'You should provide `certPrv` option (absolute path). ' +
          'This file provided by Qazkom and has name `cert.prv`',
      );
    }
    if (!opts.certPub) {
      throw new Error(
        'You should provide `certPub` option (absolute path). ' +
          'This file provided by Qazkom and has name `cert.pub`',
      );
    }
    if (!opts.kkbcaPub) {
      throw new Error(
        'You should provide `kkbcaPub` option (absolute path). ' +
          'This file provided by Qazkom and has name `kkbca.pem` or `kkbca.pub`',
      );
    }

    this.opts = {
      ...opts,
      invertSign: (
        // true by default
        opts.invertSign !== false
      ),
    };
  }

  _readFile(filename: string, enc: buffer$Encoding = 'ascii'): Promise<string> { // eslint-disable-line
    return new Promise((resolve, reject) => {
      try {
        fs.readFile(filename, (err, buffer) => {
          if (err) {
            reject(err);
          } else {
            resolve(buffer.toString(enc));
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  _sign(data: string): Promise<string> {
    return this._readFile(this.opts.certPrv).then(key => {
      const signer = crypto.createSign('RSA-SHA1');
      signer.update(data);
      const pk = {
        key,
        passphrase: this.opts.certPrvPass,
      };

      const signBuffer = signer.sign(pk);

      if (this.opts.invertSign) {
        signBuffer.reverse();
      }

      return signBuffer.toString('base64');
    });
  }

  _verify(data: string, sign: string): Promise<boolean> {
    return this._readFile(this.opts.kkbcaPub).then(key => {
      const verify = crypto.createVerify('RSA-SHA1');
      verify.update(data);

      const signBuffer = Buffer.from(sign, 'base64');
      if (this.opts.invertSign) {
        signBuffer.reverse();
      }
      const res = verify.verify(key, signBuffer);
      return res;
    });
  }

  _parseXml(xml: string): Promise<Object> {
    return new Promise((resolve, reject) => {
      if (!xml || typeof xml !== 'string') {
        reject(new Error('Argument must be non-empty string.'));
        return;
      }

      const parser = new xml2js.Parser();
      parser.parseString(xml, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data);
      });
    });
  }

  async _parseBankResponse(xml: string): Promise<Object> {
    if (!xml) {
      throw new Error('Response should be non-empty string.');
    }

    const res = await this._parseXml(xml);

    const signObj = objectPath.get(res, 'document.bank_sign.0');
    if (!signObj || !signObj._) {
      throw new Error('Response should have non-empty `bank_sign` property.');
    }

    const sign = signObj._;
    const bankMatch = xml.match(/(<bank\s.*<\/bank>)/i);
    const isValid = bankMatch && (await this._verify(bankMatch[0], sign));
    if (!isValid) {
      throw new Error(
        'Response has unverified/wrong `bank_sign`. ' +
          'It may be unauthorized request. ' +
          'Or provided wrong `opts.kkbcaPub` property.',
      );
    }

    return objectPath.get(res, 'document.bank');
  }

  _beautifyResponse(xmlObj: any): Object {
    let res = {};
    if (Array.isArray(xmlObj)) {
      if (xmlObj.length > 0) {
        res = this._beautifyResponse(xmlObj[0]);
        for (let i = 1; i < xmlObj.length; i++) {
          res[i.toString()] = this._beautifyResponse(xmlObj[i]);
        }
      }
    } else if (typeof xmlObj === 'object') {
      Object.keys(xmlObj).forEach((key) => {
        if (key === '$') {
          res = { ...res, ...xmlObj.$ };
        } else if (Array.isArray(xmlObj[key]) || typeof xmlObj[key] === 'object') {
          res[key] = this._beautifyResponse(xmlObj[key])
        } else {
          res[key] = xmlObj[key];
        }
      });
    }
    return res;
  }
}
