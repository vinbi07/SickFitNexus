// Fixed geography for the dashboard maps. Coordinates are [longitude, latitude].

export type MapPlaceId = "factory" | "seaPort" | "airPort" | "usSeaPort" | "usAirPort" | "warehouse" | "homeBase";

export interface MapPlace {
  id: MapPlaceId;
  /** Short label drawn on the map. */
  label: string;
  /** Longer name for tooltips. */
  name: string;
  coordinates: [number, number];
}

export const MAP_PLACES: Record<MapPlaceId, MapPlace> = {
  factory: { id: "factory", label: "Foshan", name: "Factory · Foshan, Guangdong", coordinates: [113.12, 23.02] },
  seaPort: { id: "seaPort", label: "Yantian", name: "Port of Yantian (Shenzhen)", coordinates: [114.27, 22.57] },
  airPort: { id: "airPort", label: "Hong Kong", name: "Hong Kong air cargo", coordinates: [113.92, 22.31] },
  usSeaPort: { id: "usSeaPort", label: "Long Beach", name: "Port of Long Beach, CA", coordinates: [-118.21, 33.75] },
  usAirPort: { id: "usAirPort", label: "Houston", name: "Houston, TX · air cargo", coordinates: [-95.55, 29.66] },
  warehouse: { id: "warehouse", label: "Louisville", name: "Louisville, KY · 3PL warehouse", coordinates: [-85.76, 38.25] },
  homeBase: { id: "homeBase", label: "Glenn Heights", name: "SickFit · Glenn Heights, TX", coordinates: [-96.86, 32.55] },
};

export type RouteLegKind = "truck" | "ocean" | "air";

export interface RouteLeg {
  from: MapPlaceId;
  to: MapPlaceId;
  kind: RouteLegKind;
}

/** Factory to warehouse, leg by leg, for each ship mode. */
export const SUPPLY_ROUTES: Record<"Sea" | "Air", RouteLeg[]> = {
  Sea: [
    { from: "factory", to: "seaPort", kind: "truck" },
    { from: "seaPort", to: "usSeaPort", kind: "ocean" },
    { from: "usSeaPort", to: "warehouse", kind: "truck" },
  ],
  Air: [
    { from: "factory", to: "airPort", kind: "truck" },
    { from: "airPort", to: "usAirPort", kind: "air" },
    { from: "usAirPort", to: "warehouse", kind: "truck" },
  ],
};
