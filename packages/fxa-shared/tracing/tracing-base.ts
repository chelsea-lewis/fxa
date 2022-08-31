/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  TraceExporter as GcpTraceExporter,
  TraceExporterOptions as GcpTraceExporterOptions,
} from '@google-cloud/opentelemetry-cloud-trace-exporter';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ILogger } from '../log';
import { TracingOpts } from './config';

export interface ITracing {
  get provider(): BasicTracerProvider;
  type: string;
  init(): void;
}

/**
 * Base class holding common initialize for otel tracing.
 */
export abstract class BaseTracing<T extends BasicTracerProvider>
  implements ITracing
{
  protected abstract _provider?: T;

  public get provider(): BasicTracerProvider {
    if (this._provider == null) {
      throw new Error('Provider not initialized!');
    }
    return this._provider;
  }

  /**
   * Creates a new BaseTracingInitializer
   * @param opts options for initializing tracing
   * @param type a common name for the initializer
   * @param logger an optional logger
   */
  constructor(
    public readonly opts: TracingOpts,
    public readonly type: string,
    public readonly logger?: ILogger
  ) {}

  /**
   * Initializes tracing based on current tracing opts
   */
  public init() {
    if (!this.opts.serviceName) {
      throw new Error('Missing config. serviceName must be defined!');
    }

    this.initProvider();
    this.logger?.info(this.type, {
      msg: 'provider initialized',
      type: this.type,
    });

    if (this.opts.console?.enabled) {
      this.initConsole();
      this.logger?.info(this.type, {
        msg: 'initialized console trace',
        type: this.type,
      });
    }

    if (this.opts.jaeger?.enabled) {
      this.initJaeger();
      this.logger?.info(this.type, {
        msg: 'initialized jaeger trace exporter',
        type: this.type,
      });
    }

    if (this.opts.gcp?.enabled) {
      this.initGcp();
      this.logger?.info(this.type, {
        msg: 'initialized gcp trace exporter',
        type: this.type,
      });
    }
  }

  /**
   * Initializes the tracing provider. This must be called before any other init operations.
   * @param serviceName name of target service, e.g. fxa-auth-server
   */
  protected abstract initProvider(): void;

  /**
   * Initializes a console exporter. This logs to stdout or the browser console.
   */
  protected initConsole() {
    const exporter = new ConsoleSpanExporter();
    this.provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    this.provider.register();
    this.logger?.info(this.type, { msg: 'console enabled' });
  }

  /**
   * Initializes a jaeger exporter. This is mostly useful for local development.
   */
  protected initJaeger() {
    const options = {
      endpoint: 'http://localhost:14268/api/traces',
    };
    const exporter = new JaegerExporter(options);
    this.provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    this.provider.register();
    this.logger?.info(this.type, { msg: 'jaeger enabled' });
  }

  /**
   * Initializes a google cloud trace exporter.
   * @param options optional options to configure exporter. Note, that in a gpc context these can be
   *                omitted and will be automatically located.
   */
  protected initGcp(options?: GcpTraceExporterOptions) {
    if (!options) {
      this.logger?.warn(this.type, {
        msg: 'gcp trace options not provide. this will only work inside a gcp context.',
      });
    }

    const exporter = new GcpTraceExporter(options);
    const processor = new BatchSpanProcessor(exporter);
    this.provider.addSpanProcessor(processor);
    this.provider.register();
    this.logger?.info(this.type, { msg: 'gcp enabled' });
  }
}

export function preCheck(
  type: string,
  opts: TracingOpts,
  tracing?: ITracing,
  logger?: ILogger
) {
  if (tracing != null) {
    logger?.warn(type, { msg: 'tracing already initialized!' });
    return false;
  }

  if (!opts.serviceName) {
    logger?.warn(type, {
      msg: 'skipping tracing initialization. serviceName must be defined.',
    });
    return false;
  }

  if (opts.sampleRate == null) {
    opts.sampleRate = 0;
  } else if (opts.sampleRate < 0 || opts.sampleRate > 1) {
    throw new Error('Sample rate must be between 0 and 1');
  }

  return true;
}
