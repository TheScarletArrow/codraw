/** The catalog of the logos of technologies of simple-icons, made by the plugin `vite/techIcons.ts`. */
declare module 'virtual:tech-icons' {
  /** The slug, the title, the brand color without `#` and the other names of each logo. */
  export const icons: [slug: string, title: string, hex: string, names: string[]][]
  /** The paths of the logos of a group, by slug; a group is the first letter of the slug, `0` for a digit. */
  export function paths(group: string): Promise<{ default: Record<string, string> }>
}
