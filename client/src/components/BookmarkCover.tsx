import { useLocale } from "@/i18n/LocaleContext";
import {
  coverColor,
  coverInk,
  coverInitial,
  coverSlot,
} from "@/lib/coverPalette";
import React from "react";

type BookmarkCoverProps = {
  host: string;
  imageUrl: string | null;
  /** The collection the bookmark sits in; it decides the masthead band. */
  collectionName: string | null;
  title: string;
};

/**
 * The cover at the top of a bookmark card.
 *
 * A bookmark that has an OG image wears it as a 3:4 cover. A bookmark without
 * one gets a generated cover: the palette colour derived from its domain, the
 * domain's first letter as a big initial, and the same masthead band. The
 * band carries the site name as live text so it stays readable and selectable
 * — nothing is baked into the image.
 */
export function BookmarkCover({
  host,
  imageUrl,
  collectionName,
  title,
}: BookmarkCoverProps) {
  const { locale } = useLocale();
  // The collection owns the band's colour; without a collection the domain
  // decides, so a card still looks the same in two different libraries.
  const slot = coverSlot(collectionName ?? host);
  const bandColor = coverColor(slot);
  const bandInk = coverInk(slot);

  return (
    <div
      className="fihrist-cover"
      style={
        {
          "--fihrist-cover-band": bandColor,
          "--fihrist-cover-band-ink": bandInk,
        } as React.CSSProperties
      }
    >
      {imageUrl ? (
        <img
          className="fihrist-cover-image"
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="fihrist-cover-generated" aria-hidden="true">
          <span className="fihrist-cover-initial" lang={locale}>
            {coverInitial(host)}
          </span>
        </div>
      )}
      <span className="fihrist-cover-masthead">{host || title}</span>
    </div>
  );
}
