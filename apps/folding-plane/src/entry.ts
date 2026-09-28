import { Runtime } from 'foldkit'

import { Flags } from './flags'
import { Message } from './message'
import { Model } from './model'
import { init, update } from './update'
import { view } from './view'

const application = Runtime.makeApplication({
  Model,
  Flags,
  init,
  update,
  view,
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
