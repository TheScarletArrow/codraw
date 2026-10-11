/** A build of CoDraw: the version of the app and the id of the build, as `version.json` names them. */
export interface Build {
  version: string
  build: string
}

/** The build this code is part of. */
export const currentBuild: Build = { version: __CODRAW_VERSION__, build: __CODRAW_BUILD__ }

/** The file of the build that the server gives now, without the cache of the browser. */
export const VERSION_URL = '/version.json'

const isBuild = (value: unknown): value is Build =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Build).version === 'string' &&
  typeof (value as Build).build === 'string' &&
  (value as Build).build !== ''

/**
 * The build that the server gives now, or `null` when that is unknown: no connection, an error, or an answer that is
 * not the file of a build, e.g. the page of the app of a server that has no such file.
 */
export async function fetchDeployedBuild(): Promise<Build | null> {
  try {
    const response = await fetch(VERSION_URL, { cache: 'no-store', credentials: 'same-origin' })
    if (!response.ok) return null
    const body: unknown = await response.json()
    return isBuild(body) ? { version: body.version, build: body.build } : null
  } catch {
    return null
  }
}

/** The server gives another build than this one: a deployment, or a rollback, happened since the page was loaded. */
export const isOtherBuild = (deployed: Build | null): boolean => deployed !== null && deployed.build !== currentBuild.build
