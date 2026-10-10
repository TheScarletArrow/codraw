import { Button } from '@/components/ui/button'
import { loginUrl } from '../api/auth.ts'
import { useLoginOptions } from './session.ts'

/** «Войти через …» for every provider of the installation, the first one the main button. */
export function SignInButtons() {
  const options = useLoginOptions()
  return options.data?.providers.map((provider, index) => (
    <Button key={provider.id} asChild variant={index === 0 ? 'default' : 'outline'}>
      <a href={loginUrl(provider.id)}>Войти через {provider.name}</a>
    </Button>
  ))
}
