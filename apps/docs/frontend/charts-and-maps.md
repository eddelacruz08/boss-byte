# Charts and maps

The dashboard draws charts with Chart.js and maps with Leaflet. Both are wrapped once, so pages
pass data and get the styling, the text alternative and the motion settings for free.

## Charts

`src/components/charts.tsx` exports two components.

```tsx
import { BarChart, DoughnutChart } from '@/components/charts';

<BarChart
  description="New accounts per month"
  seriesLabel="Sign-ups"
  labels={['Jan', 'Feb', 'Mar']}
  values={[4, 9, 6]}
/>;

<DoughnutChart description="Users by role" labels={['Admin', 'Staff']} values={[2, 14]} />;
```

| Prop          | Type                        | Notes                                                        |
| ------------- | --------------------------- | ------------------------------------------------------------ |
| `labels`      | `string[]`                  | One per value, in the same order                             |
| `values`      | `number[]`                  | The figures                                                  |
| `description` | `string`                    | What the chart shows. Becomes part of its text alternative   |
| `formatValue` | `(value: number) => string` | Formats the axis ticks, the tooltip and the text alternative |
| `className`   | `string`                    | Sets the height. The default is `h-64`                       |

`BarChart` takes two more:

| Prop          | Type      | Notes                                                         |
| ------------- | --------- | ------------------------------------------------------------- |
| `seriesLabel` | `string`  | Names the series in the tooltip: `Sign-ups: 9`                |
| `horizontal`  | `boolean` | Draws the bars left to right, which suits long category names |

`BarChart` draws one series in the brand colour, with the value axis starting at zero and whole
numbers on its ticks. `DoughnutChart` gives each slice the next of six colours and puts the
legend underneath.

### From a query

The dashboard page draws both from one request, `GET /reports/stats`, and shows a `Skeleton` of
the same height until the data is there:

```tsx
const stats = useQuery(statsQueryOptions);
const { data } = stats;

<Card title="Sign-ups" description="New accounts per month" className="lg:col-span-2">
  {data ? (
    <BarChart
      description="New accounts per month"
      seriesLabel="Sign-ups"
      labels={data.signupsByMonth.map((entry) => monthLabel(entry.month))}
      values={data.signupsByMonth.map((entry) => entry.count)}
    />
  ) : (
    <Skeleton className="h-64" />
  )}
</Card>;
```

Matching the skeleton's height to the chart's keeps the page from jumping when the data
arrives.

### Formatting values

Pass `formatValue` when the raw number is not what a person should read. The valuation page
shows shares as percentages:

```tsx
<BarChart
  horizontal
  description="Feature importance in the boosted model"
  seriesLabel="Importance"
  labels={importance.map(([key]) => featureLabel(key))}
  values={importance.map(([, share]) => share)}
  formatValue={(share) => formatPercent(share, { maximumFractionDigits: 0 })}
  className="h-48"
/>
```

`formatPercent`, `formatNumber`, `formatCurrency` and `formatBytes` come from
`@bossbyte/shared`. See [@bossbyte/shared](/packages/shared).

### Size

A chart fills the width of its container and takes its height from `className`. The chart runs
with `maintainAspectRatio: false`, so the wrapper's height is the only thing that decides it.
Use a Tailwind height class such as `h-48` or `h-80`. A wrapper with no height gives a chart
with no height.

### Accessibility

A `<canvas>` has no text for a screen reader. Each chart is given `role="img"` and an
`aria-label` built from the description and the figures:

```text
New accounts per month: Jan 4, Feb 9, Mar 6
```

That is why `description` is required. Write it as the sentence you would use to introduce the
chart, and keep the labels meaningful when read aloud. `formatValue` applies here too, so a
share is read as "42%" and not "0.42".

A label like this suits a handful of figures. For a chart with many points, put the same data
in a table next to it.

Charts do not animate when the visitor's system asks for reduced motion.

### Add another kind of chart

Chart.js is tree-shakeable. Only the parts registered at the top of `charts.tsx` end up in the
bundle:

```ts
// Chart.js is tree-shakeable: only what is registered here ends up in the bundle.
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Legend, Tooltip);
```

A chart type whose parts are not registered throws when it is first drawn. To add a line chart,
for example, register `LineElement` and `PointElement` as well, import `Line` from
`react-chartjs-2`, and write a `LineChart` component in the same file, following `BarChart`:

- Accept the shared `ChartProps` and set `role="img"` and `aria-label={textAlternative(props)}`.
- Pass `animation` from `useAnimation()`.
- Keep `responsive: true` and `maintainAspectRatio: false`, inside a `<div className={className}>`.

The colours are the `BRAND` and `SERIES` constants in that file, and the font and text colour
are set once on `ChartJS.defaults`.

::: tip Charts in tests
jsdom has no canvas, so a chart draws nothing in a component test. Assert on the accessible
name instead: `screen.getByRole('img', { name: /new accounts per month/i })`.
:::

## Maps

The map page (`/map`) shows thirty fictional property sales on OpenStreetMap tiles. Each
property is a dot coloured by how its assessed value compares with its sale price. Any
signed-in user can open it. It needs no permission, and its data is bundled with the app.

