/* @flow */

import { isFunction } from './utils';

export type ExpressMiddlewareOpts = {
  autoConfirm?: boolean,
  proceedRequest?: (err: ?Error, body: mixed) => mixed,
};

export default function expressMiddleware(opts: ExpressMiddlewareOpts = {}) {
  const autoConfirm = !!opts.autoConfirm;
  const proceedRequest = isFunction(opts.proceedRequest) ? opts.proceedRequest : () => {};

  return (req, res, next) => {
    next();
  };
}
