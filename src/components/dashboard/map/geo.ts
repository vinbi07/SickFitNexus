import { feature, mesh } from "topojson-client";
import usStatesTopology from "us-atlas/states-10m.json";
import worldTopology from "world-atlas/countries-110m.json";
import type { Feature, FeatureCollection, Geometry, MultiLineString } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import { STATE_NAMES } from "@/lib/usStates";

type StateProps = { name?: string };

const us = usStatesTopology as unknown as Topology<{ states: GeometryCollection<StateProps>; nation: GeometryCollection }>;
const world = worldTopology as unknown as Topology<{ countries: GeometryCollection; land: GeometryCollection }>;

/** Each US state as its own feature, for labels and hit areas. */
export const US_STATE_FEATURES = (
  feature(us, us.objects.states) as FeatureCollection<Geometry, StateProps>
).features;

/** The US outline. */
export const US_NATION = feature(us, us.objects.nation) as FeatureCollection<Geometry>;

/** Interior state borders only, so shared edges are drawn once. */
export const US_STATE_BORDERS = mesh(us, us.objects.states, (a, b) => a !== b) as MultiLineString;

export const WORLD_LAND = feature(world, world.objects.land) as FeatureCollection<Geometry>;

export const WORLD_BORDERS = mesh(world, world.objects.countries, (a, b) => a !== b) as MultiLineString;

/** Small Northeast states whose labels would collide; they keep their shapes but go unlabelled. */
const SMALL_STATES = new Set(["DC", "RI", "DE", "CT", "NJ", "MD", "MA", "NH", "VT"]);

export function stateCode(stateFeature: Feature<Geometry, StateProps>) {
  const name = String(stateFeature.properties?.name ?? "").toUpperCase();
  return STATE_NAMES[name] ?? (name === "DISTRICT OF COLUMBIA" ? "DC" : null);
}

export function isLabelledState(code: string | null): code is string {
  return Boolean(code) && !SMALL_STATES.has(code as string);
}

/** Hand-tuned nudges so labels sit inside oddly shaped states. */
export const STATE_LABEL_NUDGE: Record<string, [number, number]> = {
  FL: [8, 4],
  LA: [-6, -2],
  MI: [6, 12],
  KY: [4, 0],
  ID: [-2, 0],
};
