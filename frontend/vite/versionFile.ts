import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

/** The file of the build that open tabs read to learn that the server has another build. */
export const VERSION_FILE = 'version.json'

/** What `version.json` says: the version of the app and the build that the server gives. */
export interface BuildInfo {
  version: string
  build: string
}

/**
 * The build that this run of Vite makes: `CODRAW_BUILD_ID` when it is set, else the moment of the build. The code cannot name the hash of the files it is in, so every build gets its own id instead.
 */
export function buildInfo(
  packageJson: string,
  env: NodeJS.ProcessEnv = process.env,
  now: () => number = Date.now,
): BuildInfo {
  const { version } = JSON.parse(readFileSync(packageJson, 'utf8')) as { version: string }
  return { version, build: env.CODRAW_BUILD_ID?.trim() || now().toString(36) }
}

/**
 * Gives the code its version and build as `__CODRAW_VERSION__` and `__CODRAW_BUILD__` and puts `version.json` with
 * them at the root of the build; the dev server answers it too.
 */
export function versionFile(info: BuildInfo): Plugin {
  const source = JSON.stringify(info)
  return {
    name: 'codraw-version-file',
    config: () => ({
      define: {
        __CODRAW_VERSION__: JSON.stringify(info.version),
        __CODRAW_BUILD__: JSON.stringify(info.build),
      },
    }),
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== `/${VERSION_FILE}`) return next()
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(source)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: VERSION_FILE, source })
    },
  }
}