It is a plain Leaflet map with raster tiles, through react-leaflet. There is no API key and no
map service account.

### `PropertyMap`

`src/features/map/PropertyMap.tsx`:

```tsx
const [selectedId, setSelectedId] = useState<string | null>(null);

<div role="region" aria-label="Map of the sample properties" className="isolate">
  <PropertyMap
    properties={SAMPLE_PROPERTIES}
    selectedId={selectedId}
    onSelect={setSelectedId}
    className="h-112 w-full lg:h-144"
  />
</div>;
```

| Prop         | Type                        | Notes                                                  |
| ------------ | --------------------------- | ------------------------------------------------------ |
| `properties` | `readonly SampleProperty[]` | What to plot. The map starts zoomed to fit all of them |
| `selectedId` | `string \| null`            | The property with the pin and the open popup           |
| `onSelect`   | `(id: string) => void`      | Called when a dot is clicked                           |
| `className`  | `string`                    | Sets the size. The map needs a height                  |

The selection lives in the page, not in the map. That lets something outside the map change
it, which the property list next to it does.

When `selectedId` changes, the map moves to that property, zooms in to at least level 16 and
opens a popup with its details. The move is not animated when the system asks for reduced
motion.

### Three things the wrapper takes care of

**Marker images.** Leaflet looks for its pin images next to its stylesheet. After bundling, the
files have other names and that lookup fails, which shows as a broken image where the pin
should be. `PropertyMap` imports the three images and builds the icon from the bundled URLs:

```ts
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';

const markerPin = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIconRetina,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
```

Pass `icon={markerPin}` to every `<Marker>` you add. The dots are `CircleMarker`s, which are
drawn as vector shapes and need no image.

**Stacking.** Leaflet gives its panes and controls large `z-index` values. Without a boundary
they would sit on top of the top bar and of open menus. The `isolate` class on the wrapper
starts a new stacking context, so those values only count inside the map.

**The stylesheet.** `leaflet/dist/leaflet.css` is imported by the component. Only the map route
imports `PropertyMap`, so Leaflet and its styles are downloaded when the map page is first
opened.

### Tiles

```tsx
<TileLayer
  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  maxZoom={19}
/>
```

Two things to know before you ship this:

- **Keep the attribution.** OpenStreetMap's licence requires it, and it is shown in the map's
  corner.
- **The public tile server is a shared, donated service.** It has a
  [usage policy](https://operations.osmfoundation.org/policies/tiles/) and no guarantee of
  availability. It is fine for development and light use. For a production app with real
  traffic, change `url` and `attribution` to a tile provider you have an agreement with, or
  host tiles yourself.

Tiles are images from another origin, so the Content-Security-Policy has to allow them. The
default policy in the dashboard's Docker image has `img-src 'self' data: blob: https:`, which
covers any HTTPS tile server. If you tighten it with the `CONTENT_SECURITY_POLICY` variable,
keep your tile host in `img-src`. See [HTTP headers](/api/security#http-headers).

### Colours and the legend

`src/features/map/bands.ts` holds the three bands. The dots, the legend and the list all read
from it, so they cannot disagree:

| Band           | Assessed value ÷ sale price | Colour    |
| -------------- | --------------------------- | --------- |
| Under-assessed | Below 0.90                  | `#0369a1` |
| On target      | 0.90 to 1.10                | `#15803d` |
| Over-assessed  | Above 1.10                  | `#b91c1c` |

```ts
const band = ratioBand(assessmentRatio(property));
// band.id, band.label, band.range, band.color
```

Colour is never the only signal. The legend names each band, and both the list and the popup
show the ratio as a number.

### Accessibility

A map is hard to use with a keyboard or a screen reader, so the page does not depend on it:

- The **Properties** card lists every property as a button. Choosing one selects it on the map,
  and `aria-pressed` marks the current one. Everything the map shows can be reached from this
  list.
- Each button reads out the band and the ratio through visually hidden text.
- The map sits in a labelled `role="region"`, so a screen reader user can identify it and skip
  it.
- The selected pin has the property's address as its `alt` text.

Keep a list or a table next to any map you build.

### The data

`src/data/sample-properties.ts` exports `SAMPLE_PROPERTIES`, thirty made-up sales, and
`SAMPLE_CURRENCY`. The addresses, prices and positions are fictional. The valuation page uses
the same set as its training data. See [On the dashboard](/api/valuation#on-the-dashboard).

To plot your own records, replace the file with a query and pass the rows to the map. The
component only needs `id`, `lat` and `lng` to place a dot. The popup and the bands use the other
fields, so change `PropertyDetails` and `bands.ts` to suit your data, or make the component
generic over its row type.

### The react-leaflet licence

Leaflet itself is BSD-2-Clause. react-leaflet, the React wrapper, is published under the
Hippocratic License 2.1, which is not an OSI-approved open-source licence. The repository's
licence check allows it as a named exception, with a note that it needs legal review before a
commercial release. See [Licence check](/deployment/ci#licence-check).

If that licence does not suit your organisation, the alternative is to use Leaflet directly:
create the map with `L.map()` in an effect and remove the react-leaflet dependency.
`PropertyMap` is the only file that imports it.
