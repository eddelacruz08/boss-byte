import { Card, cn } from '@bossbyte/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SAMPLE_PROPERTIES } from '@/data/sample-properties';
import { assessmentRatio, RATIO_BANDS, ratioBand } from '@/features/map/bands';
import { PropertyMap } from '@/features/map/PropertyMap';

export const Route = createFileRoute('/_authenticated/map')({ component: MapPage });

function MapPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Map"
        description="Thirty fictional sales on OpenStreetMap tiles, coloured by how the assessed value compares with the sale price."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="overflow-hidden lg:col-span-2">
          {/* `isolate` keeps Leaflet's own z-indexes underneath the top bar and menus. */}
          <div role="region" aria-label="Map of the sample properties" className="isolate">
            <PropertyMap
              properties={SAMPLE_PROPERTIES}
              selectedId={selectedId}
              onSelect={setSelectedId}
              className="h-112 w-full lg:h-144"
            />
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Legend" description="Assessed value divided by sale price">
            <ul className="flex flex-col gap-2 text-sm">
              {RATIO_BANDS.map((band) => (
                <li key={band.id} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: band.color }}
                  />
                  <span className="font-medium text-slate-950">{band.label}</span>
                  <span className="text-slate-600">{band.range}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Properties" description="Choose one to find it on the map." padded={false}>
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {SAMPLE_PROPERTIES.map((property) => {
                const ratio = assessmentRatio(property);
                const band = ratioBand(ratio);
                const selected = property.id === selectedId;
                return (
                  <li key={property.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedId(property.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-slate-50',
                        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
                        selected && 'bg-brand-50',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: band.color }}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-slate-950">
                          {property.address}
                        </span>
                        <span className="text-slate-600">{property.district}</span>
                      </span>
                      <span className="text-slate-700 tabular-nums">
                        <span className="sr-only">{band.label}, ratio </span>
                        {ratio.toFixed(2)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
