import { assert } from 'chai'
import markdownit from '../index.mjs'

function refTokens (tokens) {
  return tokens.filter(t => t.type === 'reference_definition')
}

describe('reference_definition token', function () {
  it('emits a block token for a link reference definition', function () {
    const md = markdownit()
    const tokens = md.parse('[foo]: /url "title"\n', {})
    const refs = refTokens(tokens)

    assert.strictEqual(refs.length, 1)
    assert.strictEqual(refs[0].block, true)
    assert.strictEqual(refs[0].nesting, 0)
    assert.deepStrictEqual(refs[0].map, [0, 1])
    assert.deepStrictEqual(refs[0].meta, {
      label: 'foo',
      normalizedLabel: 'FOO',
      href: '/url',
      title: 'title',
      effective: true
    })
  })

  it('handles definitions without title', function () {
    const md = markdownit()
    const refs = refTokens(md.parse('[foo]: /url\n', {}))

    assert.strictEqual(refs.length, 1)
    assert.strictEqual(refs[0].meta.title, '')
    assert.strictEqual(refs[0].meta.href, '/url')
  })

  it('keeps the raw label and the normalized label apart', function () {
    const md = markdownit()
    const refs = refTokens(md.parse('[  FOO\tBar  ]: /url\n', {}))

    assert.strictEqual(refs.length, 1)
    assert.strictEqual(refs[0].meta.label, '  FOO\tBar  ')
    assert.strictEqual(refs[0].meta.normalizedLabel, 'FOO BAR')
  })

  it('emits a token for every duplicate, only the first is effective', function () {
    const md = markdownit()
    const env = {}
    const refs = refTokens(md.parse('[foo]: /first\n[foo]: /second\n[FOO]: /third\n', env))

    assert.strictEqual(refs.length, 3)
    assert.deepStrictEqual(refs.map(t => t.map), [[0, 1], [1, 2], [2, 3]])
    assert.deepStrictEqual(refs.map(t => t.meta.href), ['/first', '/second', '/third'])
    assert.deepStrictEqual(refs.map(t => t.meta.effective), [true, false, false])

    // first definition still wins, exactly as before
    assert.deepStrictEqual(env.references, { FOO: { href: '/first', title: '' } })
    assert.strictEqual(md.render('[foo]: /first\n[foo]: /second\n\n[foo]\n'),
      '<p><a href="/first">foo</a></p>\n')
  })

  it('maps multi-line definitions to all lines they span', function () {
    const md = markdownit()
    const refs = refTokens(md.parse('text\n\n[foo]:\n  /url\n  "title"\n\nmore\n', {}))

    assert.strictEqual(refs.length, 1)
    assert.deepStrictEqual(refs[0].map, [2, 5])
    assert.strictEqual(refs[0].meta.href, '/url')
    assert.strictEqual(refs[0].meta.title, 'title')
  })

  it('locates definitions inside blockquotes', function () {
    const md = markdownit()
    const tokens = md.parse('> para\n>\n> [foo]: /url\n', {})
    const refs = refTokens(tokens)

    assert.strictEqual(refs.length, 1)
    assert.deepStrictEqual(refs[0].map, [2, 3])

    // token sits inside the blockquote in the stream
    const idx = tokens.indexOf(refs[0])
    assert.strictEqual(tokens[idx - 1].type, 'paragraph_close')
    assert.strictEqual(tokens[idx + 1].type, 'blockquote_close')
  })

  it('locates definitions inside list items', function () {
    const md = markdownit()
    const tokens = md.parse('- one\n- [foo]: /url\n', {})
    const refs = refTokens(tokens)

    assert.strictEqual(refs.length, 1)
    assert.deepStrictEqual(refs[0].map, [1, 2])
  })

  it('keeps source order of definitions and other blocks', function () {
    const md = markdownit()
    const tokens = md.parse('[a]: /1\n\ntext\n\n[b]: /2\n', {})

    assert.deepStrictEqual(tokens.map(t => t.type), [
      'reference_definition',
      'paragraph_open',
      'inline',
      'paragraph_close',
      'reference_definition'
    ])
  })

  it('emits no tokens when there are no definitions', function () {
    const md = markdownit()

    assert.strictEqual(refTokens(md.parse('just a paragraph\n', {})).length, 0)
    // not a valid definition (no destination) -> paragraph, no token
    assert.strictEqual(refTokens(md.parse('[foo]:\n', {})).length, 0)
    // definitions can't interrupt paragraphs -> no token
    assert.strictEqual(refTokens(md.parse('text\n[foo]: /url\n', {})).length, 0)
  })

  it('still fills env.references', function () {
    const md = markdownit()
    const env = {}

    md.parse('[foo]: /url "title"\n', env)
    assert.deepStrictEqual(env.references, { FOO: { href: '/url', title: 'title' } })
  })

  it('renders nothing by default', function () {
    const md = markdownit()

    assert.strictEqual(md.render('[foo]: /url\n'), '')
    assert.strictEqual(
      md.render('[foo]: /url "title"\n\n[foo]\n'),
      '<p><a href="/url" title="title">foo</a></p>\n'
    )
  })

  it('does not affect newlines of surrounding blocks', function () {
    const md = markdownit()

    // empty list item / blockquote left behind by a definition
    assert.strictEqual(md.render('- [foo]: /url\n'), '<ul>\n<li></li>\n</ul>\n')
    assert.strictEqual(md.render('> [foo]: /url\n'), '<blockquote></blockquote>\n')
    // tight list with a definition and a paragraph
    assert.strictEqual(md.render('- [foo]: /url\n  text\n'), '<ul>\n<li>text</li>\n</ul>\n')
    // block opener right after a definition
    assert.strictEqual(md.render('[foo]: /url\n\n# h\n'), '<h1>h</h1>\n')
  })

  it('can be rendered via renderer.rules like any other token', function () {
    const md = markdownit()

    md.renderer.rules.reference_definition = function (tokens, idx) {
      const meta = tokens[idx].meta
      return '<!-- ' + meta.normalizedLabel + ' -> ' + meta.href + ' -->\n'
    }

    assert.strictEqual(
      md.render('[foo]: /url\n\ntext\n'),
      '<!-- FOO -> /url -->\n<p>text</p>\n'
    )
  })
})
