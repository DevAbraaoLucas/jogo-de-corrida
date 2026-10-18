// Exporta a geometria da pista em JSON (ferramenta de desenvolvimento).
import { writeFileSync } from 'node:fs';
import { DESK_TRACK } from '../src/track/TrackDefinition';
import { TrackGeometry } from '../src/track/TrackGeometry';

const geo = new TrackGeometry(DESK_TRACK);
const out = process.argv[2] ?? 'track.json';
writeFileSync(out, JSON.stringify({
  table: DESK_TRACK.table,
  halfWidth: geo.halfWidth,
  samples: geo.samples,
  barriers: geo.barriers,
  endWalls: geo.endWalls,
  gates: geo.gates,
  obstacles: DESK_TRACK.obstacles,
  control: DESK_TRACK.controlPoints,
}));
console.log('ok', out);
