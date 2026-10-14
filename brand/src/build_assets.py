#!/usr/bin/env python3
"""Derive the Tabaa'ni logo asset set from the client's master PNG.

The master file is a 1254x1254 transparent PNG holding two visual groups:
  1) the emblem  (graduation cap + open book + calligraphic ornament)
  2) the wordmark (the Arabic word «تابعني» in gold calligraphy)

There is no fully transparent row between them, so the split is done by
connected-component analysis on the alpha channel: every component whose
bounding box starts above y=700 belongs to the emblem, the rest to the wordmark.

Usage:  python3 build_assets.py <master.png> <out_dir>
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

MIN_COMPONENT = 200      # ignore pixel noise
SPLIT_Y = 700            # component top below this row => wordmark
PAD = 12                 # transparent breathing room around each export


def load_groups(path):
    src = Image.open(path).convert('RGBA')
    arr = np.array(src)
    alpha = arr[:, :, 3] > 8
    lab, _ = ndimage.label(alpha, structure=np.ones((3, 3)))
    objs = ndimage.find_objects(lab)
    emblem, word, keep = [], [], []
    for i, sl in enumerate(objs, start=1):
        if sl is None:
            continue
        size = int((lab[sl] == i).sum())
        if size < MIN_COMPONENT:
            continue
        keep.append(i)
        (emblem if sl[0].start < SPLIT_Y else word).append(i)
    return src, arr, lab, emblem, word, keep


def crop(arr, mask, pad=PAD):
    ys, xs = np.where(mask)
    h, w = arr.shape[:2]
    y0, x0 = max(0, ys.min() - pad), max(0, xs.min() - pad)
    y1, x1 = min(h, ys.max() + 1 + pad), min(w, xs.max() + 1 + pad)
    out = arr.copy()
    keep = np.zeros_like(mask)
    keep[y0:y1, x0:x1] = mask[y0:y1, x0:x1]
    out[~keep] = 0
    return Image.fromarray(out[y0:y1, x0:x1])


def save(img, out_dir, name, max_width=None):
    if max_width and img.width > max_width:
        img = img.resize((max_width, round(img.height * max_width / img.width)), Image.LANCZOS)
    img.save(os.path.join(out_dir, name), optimize=True)
    print(f'  {name:34s} {img.width}x{img.height}')


def main():
    master, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    src, arr, lab, emblem_ids, word_ids, keep = load_groups(master)
    mask = lambda ids: np.isin(lab, ids)
    print(f'components — emblem: {len(emblem_ids)}, wordmark: {len(word_ids)}, kept: {len(keep)}')

    mark = crop(arr, mask(emblem_ids))
    word = crop(arr, mask(word_ids), pad=10)
    stacked = crop(arr, mask(keep), pad=8)

    print('exports:')
    save(stacked, out_dir, 'tabaani-logo-stacked.png', 1024)
    save(mark, out_dir, 'tabaani-mark.png', 512)
    save(word, out_dir, 'tabaani-wordmark-gold.png', 1024)

    for size in (512, 256, 192, 180, 128, 96, 64, 48, 32, 16):
        t = mark.copy()
        t.thumbnail((int(size * 0.86), int(size * 0.86)), Image.LANCZOS)
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        canvas.paste(t, ((size - t.width) // 2, (size - t.height) // 2), t)
        canvas.save(os.path.join(out_dir, f'tabaani-mark-{size}.png'), optimize=True)
    print('  square icon canvases 16-512px')

    # browser + platform icons, and the app icon on onyx
    for size in (16, 32, 48):
        c = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        t = mark.copy(); t.thumbnail((size, size), Image.LANCZOS)
        c.paste(t, ((size - t.width) // 2, (size - t.height) // 2), t)
        c.save(os.path.join(out_dir, f'favicon-{size}.png'), optimize=True)
    for size in (180, 192, 512):
        bg = Image.new('RGBA', (size, size), (0x14, 0x10, 0x0A, 255))
        t = mark.copy(); t.thumbnail((int(size * 0.72), int(size * 0.72)), Image.LANCZOS)
        bg.paste(t, ((size - t.width) // 2, (size - t.height) // 2), t)
        bg.convert('RGB').save(os.path.join(out_dir, f'appicon-{size}.png'), optimize=True)
    print('  favicon-16/32/48.png + appicon-180/192/512.png')


if __name__ == '__main__':
    main()
