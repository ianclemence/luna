/**
 * images.ts
 * 
 * Utility functions for generating high-quality CDN URLs for music metadata.
 * Handles Tidal and Deezer image resolution.
 */

export type ImageSize = "160" | "320" | "640" | "1280";

/**
 * Generates a CDN URL for an album cover or track image.
 */
export function getCoverUrl(id: string | number | undefined, provider: string = "tidal", size: ImageSize = "320"): string | undefined {
  if (!id || id === "undefined" || id === "null" || id === "0") return undefined;

  const stringId = String(id);
  if (stringId.startsWith("http")) return stringId;

  const cleanId = stringId.replace(/^[tq]:/, "").replace("deezer:", "");

  if (provider === "deezer") {
    return `https://e-cdns-images.dzcdn.net/images/cover/${cleanId}/${size}x${size}.jpg`;
  } else {
    // Tidal format: resources.tidal.com/images/ID/size.jpg
    // UUIDs have dashes replaced by slashes
    const path = cleanId.includes("-") ? cleanId.replace(/-/g, "/") : cleanId;
    return `https://resources.tidal.com/images/${path}/${size}x${size}.jpg`;
  }
}

/**
 * Generates a CDN URL for an artist image.
 */
export function getArtistImageUrl(id: string | number | undefined, provider: string = "tidal", size: ImageSize = "320"): string | undefined {
  if (!id || id === "undefined" || id === "null" || id === "0") return undefined;

  const stringId = String(id);
  if (stringId.startsWith("http")) return stringId;

  const cleanId = stringId.replace(/^[tq]:/, "").replace("deezer:", "");

  if (provider === "deezer") {
    return `https://e-cdns-images.dzcdn.net/images/artist/${cleanId}/${size}x${size}.jpg`;
  } else {
    // Tidal artist images
    const path = cleanId.includes("-") ? cleanId.replace(/-/g, "/") : cleanId;
    return `https://resources.tidal.com/images/${path}/${size}x${size}.jpg`;
  }
}
