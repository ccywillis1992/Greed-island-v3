import { DailySnapshot } from '../types';
import { storage } from './storage';

/**
 * MODULE 5: Daily Snapshot & Historic Performance Engine
 */

/**
 * Parses and formats dates in Hong Kong Timezone (Asia/Hong_Kong, UTC+8)
 */
export function getHongKongDateAndCutoff(nowDate: Date = new Date()): {
  hkDateStr: string;        // YYYY-MM-DD
  bucketDateStr: string;    // YYYY-MM-DD after applying 16:30 HK time cutoff
  hkHour: number;
  hkMinute: number;
  isAfterCutoff: boolean;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(nowDate);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const year = partMap.year;
  const month = partMap.month;
  const day = partMap.day;
  const hkHour = parseInt(partMap.hour || '0', 10);
  const hkMinute = parseInt(partMap.minute || '0', 10);

  const hkDateStr = `${year}-${month}-${day}`;

  // Cutoff rule: 16:30 HK time
  const isAfterCutoff = hkHour > 16 || (hkHour === 16 && hkMinute >= 30);

  let bucketDateStr = hkDateStr;
  if (isAfterCutoff) {
    // Tomorrow's date in HK time
    const [y, m, d] = [parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)];
    const nextDay = new Date(Date.UTC(y, m, d + 1));
    const nextY = nextDay.getUTCFullYear();
    const nextM = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
    const nextD = String(nextDay.getUTCDate()).padStart(2, '0');
    bucketDateStr = `${nextY}-${nextM}-${nextD}`;
  }

  return {
    hkDateStr,
    bucketDateStr,
    hkHour,
    hkMinute,
    isAfterCutoff,
  };
}

/**
 * Helper to add days to a YYYY-MM-DD date string
 */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const newY = dt.getUTCFullYear();
  const newM = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const newD = String(dt.getUTCDate()).padStart(2, '0');
  return `${newY}-${newM}-${newD}`;
}

/**
 * Syncs/Upserts today's live numbers into snapshot storage with Gap Backfill.
 * Pure logic option with `existingSnapshots` parameter for easy unit testing.
 */
export function syncDailySnapshot(
  liveNumberA: number,
  liveNumberD: number,
  nowDate: Date = new Date(),
  existingSnapshots?: DailySnapshot[],
  persist: boolean = true
): {
  updatedSnapshots: DailySnapshot[];
  bucketDate: string;
  isAfterCutoff: boolean;
  backfilledDates: string[];
  upserted: boolean;
} {
  const { bucketDateStr, isAfterCutoff } = getHongKongDateAndCutoff(nowDate);
  const snapshots = [...(existingSnapshots || storage.getSnapshots())];

  // Map by date for O(1) lookup
  const snapshotMap: Record<string, DailySnapshot> = {};
  for (const s of snapshots) {
    snapshotMap[s.date] = { ...s };
  }

  const backfilledDates: string[] = [];
  const sortedDates = Object.keys(snapshotMap).sort();

  if (sortedDates.length > 0) {
    const lastDate = sortedDates[sortedDates.length - 1];

    // Check if there are missing dates between lastDate and bucketDateStr
    let currDateStr = addDaysToDateStr(lastDate, 1);

    while (currDateStr < bucketDateStr) {
      if (!snapshotMap[currDateStr]) {
        // Gap backfill entry
        snapshotMap[currDateStr] = {
          date: currDateStr,
          totalAssetsExCash: liveNumberA,
          totalAssetsWithCash: liveNumberD,
          recordedAt: nowDate.toISOString(),
          isBackfilled: true,
          isManuallyEdited: false,
        };
        backfilledDates.push(currDateStr);
      }
      currDateStr = addDaysToDateStr(currDateStr, 1);
    }
  }

  // Target bucket date upsert
  let upserted = false;
  const existingTarget = snapshotMap[bucketDateStr];

  if (!existingTarget) {
    snapshotMap[bucketDateStr] = {
      date: bucketDateStr,
      totalAssetsExCash: liveNumberA,
      totalAssetsWithCash: liveNumberD,
      recordedAt: nowDate.toISOString(),
      isBackfilled: false,
      isManuallyEdited: false,
    };
    upserted = true;
  } else {
    // If NOT manually edited, update with live numbers
    if (!existingTarget.isManuallyEdited) {
      snapshotMap[bucketDateStr] = {
        ...existingTarget,
        totalAssetsExCash: liveNumberA,
        totalAssetsWithCash: liveNumberD,
        recordedAt: nowDate.toISOString(),
        isBackfilled: false, // User visited, no longer pure backfill
      };
      upserted = true;
    }
  }

  const updatedSnapshots = Object.values(snapshotMap).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (persist) {
    storage.saveSnapshots(updatedSnapshots);
  }

  return {
    updatedSnapshots,
    bucketDate: bucketDateStr,
    isAfterCutoff,
    backfilledDates,
    upserted,
  };
}

