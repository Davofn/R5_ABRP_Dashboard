/**
 * Supabase client for ABRP Dashboard
 * Stores/loads activities and manual costs from Supabase.
 * Falls back to localStorage if Supabase is unreachable.
 */

const SUPABASE_URL = 'https://fzsioxqmpjmunaszrjdl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6c2lveHFtcGptdW5hc3pyamRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjgwNTEsImV4cCI6MjA4ODkwNDA1MX0.-ZUFna_TyVBNAUfgRqaJGn0siq-DIiHcCgK5h1uf6jY';
const TABLE = 'abrp_activities';

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

/**
 * Load all activities from Supabase
 * @returns {Promise<Array>} array of activity objects
 */
export async function loadActivities() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?select=id,kind,data&order=id.asc`,
    { headers }
  );
  if (!res.ok) throw new Error(`Supabase load failed: ${res.status}`);
  const rows = await res.json();
  return rows.map((row) => ({ ...row.data, id: row.id, kind: row.kind }));
}

/**
 * Upsert activities to Supabase (insert or update on conflict)
 * @param {Array} activities - array of activity objects
 * @returns {Promise<number>} number of activities upserted
 */
export async function saveActivities(activities) {
  if (!activities.length) return 0;

  // Supabase REST API limit is ~1000 rows per request, batch in chunks of 500
  const rows = activities.map((a) => ({
    id: a.id,
    kind: a.kind || (a.type === 'Carga' ? 'charge' : 'drive'),
    data: a,
    updated_at: new Date().toISOString(),
  }));

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}`,
      {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch),
      }
    );
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Supabase save failed: ${res.status} ${err}`);
    }
  }
  return rows.length;
}

/**
 * Delete all activities from Supabase
 * @returns {Promise<void>}
 */
export async function deleteAllActivities() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?id=neq.___impossible___`,
    { method: 'DELETE', headers }
  );
  if (!res.ok) throw new Error(`Supabase delete failed: ${res.status}`);
}

/**
 * Delete a single activity by ID
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteActivity(id) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', headers }
  );
  if (!res.ok) throw new Error(`Supabase delete single failed: ${res.status}`);
}

/**
 * Load manual charge costs from Supabase (stored as a single meta row)
 * @returns {Promise<Object>} costs object { chargeId: eurAmount }
 */
export async function loadManualCosts() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.__manual_costs__&select=data`,
    { headers }
  );
  if (!res.ok) return {};
  const rows = await res.json();
  return rows[0]?.data || {};
}

/**
 * Save manual charge costs to Supabase
 * @param {Object} costs - { chargeId: eurAmount }
 */
export async function saveManualCosts(costs) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}`,
    {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: '__manual_costs__',
        kind: 'meta',
        data: costs,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Supabase save costs failed: ${res.status} ${err}`);
  }
}
