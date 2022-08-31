/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { ZoneContextManager } from '@opentelemetry/context-zone';

import { ILogger } from '../log';
import { TracingOpts } from './config';
import { BaseTracing, preCheck } from './tracing-base';

export const log_type = 'web-tracing';

/**
 * Responsible for initializing node tracing from a config object.
 */
export class BrowserTracing extends BaseTracing<WebTracerProvider> {
  protected _provider?: WebTracerProvider;

  constructor(opts: TracingOpts, logger?: ILogger) {
    super(opts, log_type, logger);
  }

  protected initProvider() {
    this._provider = new WebTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.opts.serviceName,
      }),
    });

    this._provider.register({
      // Changing default contextManager to use ZoneContextManager - supports asynchronous operations - optional
      contextManager: new ZoneContextManager(),
    });
    this.logger?.info(this.type, { msg: 'provider registered' });

    registerInstrumentations({
      instrumentations: [
        new DocumentLoadInstrumentation(),
        new UserInteractionInstrumentation(),
        new XMLHttpRequestInstrumentation(),
      ],
    });
    this.logger?.info(this.type, { msg: 'instrumentation registered' });
  }
}

/** Main tracing instance */
let tracing: BrowserTracing;

/** Initializes web tracing. This can only be invoked once. */
export function init(opts: TracingOpts, logger?: ILogger) {
  logger?.info(log_type, { msg: 'initializing web tracing' });

  if (!preCheck(log_type, opts, tracing, logger)) {
    return;
  }

  tracing = new BrowserTracing(opts, logger);
  tracing.init();
}
