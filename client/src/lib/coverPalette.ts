/**
 * The cover palette.
 *
 * A bookmark card wears a magazine cover: the site's own OG image when there
 * is one, otherwise a generated cover in a palette colour derived from the
 * domain. The masthead band across the top carries the site name as live text
 * on the collection's colour — never baked into an image.
 *
 * The eight colours are fixed by the design system and live in `index.css` as
 * `--cover-1` … `--cover-8`, each with the ink that reads on it.
 */

const COVER_SLOTS = 8;

/** A stable, non-cryptographic hash so a domain always lands on one colour. */
function hashSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** The 1-based palette slot for a name, so a collection keeps its colour. */
export function coverSlot(seed: string): number {
  return (hashSeed(seed) % COVER_SLOTS) + 1;
}

/** The CSS custom property for a palette slot. */
export function coverColor(slot: number): string {
  return `var(--cover-${slot})`;
}

/** The CSS custom property for the ink that reads on a palette slot. */
export function coverInk(slot: number): string {
  return `var(--cover-${slot}-ink)`;
}

/** The first letter of a host, for the generated cover's big initial. */
export function coverInitial(host: string): string {
  const first = host.trim().charAt(0);
  return first ? first.toUpperCase() : "•";
}
