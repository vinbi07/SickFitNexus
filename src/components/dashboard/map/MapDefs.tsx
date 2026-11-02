/** Shared SVG defs: soft water gradient and the land drop shadow. */
export function MapDefs() {
  return (
    <defs>
      <linearGradient id="mapWater" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="map-water-top" />
        <stop offset="1" className="map-water-bottom" />
      </linearGradient>
      <filter id="mapLandShadow" x="-5%" y="-5%" width="110%" height="115%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#4b5a4b" floodOpacity="0.22" />
      </filter>
    </defs>
  );
}
