export function Icon({ name, size = 18 }: { name: "search" | "settings" | "bell" | "pin" | "expand"; size?: number }) {
  const paths = { search: "M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0", settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2", bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4", pin: "M8 3h8l-1 6 3 4H6l3-4-1-6M12 13v8", expand: "M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5" };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
