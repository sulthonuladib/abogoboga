import { Runtime } from 'foldkit'

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
