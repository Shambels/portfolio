declare module '*.mdx' {
  import type { MDXProps } from 'mdx/types'
  import type { JSX } from 'react'

  /** Shape is validated once in `src/content.ts`; the loader cannot type it. */
  export const frontmatter: unknown
  export default function MDXContent(props: MDXProps): JSX.Element
}
