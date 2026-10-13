import { describe, expect, it } from 'vitest'
import { creditOf, fileTitle, plainText, readSearch, searchUrl } from './commons'

describe('Wikimedia Commons', () => {
  it('texte d’un champ HTML : sans balises, blocs cachés ni entités', () => {
    expect(plainText('between 1830<div style="display: none;">date QS:P,+1830</div>')).toBe('between 1830')
    expect(plainText('<bdi><a href="x">Eugène&nbsp;Delacroix</a></bdi> &amp; co')).toBe('Eugène Delacroix & co')
  })

  it('recherche d’images (fichiers), avec auteur et licence', () => {
    const url = new URL(searchUrl('Kant portrait'))
    expect(url.searchParams.get('gsrnamespace')).toBe('6')
    expect(url.searchParams.get('origin')).toBe('*')
    expect(url.searchParams.get('gsrsearch')).toContain('Kant portrait')
    expect(fileTitle('File:Immanuel_Kant_(painted_portrait).jpg')).toBe('Immanuel Kant (painted portrait)')
  })

  it('réponse : dans l’ordre de pertinence, avec ce qu’il faut pour citer', () => {
    const body = {
      query: {
        pages: {
          '2': { title: 'File:B.jpg', index: 2, imageinfo: [{ thumburl: 'https://t/b.jpg', descriptionurl: 'https://c/B', extmetadata: {} }] },
          '1': {
            title: 'File:A_portrait.jpg',
            index: 1,
            imageinfo: [
              {
                thumburl: 'https://t/a.jpg',
                thumbwidth: 960,
                thumbheight: 1200,
                descriptionurl: 'https://c/A',
                extmetadata: { Artist: { value: '<a>Becker</a>' }, LicenseShortName: { value: 'Public domain' }, ObjectName: { value: 'Portrait of Kant' } },
              },
            ],
          },
          '3': { title: 'File:C.jpg', index: 3, imageinfo: [{}] },
        },
      },
    }
    const images = readSearch(body)
    expect(images.map((i) => i.title)).toEqual(['Portrait of Kant', 'B'])
    expect(images[0]).toMatchObject({ author: 'Becker', license: 'Public domain', page: 'https://c/A', height: 1200 })
    expect(creditOf(images[0])).toBe('Becker, Public domain')
    expect(creditOf(images[1])).toBe('')
  })
})
