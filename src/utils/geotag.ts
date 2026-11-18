import { Skia, ImageFormat } from '@shopify/react-native-skia';

export type GeotagInfo = {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  place?: string;
  /** ISO-ish stamp lines already formatted, e.g. "2026-06-14 09:32". */
  when?: string;
};

/**
 * Burn a location/time stamp into the bottom of a captured photo (like a
 * GPS-camera app) so the evidence image is provably geotagged. Pure Skia
 * (already a dependency) — no native module. Falls back to the original image
 * if anything is unavailable on the device, so callers can always use the
 * returned data URI safely.
 */
/**
 * Downscale + re-encode a captured image to a COMPACT JPEG data-URI, so it can
 * be safely carried inside a JSON request body. A full-res phone capture (12MP)
 * base64-encodes to several MB; React Native's fetch either fails outright
 * ("Network request failed") or the server receives a TRUNCATED, undecodable
 * blob — which the face engine then reports as "unreadable_image"/"no_face",
 * silently failing the SECOND (server-side) verification on /attendance/mark
 * even though the identity had just matched. Re-encoding through Skia at ~1080px
 * yields a clean ~100-250 KB payload that always survives the JSON round-trip.
 * Falls back to the original URI if Skia can't process it.
 */
export function downscaleForUpload(dataUri: string, maxDim = 1440, quality = 82): string {
  try {
    if (!dataUri || !dataUri.startsWith('data:')) return dataUri;
    const b64 = dataUri.replace(/^data:image\/\w+;base64,/, '');
    const data = Skia.Data.fromBase64(b64);
    const img = Skia.Image.MakeImageFromEncoded(data);
    if (!img) return dataUri;
    const srcW = img.width();
    const srcH = img.height();
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const surface = Skia.Surface.MakeOffscreen(w, h);
    if (!surface) return dataUri;
    surface.getCanvas().drawImageRect(
      img,
      Skia.XYWHRect(0, 0, srcW, srcH),
      Skia.XYWHRect(0, 0, w, h),
      Skia.Paint(),
    );
    const out = surface.makeImageSnapshot().encodeToBase64(ImageFormat.JPEG, quality);
    if (!out) return dataUri;
    return `data:image/jpeg;base64,${out}`;
  } catch (e) {
    console.warn('[downscaleForUpload] failed, using original image:', e);
    return dataUri;
  }
}

export function geotagImage(dataUri: string, info: GeotagInfo): string {
  try {
    if (!dataUri || !dataUri.startsWith('data:')) return dataUri;
    const b64 = dataUri.replace(/^data:image\/\w+;base64,/, '');
    const data = Skia.Data.fromBase64(b64);
    const img = Skia.Image.MakeImageFromEncoded(data);
    if (!img) return dataUri;

    // Cap the output resolution. Evidence photos are sent as base64 *inside a
    // JSON body* (class-checkins); a full-res camera image
    // becomes a multi-MB string that React Native's fetch fails to upload with
    // an opaque "Network request failed". Downscale so the longest side is at
    // most MAX_DIM — the GPS stamp stays perfectly legible and the payload is
    // an order of magnitude smaller.
    const MAX_DIM = 1280;
    const srcW = img.width();
    const srcH = img.height();
    const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const surface = Skia.Surface.MakeOffscreen(w, h);
    if (!surface) return dataUri;
    const canvas = surface.getCanvas();
    canvas.drawImageRect(
      img,
      Skia.XYWHRect(0, 0, srcW, srcH),
      Skia.XYWHRect(0, 0, w, h),
      Skia.Paint(),
    );

    // Translucent bar across the bottom.
    const barH = Math.max(96, Math.round(h * 0.14));
    const bar = Skia.Paint();
    bar.setColor(Skia.Color('rgba(0,0,0,0.55)'));
    canvas.drawRect(Skia.XYWHRect(0, h - barH, w, barH), bar);
    // Orange accent strip at the top of the bar.
    const strip = Skia.Paint();
    strip.setColor(Skia.Color('#2C9E83'));
    canvas.drawRect(Skia.XYWHRect(0, h - barH, w, Math.max(4, Math.round(h * 0.006))), strip);

    const fontSize = Math.max(22, Math.round(w * 0.030));
    const font = Skia.Font(undefined, fontSize);
    const white = Skia.Paint();
    white.setColor(Skia.Color('white'));

    const pad = Math.round(w * 0.025);
    const top = h - barH + Math.round(barH * 0.34);
    const gap = Math.round(fontSize * 1.32);
    const lat = info.latitude != null ? info.latitude.toFixed(5) : '—';
    const lng = info.longitude != null ? info.longitude.toFixed(5) : '—';
    const acc = info.accuracy != null ? ` (±${Math.round(info.accuracy)}m)` : '';

    canvas.drawText(`${info.place || 'On-site'}`, pad, top, white, font);
    canvas.drawText(`Lat ${lat}, Lng ${lng}${acc}`, pad, top + gap, white, font);
    if (info.when) canvas.drawText(info.when, pad, top + gap * 2, white, font);

    const snapshot = surface.makeImageSnapshot();
    const out = snapshot.encodeToBase64(ImageFormat.JPEG, 72);
    if (!out) return dataUri;
    return `data:image/jpeg;base64,${out}`;
  } catch (e) {
    console.warn('[geotag] stamp failed, using original image:', e);
    return dataUri;
  }
}
