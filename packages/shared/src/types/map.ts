import { UUID } from './user';

/** Latitude/Longitude coordinate pair */
export interface LatLng {
  lat: number;
  lng: number;
}

/** A bounding box for map viewport queries */
export interface BoundingBox {
  northEast: LatLng;
  southWest: LatLng;
}

/** Pin type displayed on the map */
export type MapPinType = 'cat' | 'sighting' | 'partner' | 'feeding_station';

/** A pin displayed on the map */
export interface MapPin {
  id: UUID;
  type: MapPinType;
  position: LatLng;
  label: string;
  /** Optional reference ID to the underlying entity */
  entityId?: UUID;
}
