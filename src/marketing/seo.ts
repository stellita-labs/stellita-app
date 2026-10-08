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
 * Client-side SEO for the marketing routes: title, description, canonical, and
 * Open Graph / Twitter cards. A SPA can't pre-render, but crawlers that execute
 * JS (and link unfurlers via the static index.html defaults) pick these up.
 */
export function useMarketingSeo({
  title,
  description,
  path,
  noindex = false,
}: {
  title: string
  description: string
  path: string
  noindex?: boolean
}) {
  useEffect(() => {
    const url = `${SITE}${path}`
    document.title = title
    setMeta('name', 'description', description)
    setCanonical(url)
    setMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow')

    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:site_name', 'Stellita')
    setMeta('property', 'og:title', title)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:image', OG_IMAGE)

    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', title)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:image', OG_IMAGE)

    return () => {
      setMeta('name', 'robots', 'index, follow')
      setCanonical(`${SITE}/`)
    }
  }, [title, description, path, noindex])
}
