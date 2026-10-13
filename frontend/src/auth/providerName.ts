import { providerMessages as m } from './providers.messages.ts'

/**
 * The name of a sign-in provider on the login page and in the privacy policy, in the language of the interface: Яндекс ID
 * is Yandex ID in English, while GitHub, Google, VK ID and the providers of the operator keep the name of the backend.
 */
export function providerName(provider: { id: string; name: string }): string {
  return provider.id === 'yandex' ? m.yandex : provider.name
}
