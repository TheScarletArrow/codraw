import { describe, expect, it } from 'vitest'
import { addressLink, boardLink, linkOf, movedPageLink, pageLink, parseLink } from './links.ts'

const ORIGIN = 'https://codraw.example'

describe('parseLink', () => {
  it('reads a link to a page as draw.io writes it', () => {
    expect(parseLink('data:page/id,containers', ORIGIN)).toEqual({ kind: 'page', pageId: 'containers' })
    expect(parseLink(pageLink('page-1'), ORIGIN)).toEqual({ kind: 'page', pageId: 'page-1' })
    expect(parseLink('data:page/id,', ORIGIN)).toBeNull()
    expect(parseLink('data:page/id,a b', ORIGIN)).toBeNull()
  })

  it('reads addresses of the web and of mail, as the browser parses them', () => {
    expect(parseLink('https://docs.example.com/payments', ORIGIN)).toEqual({ kind: 'url', url: 'https://docs.example.com/payments' })
    expect(parseLink(' http://example.com ', ORIGIN)).toEqual({ kind: 'url', url: 'http://example.com/' })
    expect(parseLink('https://example.com/a b', ORIGIN)).toEqual({ kind: 'url', url: 'https://example.com/a%20b' })
    expect(parseLink('mailto:team@example.com', ORIGIN)).toEqual({ kind: 'url', url: 'mailto:team@example.com' })
  })

  it('refuses anything that would run code or open something other than the web and mail', () => {
    for (const value of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'java\nscript:alert(1)',
      ' \tjavascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'data:image/png;base64,AAAA',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://example.com',
      'blob:https://codraw.example/1',
      '/boards/abc',
      'example.com',
      '',
      42,
      null,
      undefined,
    ]) {
      expect(parseLink(value, ORIGIN)).toBeNull()
    }
  })

  it('takes an address of a board of this CoDraw for a board, with its page', () => {
    expect(parseLink(`${ORIGIN}/boards/b-1`, ORIGIN)).toEqual({ kind: 'board', boardId: 'b-1', pageId: null, url: `${ORIGIN}/boards/b-1` })
    expect(parseLink(`${ORIGIN}/boards/b-1/?page=p-2&thread=t`, ORIGIN)).toEqual({
      kind: 'board',
      boardId: 'b-1',
      pageId: 'p-2',
      url: `${ORIGIN}/boards/b-1/?page=p-2&thread=t`,
    })
    expect(parseLink(boardLink('b 1', ORIGIN), ORIGIN)).toMatchObject({ kind: 'board', boardId: 'b 1' })
    // Another CoDraw, or another page of this one, is an address like any other.
    expect(parseLink('https://other.example/boards/b-1', ORIGIN)).toEqual({ kind: 'url', url: 'https://other.example/boards/b-1' })
    expect(parseLink(`${ORIGIN}/boards/b-1/proposals/p`, ORIGIN)).toMatchObject({ kind: 'url' })
  })
})

describe('linkOf', () => {
  it('gives the link of a style only when CoDraw opens it', () => {
    expect(linkOf({ link: ' https://example.com ' }, ORIGIN)).toBe('https://example.com')
    expect(linkOf({ link: 'javascript:alert(1)' }, ORIGIN)).toBeNull()
    expect(linkOf({ link: true }, ORIGIN)).toBeNull()
    expect(linkOf({}, ORIGIN)).toBeNull()
    expect(linkOf(null, ORIGIN)).toBeNull()
  })
})

describe('addressLink', () => {
  it('adds https:// to the name of a site and mailto: to an address of mail', () => {
    expect(addressLink('docs.example.com/payments', ORIGIN)).toBe('https://docs.example.com/payments')
    expect(addressLink('www.example.com', ORIGIN)).toBe('https://www.example.com/')
    expect(addressLink('localhost:8080/api', ORIGIN)).toBe('https://localhost:8080/api')
    expect(addressLink('team@example.com', ORIGIN)).toBe('mailto:team@example.com')
    expect(addressLink(' http://example.com/a ', ORIGIN)).toBe('http://example.com/a')
  })

  it('keeps a link to a board or a page', () => {
    expect(addressLink(`${ORIGIN}/boards/b-1?page=p`, ORIGIN)).toBe(`${ORIGIN}/boards/b-1?page=p`)
    expect(addressLink('data:page/id,p-2', ORIGIN)).toBe('data:page/id,p-2')
  })

  it('refuses what is not a link that CoDraw opens', () => {
    expect(addressLink('javascript:alert(1)', ORIGIN)).toBeNull()
    expect(addressLink('data:text/html,hi', ORIGIN)).toBeNull()
    expect(addressLink('платежи', ORIGIN)).toBeNull()
    expect(addressLink('two words.com', ORIGIN)).toBeNull()
    expect(addressLink('   ', ORIGIN)).toBeNull()
  })
})

describe('movedPageLink', () => {
  it('makes a link to a page with a new id lead to it', () => {
    const ids = new Map([['page-1', 'new-1']])

    expect(movedPageLink('data:page/id,page-1', ids)).toBe('data:page/id,new-1')
    expect(movedPageLink('data:page/id,page-2', ids)).toBe('data:page/id,page-2')
    expect(movedPageLink('https://example.com', ids)).toBe('https://example.com')
    expect(movedPageLink(undefined, ids)).toBeUndefined()
  })
})
