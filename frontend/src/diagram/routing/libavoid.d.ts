/** The part of the API of `libavoid-js` that CoDraw uses; the package points to typings it does not ship. */
declare module 'libavoid-js' {
  export interface AvoidPoint {
    x: number
    y: number
  }

  export interface PolyLine {
    size(): number
    get_ps(index: number): AvoidPoint
  }

  export interface Router {
    setRoutingParameter(parameter: number, value: number): void
    setRoutingOption(option: number, value: boolean): void
    processTransaction(): boolean
  }

  export type ShapeRef = object
  export type Rectangle = object
  export type ConnEnd = object

  export interface ShapeConnectionPin {
    setExclusive(exclusive: boolean): void
  }

  export interface ConnRef {
    displayRoute(): PolyLine
  }

  export interface Avoid {
    Router: new (flags: number) => Router
    Point: new (x: number, y: number) => AvoidPoint
    Rectangle: new (centre: AvoidPoint, width: number, height: number) => Rectangle
    ShapeRef: new (router: Router, polygon: Rectangle) => ShapeRef
    ShapeConnectionPin: new (
      shape: ShapeRef,
      classId: number,
      xOffset: number,
      yOffset: number,
      proportional: boolean,
      insideOffset: number,
      directions: number,
    ) => ShapeConnectionPin
    ConnEnd: new (shape: ShapeRef, classId: number) => ConnEnd
    ConnRef: new (router: Router, source: ConnEnd, target: ConnEnd) => ConnRef
    /** Frees an object made with `new`; objects that the router owns (shapes, pins, connectors) go with the router. */
    destroy(object: object): void
    OrthogonalRouting: number
    ConnDirUp: number
    ConnDirDown: number
    ConnDirLeft: number
    ConnDirRight: number
    shapeBufferDistance: number
    idealNudgingDistance: number
    segmentPenalty: number
    nudgeOrthogonalSegmentsConnectedToShapes: number
    nudgeSharedPathsWithCommonEndPoint: number
    performUnifyingNudgingPreprocessingStep: number
  }

  export const AvoidLib: {
    /** Loads the WebAssembly, from `wasmUrl` in a browser. */
    load(wasmUrl?: string): Promise<void>
    getInstance(): Avoid
  }
}
