#!/usr/bin/env node
/**
 * MOBY Creative OS - ad-detective sync stub
 *
 * v1: maps performance snapshots into data.json.
 * Replace `fetchAdDetectiveRows()` with real source integration.
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data.json');

function load() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function save(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

async function fetchAdDetectiveRows() {
  // TODO: connect real data source.
  // Expected shape:
  // [{ variant_id:'v1', spend:..., ctr:..., cpl:..., frequency:..., thumbstop:..., taken_at: ISO }]
  return [
    { variant_id: 'v5', spend: 432.2, ctr: 0.74, cpl: 34.1, frequency: 1.5, thumbstop: 24.3, taken_at: new Date().toISOString() },
    { variant_id: 'v6', spend: 288.0, ctr: 0.49, cpl: 42.7, frequency: 1.7, thumbstop: 21.2, taken_at: new Date().toISOString() },
    { variant_id: 'v7', spend: 1201.4, ctr: 0.96, cpl: 29.8, frequency: 2.0, thumbstop: 28.6, taken_at: new Date().toISOString() }
  ];
}

function decide(row, baseline) {
  if (row.ctr >= baseline.ctr && row.cpl <= baseline.cpl) {
    return { action: 'scale', reason: 'CTR/CPL beat baseline' };
  }
  if (row.thumbstop >= 20 && (row.ctr < baseline.ctr || row.cpl > baseline.cpl)) {
    return { action: 'iterate', reason: 'Good stop, weak click/cost' };
  }
  return { action: 'pause', reason: 'Under baseline' };
}

async function main() {
  const data = load();
  const rows = await fetchAdDetectiveRows();
  const now = new Date().toISOString();

  data.performance = data.performance || [];
  data.decisions = data.decisions || [];

  for (const row of rows) {
    data.performance.push({ snapshot_id: `s_${Date.now()}_${row.variant_id}`, ...row });
    const d = decide(row, data.baseline);
    data.decisions.push({
      decision_id: `d_${Date.now()}_${row.variant_id}`,
      variant_id: row.variant_id,
      action: d.action,
      reason: d.reason,
      decided_at: now
    });

    const v = data.variants.find(x => x.variant_id === row.variant_id);
    if (v) {
      if (d.action === 'scale') v.status = 'scaled';
      else if (d.action === 'iterate') v.status = 'iterating';
      else v.status = 'paused';
    }
  }

  save(data);
  console.log(`Synced ${rows.length} rows.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
