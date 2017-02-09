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
  serverEndpoint: string,
};

export type ProceedOrderCmdT = 'reverse' | 'complete' | 'refund';
export type CurrencyISO4217 = 398 | 840 | 643; // 398 - KZT, 840 - USD, 643 - RUB;

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
      serverEndpoint: opts.serverEndpoint || 'https://epay.kkb.kz/',
    };
  }

  _readFile(
    filename: string,
    enc: buffer$Encoding = 'ascii', // eslint-disable-line
  ): Promise<string> {
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

  _createXml(rootName: string, obj: Object): string {
    const builder = new xml2js.Builder({
      rootName,
      headless: true,
      renderOpts: {
        pretty: false,
      },
    });
    return builder.buildObject(obj);
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
    const isValid = bankMatch && (await this._verify(bankMatch[1], sign));
    if (!isValid) {
      throw new Error(
        'Response has unverified/wrong `bank_sign`. ' +
          'It may be unauthorized request. ' +
          'Or was provided wrong bank public key in `opts.kkbcaPub` property.',
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
      Object.keys(xmlObj).forEach(key => {
        if (key === '$') {
          res = { ...res, ...xmlObj.$ };
        } else if (Array.isArray(xmlObj[key]) || typeof xmlObj[key] === 'object') {
          res[key] = this._beautifyResponse(xmlObj[key]);
        } else {
          res[key] = xmlObj[key];
        }
      });
    }
    return res;
  }

  async _createOrderXML(
    orderId: string,
    amount: number,
    currency: CurrencyISO4217 = 398,
  ): Promise<string> {
    const merchantObj = {
      $: {
        cert_id: this.opts.merchantCertificateId,
        name: this.opts.merchantName,
      },
      order: [
        {
          $: {
            order_id: orderId,
            amount,
            currency,
          },
          department: [
            {
              $: {
                merchant_id: this.opts.merchantId,
                amount,
              },
            },
          ],
        },
      ],
    };

    const merchantTag = this._createXml('merchant', merchantObj);
    const merchantSign = await this._sign(merchantTag);
    return `<document>${merchantTag}<merchant_sign type="RSA">${merchantSign}</merchant_sign></document>`;
  }

  getCreateOrderUrl() {
    return `${this.opts.serverEndpoint}/jsp/process/logon.jsp`;
  }

  getProceedOrderUrl() {
    return `${this.opts.serverEndpoint}/jsp/remote/control.jsp`;
  }

  async createOrder(
    opts: {
      orderId: string,
      amount: number,
      currency: CurrencyISO4217,
      email: string,
      callbackUrl: string,
      successUrl: string,
      failureUrl: string,
      ln: 'rus' | 'eng' | 'kaz',
    },
  ): Promise<Object> {
    if (!opts) {
      throw new Error('You provide empty options');
    }

    if (
      !opts.orderId ||
        typeof opts.orderId !== 'string' ||
        opts.orderId.length < 6 ||
        opts.orderId.length > 15
    ) {
      throw new Error(
        'You should provide `opts.orderId` as string with minLength 6 symbols and maxLength 15.',
      );
    }

    if (!opts.amount || opts.amount < 0) {
      throw new Error('You should provide `opts.amount` as positive number.');
    }

    if (!opts.callbackUrl) {
      throw new Error(
        'You should provide `opts.callbackUrl`. Allowed ports 80, 443. On this urls bank server will send you response.',
      );
    }

    if (!opts.successUrl) {
      throw new Error(
        'You should provide `opts.successUrl`. Client will be redirected on this url after success payment.',
      );
    }

    if (!opts.failureUrl) {
      throw new Error(
        'You should provide `opts.failureUrl`. Client will be redirected on this url after failure payment.',
      );
    }

    const signedOrder = await this._createOrderXML(opts.orderId, opts.amount, opts.currency);
    const signedOrderBuffer = new Buffer(signedOrder);

    return {
      email: opts.email || '',
      // Signed_Order: signedOrder, // FOR DEBUG PURPOSES
      Signed_Order_B64: signedOrderBuffer.toString('base64'),
      BackLink: opts.successUrl,
      FailureBackLink: opts.failureUrl,
      PostLink: opts.callbackUrl,
      Language: opts.ln || 'rus',
    };
  }

  async processResponseCreateOrder(xml: string): Promise<Object> {
    try {
      const xmlObj = await this._parseBankResponse(xml);
      const res = this._beautifyResponse(xmlObj);

      const responseCode = objectPath.get(res, 'results.payment.response_code');
      if (responseCode !== '00') {
        return Promise.reject(new Error(
          `results.payment.response_code: ${responseCode} is not equal to 00`,
        ));
      }

      // const merchantId = objectPath.get(res, 'results.payment.merchant_id');
      // if (merchantId !== this.opts.merchantId) {
      //   return Promise.reject(new Error(
      //     `results.payment.merchant_id: ${merchantId} is not equal to your id in opts ${this.opts.merchantId}`
      //   ));
      // }

      return {
        timestamp: res.results.timestamp,
        name: res.customer.name,
        mail: res.customer.mail,
        phone: res.customer.phone,
        order_id: res.customer.merchant.order.order_id,
        amount: res.customer.merchant.order.amount,
        currency: res.customer.merchant.order.currency,
        ...res.results.payment,
      };
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
  * cmd 'reverse' - return blocked amount back to customer
  *     'complete' - confirm payment and transfer blocket amount to merchant
  *     'refund' - return confirmed payment back
  */
  async proceedOrder(
    cmd: ProceedOrderCmdT,
    reference: string,
    approvalCode: string,
    orderId: string,
    amount: number,
    currency: CurrencyISO4217,
  ): Promise<string> {
    const merchantObj = {
      $: {
        merchant_id: this.opts.merchantId,
      },
      command: {
        $: {
          type: cmd,
        },
      },
      payment: {
        $: {
          reference,
          approval_code: approvalCode,
          orderid: orderId,
          amount,
          currency_code: currency,
        },
      },
    };

    if (cmd === 'reverse') {
      // $FlowFixMe
      merchantObj.reason = 'Return payment';
    }

    const merchantTag = this._createXml('merchant', merchantObj);
    const merchantSign = await this._sign(merchantTag);
    return `<document>${merchantTag}<merchant_sign type="RSA" cert_id="${this.opts.merchantCertificateId}">${merchantSign}</merchant_sign></document>`;
  }

  async processResponseProceedOrder(xml: string): Promise<Object> {
    try {
      const xmlObj = await this._parseBankResponse(xml);
      const res = this._beautifyResponse(xmlObj);

      if (objectPath.get(res, 'bank.response.code') !== '00') {
        return Promise.reject(new Error('Response.code is not equal to 00'));
      }

      return res;
    } catch (e) {
      return Promise.reject(e);
    }
  }
}
