import { formatCurrency, formatNumber } from '@bossbyte/shared';
import { useMediaQuery } from '@bossbyte/ui';
import L from 'leaflet';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { SAMPLE_CURRENCY, type SampleProperty } from '@/data/sample-properties';
import { assessmentRatio, ratioBand } from './bands';

// Leaflet looks for its marker images next to its stylesheet, which stops
// working once a bundler has renamed and moved them. Hand it the bundled URLs.
const markerPin = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIconRetina,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const SELECTED_ZOOM = 16;

export interface PropertyMapProps {
  properties: readonly SampleProperty[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

function PropertyDetails({ property }: { property: SampleProperty }) {
  const ratio = assessmentRatio(property);
  const money = (value: number) =>
    formatCurrency(value, { currency: SAMPLE_CURRENCY, maximumFractionDigits: 0 });

  return (
    <div className="flex min-w-48 flex-col gap-1 text-sm text-slate-800">
      {/* m-0!: Leaflet's stylesheet gives paragraphs in a popup a large margin. */}
      <p className="m-0! font-semibold text-slate-950">{property.address}</p>
      <p className="m-0! text-slate-600">{property.district}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-slate-600">Floor area</dt>
        <dd>{formatNumber(property.floorArea)} m²</dd>
        <dt className="text-slate-600">Lot area</dt>
        <dd>{formatNumber(property.lotArea)} m²</dd>
        <dt className="text-slate-600">Age</dt>
        <dd>{property.age} years</dd>
        <dt className="text-slate-600">Bedrooms</dt>
        <dd>{property.bedrooms}</dd>
        <dt className="text-slate-600">Assessed</dt>
        <dd>{money(property.assessedValue)}</dd>
        <dt className="text-slate-600">Sold for</dt>
        <dd>{money(property.salePrice)}</dd>
        <dt className="text-slate-600">Ratio</dt>
        <dd>
          {ratio.toFixed(2)} ({ratioBand(ratio).label.toLowerCase()})
        </dd>
      </dl>
    </div>
  );
}

/** The pin for the selected property. Moves the map to it and opens its details. */
function SelectedMarker({ property }: { property: SampleProperty }) {
  const map = useMap();
  const marker = useRef<L.Marker>(null);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    map.setView([property.lat, property.lng], Math.max(map.getZoom(), SELECTED_ZOOM), {
      animate: !reduceMotion,
    });
    marker.current?.openPopup();
  }, [map, property, reduceMotion]);

  return (
    <Marker
      ref={marker}
      position={[property.lat, property.lng]}
      icon={markerPin}
      alt={property.address}
    >
      <Popup>
        <PropertyDetails property={property} />
      </Popup>
    </Marker>
  );
}

/**
 * A Leaflet map on plain OpenStreetMap raster tiles. Every property is a dot
 * coloured by its assessment ratio; the selected one gets a pin and its
 * details in a popup.
 */
export function PropertyMap({ properties, selectedId, onSelect, className }: PropertyMapProps) {
  const bounds = useMemo(
    () => L.latLngBounds(properties.map((property) => [property.lat, property.lng])),
    [properties],
  );
  const selected = properties.find((property) => property.id === selectedId);

  return (
    <MapContainer bounds={bounds} boundsOptions={{ padding: [24, 24] }} className={className}>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      {properties.map((property) => {
        const band = ratioBand(assessmentRatio(property));
        return (
          <CircleMarker
            key={property.id}
            center={[property.lat, property.lng]}
            radius={8}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: band.color, fillOpacity: 0.9 }}
            eventHandlers={{ click: () => onSelect(property.id) }}
          />
        );
      })}
      {selected && <SelectedMarker property={selected} />}
    </MapContainer>
  );
}
