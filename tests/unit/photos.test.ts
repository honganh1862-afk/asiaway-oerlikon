import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPhotoManifest, photoFor } from '../../src/server/menu/photos';
import { parseMenuCsv } from '../../src/server/menu/import';
import { loadFoodMenus } from '../../src/server/menu/food-menus';
import { readFileSync } from 'node:fs';

const manifest = loadPhotoManifest();
const menu = parseMenuCsv(
  readFileSync(resolve(process.cwd(), 'data/menu_trilingual_EN_DE_VI.csv'), 'utf8'),
);
// Winterthur's full food: the Vietnamese menu and the Thai one.
const bothMenus = loadFoodMenus(resolve(process.cwd(), 'data'), { thai: true });

describe('dish photographs', () => {
  it('maps 38 photos — 17 Vietnamese, 21 Thai — all of which exist on disk', () => {
    const entries = Object.entries(manifest.photos);
    expect(entries).toHaveLength(38);
    expect(entries.filter(([dish]) => parseFloat(dish) >= 200)).toHaveLength(21);
    for (const [dish, path] of entries) {
      expect(existsSync(resolve(process.cwd(), 'public', path.slice(1))), `${dish}: ${path}`).toBe(
        true,
      );
    }
  });

  it('only references dish numbers that actually exist on one of the menus', () => {
    const numbers = new Set(bothMenus.items.map((i) => i.dishNumber));
    for (const dish of Object.keys(manifest.photos)) {
      expect(numbers.has(dish), `no dish numbered ${dish}`).toBe(true);
    }
  });

  it('gives the prawn summer roll its photo and the other three none', () => {
    // The n 12 photograph shows prawn rolls. Illustrating the beef, duck or
    // tofu variant with it would be a misleading picture, which is worse than
    // no picture at all.
    expect(photoFor(manifest, '12.2')).toBe('/images/menu/dish-12.2.jpg');
    for (const other of ['12.1', '12.3', '12.4']) {
      expect(photoFor(manifest, other), other).toBeNull();
    }
  });

  it('gives the beef red curry its photo and the other three none', () => {
    expect(photoFor(manifest, '91.3')).toBe('/images/menu/dish-91.3.jpg');
    for (const other of ['91.1', '91.2', '91.4']) {
      expect(photoFor(manifest, other), other).toBeNull();
    }
  });

  it('gives a Thai photo only to the option it shows', () => {
    // Pad Thai with prawns, captioned and plainly prawns: the other proteins
    // get no picture rather than someone else's.
    expect(photoFor(manifest, '270.4')).toBe('/images/menu/dish-270.4.jpg');
    for (const other of ['270.1', '270.2', '270.3', '270.5', '270.6']) {
      expect(photoFor(manifest, other), other).toBeNull();
    }
    // The green curry's photo shows a protein that cannot be told, so no
    // option is illustrated with it until the restaurant says which it is.
    for (const option of ['240.1', '240.2', '240.3', '240.4', '240.5', '240.6']) {
      expect(photoFor(manifest, option), option).toBeNull();
    }
  });

  it('returns null for a dish with no photograph, rather than a stand-in', () => {
    expect(photoFor(manifest, '10')).toBeNull();
    expect(photoFor(manifest, '40')).toBeNull();
    expect(photoFor(manifest, null)).toBeNull();
    expect(photoFor(manifest, 'nonsense')).toBeNull();
  });

  it('leaves the other 39 food dishes without a photo', () => {
    const withPhoto = menu.items.filter((i) => photoFor(manifest, i.dishNumber));
    expect(withPhoto).toHaveLength(17);
    expect(menu.items.length - withPhoto.length).toBe(39);
  });
});
