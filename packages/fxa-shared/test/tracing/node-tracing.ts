/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Resource } from '@opentelemetry/resources';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { assert, expect } from 'chai';
import proxyquire from 'proxyquire';
import sinon from 'sinon';
proxyquire.noCallThru();

import { TraceExporter as GcpTraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
import { InstrumentationScope } from '@opentelemetry/core';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
  SpanExporter,
  TimedEvent,
} from '@opentelemetry/sdk-trace-base';

import {
  Attributes,
  HrTime,
  Link,
  SpanContext,
  SpanKind,
  SpanStatus,
} from '@opentelemetry/api';
import { FxaGcpTraceExporter } from '../../tracing/node-tracing';

describe('node-tracing', () => {
  const sandbox = sinon.createSandbox();

  const spies: any = {
    register: sandbox.spy(NodeTracerProvider.prototype, 'register'),
    logger: {
      info: sandbox.spy(),
      trace: sandbox.spy(),
      warn: sandbox.spy(),
      error: sandbox.spy(),
      debug: sandbox.spy(),
    },
  };

  const mocks: any = {
    newJaegerExporter: sandbox.mock().returns(new JaegerExporter()),
    newSimpleSpanProcessor: sandbox.mock().callsFake((x: SpanExporter) => {
      return new SimpleSpanProcessor(x);
    }),
    newConsoleSpanExporter: sandbox.mock().returns(new ConsoleSpanExporter()),
    newBatchSpanProcessor: sandbox
      .mock()
      .callsFake((x: SpanExporter) => new BatchSpanProcessor(x)),
    newGcpTraceExporter: sandbox.mock().returns(new GcpTraceExporter()),
  };

  const tracing = proxyquire('../../tracing/node-tracing', {
    '@opentelemetry/exporter-jaeger': {
      JaegerExporter: mocks.newJaegerExporter,
    },
    '@opentelemetry/sdk-trace-base': {
      BatchSpanProcessor: mocks.newBatchSpanProcessor,
      ConsoleSpanExporter: mocks.newConsoleSpanExporter,
      SimpleSpanProcessor: mocks.newSimpleSpanProcessor,
    },
    '@google-cloud/opentelemetry-cloud-trace-exporter': {
      TraceExporter: mocks.newGcpTraceExporter,
    },
  });
  const { NodeTracingInitializer } = tracing;

  afterEach(() => {
    sandbox.reset();
  });

  after(() => {
    sandbox.restore();
  });

  it('requires a service name', () => {
    expect(() => {
      new tracing.NodeTracingInitializer({
        serviceName: '',
      });
    }).to.throws('Missing config. serviceName must be defined!');
    const processor = tracing.provider?.getTracer;

    assert.isUndefined(processor);
  });

  it('enables initializes with no modes', () => {
    new NodeTracingInitializer({
      serviceName: 'test',
    });

    sinon.assert.calledOnce(spies.register);
    sinon.assert.notCalled(mocks.newJaegerExporter);
    sinon.assert.notCalled(mocks.newGcpTraceExporter);
    sinon.assert.notCalled(mocks.newConsoleSpanExporter);
  });

  describe('console', () => {
    it('enables', () => {
      new NodeTracingInitializer(
        {
          serviceName: 'test',
          console: {
            enabled: true,
          },
        },
        spies.logger
      );

      sinon.assert.calledOnce(mocks.newConsoleSpanExporter);
      sinon.assert.notCalled(mocks.newJaegerExporter);
      sinon.assert.notCalled(mocks.newGcpTraceExporter);
      assert.ok(spies.register.calledTwice);
    });
  });

  describe('jaeger', () => {
    it('enables', () => {
      new NodeTracingInitializer(
        {
          serviceName: 'test',
          jaeger: {
            enabled: true,
          },
        },
        spies.logger
      );

      assert.ok(spies.register.calledTwice);
      sinon.assert.notCalled(mocks.newConsoleSpanExporter);
      sinon.assert.calledOnce(mocks.newJaegerExporter);
      sinon.assert.notCalled(mocks.newGcpTraceExporter);
    });
  });

  describe('gcp', () => {
    it('enables gcp logging', () => {
      new NodeTracingInitializer(
        {
          serviceName: 'test',
          gcp: {
            enabled: true,
          },
        },
        spies.logger
      );

      assert.ok(spies.register.calledTwice);
      sinon.assert.notCalled(mocks.newConsoleSpanExporter);
      sinon.assert.notCalled(mocks.newJaegerExporter);
      sinon.assert.calledOnce(mocks.newBatchSpanProcessor);
      sinon.assert.calledOnce(mocks.newGcpTraceExporter);
    });
  });

  describe('init', () => {
    it('skips initialization if serviceName is missing', () => {
      tracing.init(
        {
          serviceName: '',
        },
        spies.logger
      );
      sinon.assert.calledWith(spies.logger.warn, 'node-tracing', {
        msg: 'skipping node-tracing initialization. serviceName must be defined.',
      });
    });

    it('initializes once', () => {
      tracing.init(
        {
          serviceName: 'test',
        },
        spies.logger
      );
    });

    it('warns of second initialization', () => {
      tracing.init(
        {
          serviceName: 'test',
        },
        spies.logger
      );
      sinon.assert.calledWith(spies.logger.warn, 'node-tracing', {
        msg: 'skipping node-tracing initialization. node-tracing already initialized.',
      });
    });
  });

  describe('scrubs pii', () => {
    // Dummy ReadableSpan for testing
    class FakeSpan implements ReadableSpan {
      public readonly name: string = 'test';
      public readonly kind: SpanKind = SpanKind.INTERNAL;
      public readonly spanContext: () => SpanContext = () => ({
        traceFlags: 0,
        traceId: '123',
        spanId: '123',
      });
      public readonly parentSpanId?: string = '123';
      public readonly startTime: HrTime = [0, 0];
      public readonly endTime: HrTime = [0, 0];
      public readonly status: SpanStatus = { code: 0 };
      public readonly attributes: Attributes;
      public readonly links: Link[] = [];
      public readonly events: TimedEvent[] = [];
      public readonly duration: HrTime = [0, 0];
      public readonly ended: boolean = true;
      public readonly resource: Resource = new Resource({});
      public readonly instrumentationLibrary: InstrumentationScope = {
        name: '',
      };

      constructor(attributes: Attributes) {
        this.attributes = attributes;
        this.resource = new Resource(attributes);
      }
    }

    it('removes db.statements', () => {
      const exporter = new FxaGcpTraceExporter();
      const spans: ReadableSpan[] = [
        new FakeSpan({ 'db.statement': 'select * from test' }),
      ];
      exporter.export(spans, () => {});
      expect(spans[0].attributes['db.statement']).equals('[FILTERED]');
    });
  });
});
