import { assert } from 'chai'
import markdownit from '../index.mjs'

function refTokens (tokens) {
  return tokens.filter(t => t.type === 'reference_definition')
}

describe('reference_definition token', function () {
  it('emits a block token for each definition', function () {
    const md = markdownit()
    const tokens = md.parse('[foo]: /url\n', {})

    const refs = refTokens(tokens)
    assert.strictEqual(refs.length, 1)

    const t = refs[0]
    assert.strictEqual(t.block, true)
    assert.strictEqual(t.nesting, 0)
    assert.deepStrictEqual(t.map, [0, 1])
  })

  it('exposes raw label, normalized label, href and title', function () {
    const md = markdownit()
    const tokens = md.parse('[Foo Bar]: /url "the title"\n', {})

    const t = refTokens(tokens)[0]
    assert.strictEqual(t.meta.label, 'Foo Bar')
    assert.strictEqual(t.meta.normalizedLabel, 'FOO BAR')
    assert.strictEqual(t.meta.href, '/url')
    assert.strictEqual(t.meta.title, 'the title')
  })

  it('reports empty title when not present', function () {
    const md = markdownit()
    const tokens = md.parse('[foo]: /url\n', {})

    assert.strictEqual(refTokens(tokens)[0].meta.title, '')
  })

  it('normalizes labels like the reference map does', function () {
    const md = markdownit()
    const env = {}
    const tokens = md.parse('[Foo]: /url\n', env)

    const t = refTokens(tokens)[0]
    assert.strictEqual(t.meta.label, 'Foo')
    // normalized label matches the key used in env.references
    assert.strictEqual(t.meta.normalizedLabel, 'FOO')
    assert.ok(Object.prototype.hasOwnProperty.call(env.references, t.meta.normalizedLabel))
  })

  it('maps multi-line definitions to the full line range', function () {
    const md = markdownit()
    const src = "before\n\n[a]:\n/url\n'title'\n\nafter\n"
    const tokens = md.parse(src, {})

    const t = refTokens(tokens)[0]
    assert.deepStrictEqual(t.map, [2, 5])
    assert.strictEqual(t.meta.href, '/url')
    assert.strictEqual(t.meta.title, 'title')
  })

  it('keeps source order and position inside the token stream', function () {
    const md = markdownit()
    const tokens = md.parse('text\n\n[a]: /1\n\nmore\n\n[b]: /2\n', {})

    const types = tokens.map(t => t.type)
    assert.deepStrictEqual(types, [
      'paragraph_open', 'inline', 'paragraph_close',
      'reference_definition',
      'paragraph_open', 'inline', 'paragraph_close',
      'reference_definition'
    ])
    assert.strictEqual(tokens[3].meta.normalizedLabel, 'A')
    assert.strictEqual(tokens[7].meta.normalizedLabel, 'B')
  })

  it('emits a token for every duplicate, marking only the first as effective', function () {
    const md = markdownit()
    const env = {}
    const tokens = md.parse('[foo]: /first\n[foo]: /second\n[FOO]: /third\n', env)

    const refs = refTokens(tokens)
    assert.strictEqual(refs.length, 3)
    assert.deepStrictEqual(refs.map(t => t.meta.isEffective), [true, false, false])
    assert.deepStrictEqual(refs.map(t => t.meta.href), ['/first', '/second', '/third'])

    // first definition still wins in the reference map
    assert.strictEqual(env.references.FOO.href, '/first')
  })

  it('resolves links exactly like before (first definition wins)', function () {
    const md = markdownit()
    const html = md.render('[foo]: /first\n[foo]: /second\n\n[foo]\n')

    assert.strictEqual(html, '<p><a href="/first">foo</a></p>\n')
  })

  it('locates definitions inside blockquotes', function () {
    const md = markdownit()
    const tokens = md.parse('text\n\n> [foo]: /url\n', {})

    const refs = refTokens(tokens)
    assert.strictEqual(refs.length, 1)
    assert.deepStrictEqual(refs[0].map, [2, 3])
    assert.strictEqual(refs[0].meta.href, '/url')
  })

  it('locates definitions inside list items', function () {
    const md = markdownit()
    const tokens = md.parse('- [foo]: /url\n- [bar]: /url2\n', {})

    const refs = refTokens(tokens)
    assert.strictEqual(refs.length, 2)
    assert.deepStrictEqual(refs[0].map, [0, 1])
    assert.deepStrictEqual(refs[1].map, [1, 2])
    assert.strictEqual(refs[0].meta.normalizedLabel, 'FOO')
    assert.strictEqual(refs[1].meta.normalizedLabel, 'BAR')
  })

  it('still fills env.references for existing plugins', function () {
    const md = markdownit()
    const env = {}
    md.parse('[foo]: /url "title"\n', env)

    assert.deepStrictEqual(env.references, { FOO: { title: 'title', href: '/url' } })
  })

  it('emits no token for invalid definitions', function () {
    const md = markdownit()
    const tokens = md.parse('[foo]: \n\n[bar]:\n\n[]: /url\n', {})

    assert.strictEqual(refTokens(tokens).length, 0)
  })

  it('renders nothing by default', function () {
    const md = markdownit()

    assert.strictEqual(md.render('[foo]: /url\n\n[foo]\n'), '<p><a href="/url">foo</a></p>\n')
    assert.strictEqual(md.render('[foo]: /url\n'), '')
    assert.strictEqual(md.render('> [foo]: /url\n'), '<blockquote></blockquote>\n')
  })

  it('can be rendered via a custom renderer rule', function () {
    const md = markdownit()
    md.renderer.rules.reference_definition = function (tokens, idx) {
      const meta = tokens[idx].meta
      return '<!-- ' + meta.normalizedLabel + ' -> ' + meta.href + ' -->\n'
    }

    assert.strictEqual(
      md.render('[foo]: /url\n\n[foo]\n'),
      '<!-- FOO -> /url -->\n<p><a href="/url">foo</a></p>\n'
    )
  })

  it('does not affect rendering of surrounding blocks', function () {
    const md = markdownit()

    // tight list: definition at the start of the item
    assert.strictEqual(
      md.render('- [ref]: /url\n  foo\n  > bar\n'),
      '<ul>\n<li>foo\n<blockquote>\n<p>bar</p>\n</blockquote>\n</li>\n</ul>\n'
    )
    // loose list: definition between paragraph and blockquote
    assert.strictEqual(
      md.render('- foo\n\n  [ref]: /url\n\n  > bar\n'),
      '<ul>\n<li>\n<p>foo</p>\n<blockquote>\n<p>bar</p>\n</blockquote>\n</li>\n</ul>\n'
    )
    // definition between heading and blockquote
    assert.strictEqual(
      md.render('# h\n[ref]: /url\n> bar\n'),
      '<h1>h</h1>\n<blockquote>\n<p>bar</p>\n</blockquote>\n'
    )
  })
})
