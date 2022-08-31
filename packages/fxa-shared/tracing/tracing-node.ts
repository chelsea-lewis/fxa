/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { Resource } from '@opentelemetry/resources';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

import { ILogger } from '../log';
import { BaseTracing, preCheck } from './tracing-base';
import { TracingOpts } from './config';
import * as api from '@opentelemetry/api';

const log_type = 'node-tracing';

/**
 * Responsible for initializing node tracing from a config object.
 */
export class NodeTracing extends BaseTracing<NodeTracerProvider> {
  protected _provider?: NodeTracerProvider | undefined;

  constructor(opts: TracingOpts, logger?: ILogger) {
    super(opts, log_type, logger);
  }

  protected initProvider() {
    this._provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.opts.serviceName,
      }),
    });
    this._provider.register();
    this.logger?.info(this.type, { msg: 'provider registered' });

    registerInstrumentations({
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-hapi': {
            enabled: true,
          },
        }),
      ],
    });

    this.logger?.info(this.type, { msg: 'instrumentation registered' });
  }
}

/** Main tracing instance */
let tracing: NodeTracing;

/** Provides access to the current span */
export function getTraceParentId() {
  if (!tracing) {
    return;
  }

  // Try locate the current span.
  const context = api.trace.getSpan(api.context.active())?.spanContext();

  // If not context can be located then exit with empty string.
  if (!context) {
    return '';
  }

  // One way to adhere to sample rate. 01 means record. 00 means don't record.
  let sample = '00';
  if (tracing.opts.sampleRate && Math.random() < tracing.opts.sampleRate) {
    sample = '01';
  }

  // Expected format is VERSION-TRACE_ID-SPAN_ID-SAMPLE_DECISION
  return `00-${context.traceId}-${context.spanId}-${sample}`;
}

/**
 * Initializes a tracing in node.js
 * @param opts
 * @param logger
 * @returns
 */
export function init(opts: TracingOpts, logger?: ILogger) {
  logger?.info(log_type, { msg: 'initializing node tracing' });

  if (!preCheck(log_type, opts, tracing, logger)) {
    return;
  }

  tracing = new NodeTracing(opts, logger);
  tracing.init();
}
