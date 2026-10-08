import { useEffect } from 'react'

const SITE = 'https://www.stellita.app'
const OG_IMAGE = `${SITE}/og.png`

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Client-side SEO for marketing and shared routes: title, description, canonical,
 * robots indexing directive, and Open Graph / Twitter cards.
 */
export function useMarketingSeo({
  title,
  description,
  path,
  indexable = true,
  noindex = false,
}: {
  title: string
  description?: string
  path: string
  indexable?: boolean
  noindex?: boolean
}) {
  useEffect(() => {
    const url = `${SITE}${path}`
    const prevTitle = document.title
    const prevRobots =
      document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.getAttribute('content') ?? 'index, follow'
    const prevCanonical =
      document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href') ?? `${SITE}/`

    document.title = title
    if (description) setMeta('name', 'description', description)
    setCanonical(url)
    setMeta('name', 'robots', indexable ? 'index, follow' : 'noindex, follow')
    setMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow')

    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:site_name', 'Stellita')
    setMeta('property', 'og:title', title)
    if (description) setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:image', OG_IMAGE)

    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', title)
    if (description) setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:image', OG_IMAGE)

    return () => {
      document.title = prevTitle
      setMeta('name', 'robots', prevRobots)
      setCanonical(prevCanonical)
    }
  }, [title, description, path, indexable])
      setMeta('name', 'robots', 'index, follow')
      setCanonical(`${SITE}/`)
    }
  }, [title, description, path, noindex])
}