/**
 * Manually update or create a snapshot entry (History Tab).
 * Sets isManuallyEdited: true.
 */
export function editSnapshot(
  dateStr: string,
  totalAssetsExCash: number,
  totalAssetsWithCash: number
): { success: boolean; snapshots: DailySnapshot[] } {
  const snapshots = storage.getSnapshots();
  const existingIndex = snapshots.findIndex((s) => s.date === dateStr);

  const updatedSnapshots = [...snapshots];

  if (existingIndex >= 0) {
    updatedSnapshots[existingIndex] = {
      ...updatedSnapshots[existingIndex],
      totalAssetsExCash: Math.round(totalAssetsExCash * 100) / 100,
      totalAssetsWithCash: Math.round(totalAssetsWithCash * 100) / 100,
      recordedAt: new Date().toISOString(),
      isManuallyEdited: true,
    };
  } else {
    updatedSnapshots.push({
      date: dateStr,
      totalAssetsExCash: Math.round(totalAssetsExCash * 100) / 100,
      totalAssetsWithCash: Math.round(totalAssetsWithCash * 100) / 100,
      recordedAt: new Date().toISOString(),
      isBackfilled: false,
      isManuallyEdited: true,
    });
  }

  updatedSnapshots.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const res = storage.saveSnapshots(updatedSnapshots);

  return {
    success: res.success,
    snapshots: updatedSnapshots,
  };
}

/**
 * Deletes a snapshot entry
 */
export function deleteSnapshot(dateStr: string): { success: boolean; snapshots: DailySnapshot[] } {
  const snapshots = storage.getSnapshots();
  const filtered = snapshots.filter((s) => s.date !== dateStr);
  const res = storage.saveSnapshots(filtered);
  return {
    success: res.success,
    snapshots: filtered,
  };
}

/**
 * Module 5 Sanity Test Suite
 * Tests Cutoff Rule, Upsert on same day, 3-day gap backfill, and manual edit preservation.
 */
