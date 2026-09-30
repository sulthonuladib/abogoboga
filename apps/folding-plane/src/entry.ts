import { Runtime } from 'foldkit'

import { ObservabilityBrowserLive } from '@lister/observability'

import { Flags } from './flags'
import { Message } from './message'
import { Model } from './model'
import { type SignalSocketService, managedResources, subscriptions } from './realtime'
import { init, update } from './update'
import { view } from './view'

// NOTE: TypeScript cannot infer the managed-resource service from the config
// object, so the app names it explicitly, the way the Foldkit website does.
const application = Runtime.makeApplication<
  typeof Model.Type,
  Message,
  typeof Flags.Type,
  never,
  SignalSocketService
>({
  Model,
  Flags,
  init,
  update,
  view,
  subscriptions,
  managedResources,
  // NOTE: the runtime builds this layer once into its scope and provides it
  // outermost around each Command, so the tracer is in context when a Command's
  // span is created. An absent collector URL builds a layer that exports
  // nothing.
  resources: ObservabilityBrowserLive({
    baseUrl: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: 'folding-plane',
  }),
  container: document.getElementById('root'),
  routing: {
    onUrlRequest: (request) => Message.ClickedLink({ request }),
    onUrlChange: (url) => Message.ChangedUrl({ url }),
  },
  devTools: {
    Message,
  },
})

Runtime.hydrate(application, { buildId: import.meta.env.FOLDKIT_BUILD_ID })
