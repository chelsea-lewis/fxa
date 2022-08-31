/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { expect } from 'chai';
import proxyquire from 'proxyquire';
import sinon from 'sinon';
proxyquire.noCallThru();

import { TraceExporter as GcpTraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

describe.only('browser tracing', () => {
  const sandbox = sinon.createSandbox();

  class FakeZoneContextManager {
    constructor() {}
    enable() {
      return false;
    }
  }

  let tracing: any;
  let mocks: any;
  let spies: any;

  beforeEach(() => {
    sandbox.reset();
    sandbox.restore();

    spies = {
      register: sandbox.spy(WebTracerProvider.prototype, 'register'),
      logger: {
        info: sandbox.spy(),
        trace: sandbox.spy(),
        warn: sandbox.spy(),
        error: sandbox.spy(),
        debug: sandbox.spy(),
      },
    };

    mocks = {
      newJaegerExporter: sandbox
        .mock()
        .atMost(10)
        .callsFake(() => {
          return new JaegerExporter();
        }),
      newSimpleSpanProcessor: sandbox
        .mock()
        .atMost(10)
        .callsFake((x: SpanExporter) => {
          return new SimpleSpanProcessor(x);
        }),
      newConsoleSpanExporter: sandbox
        .mock()
        .atMost(10)
        .returns(new ConsoleSpanExporter()),
      newBatchSpanProcessor: sandbox
        .mock()
        .atMost(10)
        .callsFake((x: SpanExporter) => new BatchSpanProcessor(x)),
      newGcpTraceExporter: sandbox
        .mock()
        .atMost(10)
        .returns(new GcpTraceExporter()),
      newDocumentLoadInstrumentation: sandbox
        .mock()
        .atMost(10)
        .returns(new DocumentLoadInstrumentation()),
      newUserInteractionInstrumentation: sandbox
        .mock()
        .atMost(10)
        .returns(new UserInteractionInstrumentation()),
      newXMLHttpRequestInstrumentation: sandbox
        .mock()
        .atMost(10)
        .returns(new XMLHttpRequestInstrumentation()),
    };

    tracing = proxyquire('../../tracing/tracing-browser', {
      '@opentelemetry/context-zone': {
        // This package doesn't mock very well, as it's expecting a browser context.
        // We will just return a dummy value to work  around this.
        ZoneContextManager: FakeZoneContextManager,
      },
      // '@opentelemetry/instrumentation-document-load': {
      //   DocumentLoadInstrumentation: mocks.newDocumentLoadInstrumentation,
      // },
      // '@opentelemetry/instrumentation-user-interaction': {
      //   UserInteractionInstrumentation: mocks.newUserInteractionInstrumentation,
      // },
      // '@opentelemetry/instrumentation-xml-http-request': {
      //   XMLHttpRequestInstrumentation: mocks.newXMLHttpRequestInstrumentation,
      // },
      './tracing-base': proxyquire('../../tracing/tracing-base', {
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
      }),
    });
  });

  afterEach(() => {
    sandbox.reset();
    sandbox.restore();
  });

  describe('BrowserTracing', () => {
    it('requires a service name', () => {
      const initializer = new tracing.BrowserTracing({ serviceName: '' });
      expect(() => {
        initializer.init();
      }).to.throws('Missing config. serviceName must be defined!');
    });

    it('enables initializes with no modes', () => {
      new tracing.BrowserTracing({ serviceName: 'test' }).init();

      // sinon.assert.calledOnce(mocks.newDocumentLoadInstrumentation);
      // sinon.assert.calledOnce(mocks.newUserInteractionInstrumentation);
      // sinon.assert.calledOnce(mocks.newXMLHttpRequestInstrumentation);
      sinon.assert.called(spies.register);
      sinon.assert.notCalled(mocks.newJaegerExporter);
      sinon.assert.notCalled(mocks.newGcpTraceExporter);
      sinon.assert.notCalled(mocks.newConsoleSpanExporter);
    });

    it('initializes with all modes', () => {
      new tracing.BrowserTracing({
        serviceName: 'test',
        console: {
          enabled: true,
        },
        jaeger: {
          enabled: true,
        },
        gcp: {
          enabled: true,
        },
      }).init();

      // sinon.assert.calledOnce(mocks.newDocumentLoadInstrumentation);
      // sinon.assert.calledOnce(mocks.newUserInteractionInstrumentation);
      // sinon.assert.calledOnce(mocks.newXMLHttpRequestInstrumentation);
      sinon.assert.called(spies.register);

      sinon.assert.calledOnce(mocks.newJaegerExporter);
      sinon.assert.calledOnce(mocks.newGcpTraceExporter);
      sinon.assert.calledOnce(mocks.newConsoleSpanExporter);
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
      sinon.assert.calledWith(spies.logger.warn, 'web-tracing', {
        msg: 'skipping tracing initialization. serviceName must be defined.',
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
      tracing.init(
        {
          serviceName: 'test',
        },
        spies.logger
      );
      sinon.assert.calledWith(spies.logger.warn, 'web-tracing', {
        msg: 'tracing already initialized!',
      });
    });
  });
});