export function runSnapshotSanitySuite(): {
  success: boolean;
  logs: string[];
} {
  const logs: string[] = [];
  let success = true;

  try {
    // 1. Cutoff Rule Test: Before 16:30 HK time
    // 2026-08-09 10:00 UTC = 18:00 HK time (after cutoff -> tomorrow 2026-08-10)
    // 2026-08-09 04:00 UTC = 12:00 HK time (before cutoff -> today 2026-08-09)
    const dtBefore = new Date('2026-08-09T04:00:00Z'); // 12:00 HK
    const cutoffBefore = getHongKongDateAndCutoff(dtBefore);
    if (cutoffBefore.bucketDateStr === '2026-08-09' && !cutoffBefore.isAfterCutoff) {
      logs.push('✓ Cutoff Rule (before 16:30 HK): bucketed to TODAY (2026-08-09)');
    } else {
      logs.push(`✗ Cutoff Rule failure (before 16:30 HK): got ${cutoffBefore.bucketDateStr}`);
      success = false;
    }

    // Cutoff Rule Test: After 16:30 HK time
    const dtAfter = new Date('2026-08-09T10:00:00Z'); // 18:00 HK
    const cutoffAfter = getHongKongDateAndCutoff(dtAfter);
    if (cutoffAfter.bucketDateStr === '2026-08-10' && cutoffAfter.isAfterCutoff) {
      logs.push('✓ Cutoff Rule (after 16:30 HK): bucketed to TOMORROW (2026-08-10)');
    } else {
      logs.push(`✗ Cutoff Rule failure (after 16:30 HK): got ${cutoffAfter.bucketDateStr}`);
      success = false;
    }

    // 2. Same-day double visit Upsert Test
    const visit1 = syncDailySnapshot(10000, 12000, dtBefore, [], false);
    if (visit1.updatedSnapshots.length === 1 && visit1.updatedSnapshots[0].totalAssetsExCash === 10000) {
      logs.push('✓ Visit 1 created 1 snapshot entry for 2026-08-09 ($10,000)');
    } else {
      logs.push('✗ Visit 1 failed');
      success = false;
    }

    // Visit 2 same day, updated live numbers
    const visit2 = syncDailySnapshot(10500, 12500, dtBefore, visit1.updatedSnapshots, false);
    if (
      visit2.updatedSnapshots.length === 1 &&
      visit2.updatedSnapshots[0].totalAssetsExCash === 10500 &&
      visit2.updatedSnapshots[0].date === '2026-08-09'
    ) {
      logs.push('✓ Visit 2 overwrote same snapshot bucket (upserted to $10,500 without duplicate)');
    } else {
      logs.push('✗ Visit 2 failed to overwrite');
      success = false;
    }

    // 3. Gap Backfill Test (simulate 3-day gap)
    // Last snapshot was 2026-08-05. Current visit is 2026-08-09 (12:00 HK)
    const initialWithGap: DailySnapshot[] = [
      {
        date: '2026-08-05',
        totalAssetsExCash: 9000,
        totalAssetsWithCash: 11000,
        recordedAt: '2026-08-05T04:00:00Z',
        isBackfilled: false,
        isManuallyEdited: false,
      },
    ];

    const gapSync = syncDailySnapshot(10500, 12500, dtBefore, initialWithGap, false);
    // Should have 2026-08-05 (original), 2026-08-06 (backfill), 2026-08-07 (backfill), 2026-08-08 (backfill), 2026-08-09 (live)
    const backfilled = gapSync.updatedSnapshots.filter((s) => s.isBackfilled);
    if (gapSync.updatedSnapshots.length === 5 && backfilled.length === 3) {
      logs.push('✓ Simulated 3-day gap: generated 3 backfilled entries (2026-08-06, 07, 08) flagged isBackfilled: true');
    } else {
      logs.push(
        `✗ Gap backfill failed: expected 5 total / 3 backfilled, got ${gapSync.updatedSnapshots.length} total / ${backfilled.length} backfilled`
      );
      success = false;
    }

    // 4. Manual Edit Preservation Test
    // Suppose 2026-08-07 was manually edited to $9,500
    const snapshotWithManualEdit = gapSync.updatedSnapshots.map((s) =>
      s.date === '2026-08-07' ? { ...s, totalAssetsExCash: 9500, isManuallyEdited: true } : s
    );

    // Re-run syncDailySnapshot
    const reSync = syncDailySnapshot(11000, 13000, dtBefore, snapshotWithManualEdit, false);
    const manualEntry = reSync.updatedSnapshots.find((s) => s.date === '2026-08-07');

    if (manualEntry && manualEntry.totalAssetsExCash === 9500 && manualEntry.isManuallyEdited) {
      logs.push('✓ Manually edited entry (2026-08-07 = $9,500) was left untouched during subsequent sync/backfill');
    } else {
      logs.push('✗ Manual edit was overwritten during sync!');
      success = false;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logs.push(`✗ Sanity test error: ${msg}`);
    success = false;
  }

  return { success, logs };
}
