import restApi from './integrationIcons/rest-api.svg?raw'
import soap from './integrationIcons/soap.svg?raw'
import websocket from './integrationIcons/websocket.svg?raw'
import webhook from './integrationIcons/webhook.svg?raw'
import messageQueue from './integrationIcons/message-queue.svg?raw'
import pubsub from './integrationIcons/pubsub.svg?raw'
import esb from './integrationIcons/esb.svg?raw'
import email from './integrationIcons/email.svg?raw'
import sms from './integrationIcons/sms.svg?raw'
import push from './integrationIcons/push.svg?raw'
import fileTransfer from './integrationIcons/file-transfer.svg?raw'
import etl from './integrationIcons/etl.svg?raw'
import { svgImage } from './images.ts'

/**
 * The icons of the ways systems talk to each other, in the order of the palette: glyphs of Lucide on a square of the
 * color of their group — APIs, messaging, notifications, files and data; see `integrationIcons/README.md`.
 */
const INTEGRATIONS = [
  ['integration-rest', restApi],
  ['integration-soap', soap],
  ['integration-websocket', websocket],
  ['integration-webhook', webhook],
  ['integration-message-queue', messageQueue],
  ['integration-pubsub', pubsub],
  ['integration-esb', esb],
  ['integration-email', email],
  ['integration-sms', sms],
  ['integration-push', push],
  ['integration-file-transfer', fileTransfer],
  ['integration-etl', etl],
] as const

export type IntegrationId = (typeof INTEGRATIONS)[number][0]

/** The pictures of the icons by shape, embedded like the logos of the providers. */
export const INTEGRATION_IMAGES: ReadonlyArray<readonly [IntegrationId, string]> = INTEGRATIONS.map(([id, svg]) => [id, svgImage(svg)])
