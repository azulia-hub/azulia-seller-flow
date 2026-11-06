import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { cutShippingLabels } from '../../src/adapters/amazon-labels/cutter'

// Opt-in only. Private originals and generated PDFs never enter the repository.
const reference = process.env.AZULIA_LABEL_REFERENCE
it.skipIf(!reference)('matches the original Python cutter on private samples at print resolutions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'azulia-label-parity-'))
  try {
    const source = join(reference!, 'input'), paths = readdirSync(source).filter(name => /\.pdf$/i.test(name)).sort().map(name => join(source, name))
    if (process.env.AZULIA_LABEL_EXTRA_FILE) paths.push(process.env.AZULIA_LABEL_EXTRA_FILE)
    expect(paths.length).toBeGreaterThan(0)
    const data = (path: string) => new Uint8Array(readFileSync(path)).buffer
    const result = await cutShippingLabels(paths.map(path => ({ name: path, bytes: data(path) })), { packingList: true }, { normal: data('public/fonts/DejaVuSans.ttf'), bold: data('public/fonts/DejaVuSans-Bold.ttf') })
    writeFileSync(join(directory, 'browser.pdf'), result.pdf)
    writeFileSync(join(directory, 'browser-packing-list.pdf'), result.packingPdf!)
    writeFileSync(join(directory, 'browser-packing-list.csv'), result.packingCsv!)
    const python = join(reference!, '.venv/bin/python')
    execFileSync(python, [join(reference!, 'amazon_labels.py'), ...paths, '-o', join(directory, 'reference.pdf'), '--packing-list'], { timeout: 60_000 })
    const audit = `
import sys
from collections import Counter
from pathlib import Path
import pymupdf as pdf
root = Path(sys.argv[1])
for suffix in ['', '-packing-list']:
    with pdf.open(root / ('reference' + suffix + '.pdf')) as expected, pdf.open(root / ('browser' + suffix + '.pdf')) as actual:
        assert len(expected) == len(actual), 'Page count changed'
        for a, b in zip(expected, actual):
            assert a.rect == b.rect, 'Page size changed'
            assert a.get_text() == b.get_text(), 'Product text or quantities changed'
            assert Counter(i['digest'] for i in a.get_image_info(hashes=True)) == Counter(i['digest'] for i in b.get_image_info(hashes=True)), 'Original image pixels changed'
            for dpi in [72, 203, 300]:
                assert a.get_pixmap(dpi=dpi).samples == b.get_pixmap(dpi=dpi).samples, f'Rendered page differs at {dpi} DPI'
assert (root / 'reference-packing-list.csv').read_bytes() == (root / 'browser-packing-list.csv').read_bytes(), 'Packing CSV changed'
print('Label and packing-list output matches at 72, 203 and 300 DPI.')
`
    expect(execFileSync(python, ['-c', audit, directory], { timeout: 60_000, encoding: 'utf8' })).toContain('output matches')
  } finally { rmSync(directory, { recursive: true, force: true }) }
}, 120_000)
