import type { GPS } from "./models";
export function captureGPS(): Promise<GPS> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ state: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          state: "captured",
          position: {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: p.coords.accuracy,
            measuredAt: new Date(p.timestamp).toISOString(),
          },
        }),
      (e) =>
        resolve({
          state:
            e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable",
        }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}
