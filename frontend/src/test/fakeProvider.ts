import type { HocuspocusProviderConfiguration } from '@hocuspocus/provider'

type Listener = () => void

/** Minimal stand-in for the y-protocols Awareness used by HocuspocusProvider. */
export class FakeAwareness {
  readonly clientID: number
  private readonly states = new Map<number, Record<string, unknown>>()
  private readonly listeners = new Set<Listener>()

  constructor(clientID: number) {
    this.clientID = clientID
  }

  getStates() {
    return this.states
  }

  on(_event: 'change', listener: Listener) {
    this.listeners.add(listener)
  }

  off(_event: 'change', listener: Listener) {
    this.listeners.delete(listener)
  }

  setLocalStateField(key: string, value: unknown) {
    this.setState(this.clientID, { ...this.states.get(this.clientID), [key]: value })
  }

  /** Simulates a state change of another participant; `null` means the participant left. */
  setState(clientId: number, state: Record<string, unknown> | null) {
    if (state) this.states.set(clientId, state)
    else this.states.delete(clientId)
    this.listeners.forEach((listener) => listener())
  }
}

/** Records every provider the page creates and lets tests drive its callbacks. */
export class FakeHocuspocusProvider {
  static instances: FakeHocuspocusProvider[] = []

  readonly configuration: HocuspocusProviderConfiguration
  readonly awareness = new FakeAwareness(1)
  disconnected = false
  destroyed = false
  /** Stateless messages the page sent through the provider. */
  readonly sentStateless: string[] = []

  constructor(configuration: HocuspocusProviderConfiguration) {
    this.configuration = configuration
    FakeHocuspocusProvider.instances.push(this)
  }

  static latest(): FakeHocuspocusProvider {
    const provider = FakeHocuspocusProvider.instances.at(-1)
    if (!provider) throw new Error('No provider was created')
    return provider
  }

  setAwarenessField(key: string, value: unknown) {
    this.awareness.setLocalStateField(key, value)
  }

  disconnect() {
    this.disconnected = true
  }

  sendStateless(payload: string) {
    this.sentStateless.push(payload)
  }

  /** Simulates a stateless message that collab relays from another participant. */
  emitStateless(payload: string) {
    this.configuration.onStateless?.({ payload })
  }

  /** Simulates collab closing the connection to the document with a reason, or the socket with a code. */
  emitClose(reason: string, code = 1000) {
    this.configuration.onClose?.({ event: { code, reason } } as never)
  }

  destroy() {
    this.destroyed = true
  }

  emitStatus(status: 'connecting' | 'connected' | 'disconnected') {
    this.configuration.onStatus?.({ status } as never)
  }

  emitSynced() {
    this.configuration.onSynced?.({ state: true })
  }

  /** Asks for a token like the provider does before each connection. */
  async requestToken(): Promise<string | null> {
    const { token } = this.configuration
    return typeof token === 'function' ? await token() : (token ?? null)
  }

  emitAuthenticated(scope: 'read-write' | 'readonly' = 'read-write') {
    this.configuration.onAuthenticated?.({ scope })
  }

  emitAuthenticationFailed(reason: string) {
    this.configuration.onAuthenticationFailed?.({ reason })
  }
}
