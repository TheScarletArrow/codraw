import { AvoidLib } from 'libavoid-js'
import wasmUrl from 'libavoid-js/libavoid.wasm?url'
import type { RoutingRequest, RoutingResponse } from './edgeRouter.ts'
import { routeEdges } from './routeEdges.ts'

// Routes the edges of a page off the main thread: a large schema takes up to a second.
const loaded = AvoidLib.load(wasmUrl)

self.onmessage = async ({ data }: MessageEvent<RoutingRequest>) => {
  let response: RoutingResponse
  try {
    await loaded
    response = { id: data.id, routes: routeEdges(AvoidLib.getInstance(), data.input) }
  } catch (error) {
    response = { id: data.id, error: String(error) }
  }
  self.postMessage(response)
}
