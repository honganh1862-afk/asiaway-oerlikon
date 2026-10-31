/**
 * The restaurant's dish photos ship at the widths a phone asks for: WebP at 480,
 * 800 and 1200 px beside the JPEG whose path the database stores, all taken from
 * the full-resolution originals in the printed menu (public/images/menu).
 *
 * Anything else — the weekly special, served from the database — has no such
 * variants and is shown as it is.
 */
const DISH_PHOTO = /^(\/images\/menu\/dish-[\w.-]+)\.jpg$/;

/** The widths on disk for every dish photo. */
export const PHOTO_WIDTHS = [480, 800, 1200] as const;

/**
 * The widths a page offers. 1200 px is left out: a phone with a sharp screen
 * would otherwise take it for a photo filling the screen, at 270 KB rather than
 * 160, and no one can tell the two apart at arm's length. On a slow connection
 * or with data saver on, only the 480 px copy is offered, at a quarter of that.
 */
const OFFERED_WIDTHS = [480, 800] as const;
const LOW_DATA_WIDTHS = [480] as const;

/** The WebP srcset for one of the restaurant's dish photos, or null for any other image. */
export function photoSrcSet(path: string, lowData = false): string | null {
  const match = DISH_PHOTO.exec(path);
  if (!match) return null;
  return (lowData ? LOW_DATA_WIDTHS : OFFERED_WIDTHS)
    .map((width) => `${match[1]}-${width}.webp ${width}w`)
    .join(', ');
}

interface NetworkInformation {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

/**
 * Whether the guest's phone says data is scarce: data saver on, or a 2G/3G
 * connection. Browsers that do not say (Safari) are treated as not scarce.
 */
export function prefersLowData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!connection) return false;
  return (
    connection.saveData === true ||
    ['slow-2g', '2g', '3g'].includes(connection.effectiveType ?? '')
  );
}
