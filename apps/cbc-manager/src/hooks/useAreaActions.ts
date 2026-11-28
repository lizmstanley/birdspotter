import type { Party } from '../db/pgliteDb';
import { describeError } from '../services/describeError';
import type { ParsedAreaBoundary } from '../services/kmlParser';
import { failuresToError, type ActionContext } from './actionContext';

export function useAreaActions(
  { db, activeCircle, reload, flash, setError, confirm }: ActionContext,
  boundaryCount: number
) {
  const attempt = failuresToError(setError);

  async function reassign(participationId: number, newArea: string) {
    await attempt(async () => {
      await db.reassignArea(participationId, newArea || null);
      await reload();
      flash('Area assignment updated.');
    });
  }

  async function changeCenter(lat: number, lng: number) {
    if (!activeCircle) return;
    await attempt(async () => {
      await db.updateActiveCircleCenter(activeCircle.code, lat, lng);
      await reload();
      flash(`Saved ${activeCircle.code} center: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    });
  }

  async function importBoundaries(boundaries: ParsedAreaBoundary[]) {
    if (!activeCircle) return { saved: 0 };
    const res = await db.upsertCircleBoundaries(activeCircle.code, boundaries);
    await reload();
    flash(`Saved ${res.saved} KML/KMZ area boundaries for ${activeCircle.code}.`);
    return res;
  }

  async function clearBoundaries() {
    if (!activeCircle) return;
    const code = activeCircle.code;
    confirm({
      title: `Clear Map Boundaries for ${code}?`,
      message: `This will remove all ${boundaryCount} imported KML / KMZ polygons from ${code}'s map. Your participant roster and assignments will be kept.`,
      confirmLabel: 'Clear Map Boundaries',
      showBackupPrompt: true,
      onConfirm: () =>
        attempt(async () => {
          await db.clearCircleBoundaries(code);
          await reload();
          flash(`Cleared imported area boundaries for ${code}.`);
        }),
    });
  }

  async function toggleResultsReceived(areaCode: string, received: boolean) {
    if (!activeCircle) return;
    await attempt(async () => {
      await db.setAreaResultsReceived(activeCircle.code, areaCode, received);
      await reload();
      flash(
        received
          ? `Marked Area ${areaCode} results as received.`
          : `Marked Area ${areaCode} as awaiting results.`
      );
    });
  }

  async function toggleAreaCounted(areaCode: string, isCounted: boolean) {
    if (!activeCircle) return;
    await attempt(async () => {
      await db.setAreaCounted(activeCircle.code, areaCode, isCounted);
      await reload();
      flash(
        isCounted
          ? `Restored "${areaCode}" to counted areas.`
          : `Marked "${areaCode}" as Not Counted (kept on map in gray).`
      );
    });
  }

  async function saveCounterNote(areaCode: string, note: string) {
    if (!activeCircle) return;
    await attempt(async () => {
      await db.setAreaCounterNote(activeCircle.code, areaCode, note);
      await reload();
      flash(note.trim() ? `Saved the note for "${areaCode}".` : `Cleared the note for "${areaCode}".`);
    });
  }

  /** @returns whether the party was saved */
  async function saveParty(party: Party): Promise<boolean> {
    if (!activeCircle) return false;
    try {
      await db.saveParty(activeCircle.code, party);
    } catch (err) {
      setError(describeError(err));
      return false;
    }
    await reload();
    flash(`Saved the party in "${party.area_code}".`);
    return true;
  }

  function removeParty(party: Party) {
    if (!activeCircle) return;
    const code = activeCircle.code;
    confirm({
      title: `Remove this party from "${party.area_code}"?`,
      message: `Its hours, miles, and participants leave the area's totals for this season.`,
      confirmLabel: 'Remove Party',
      onConfirm: () =>
        attempt(async () => {
          await db.deleteParty(code, party.party_id);
          await reload();
          flash(`Removed the party from "${party.area_code}".`);
        }),
    });
  }

  function deleteArea(areaCode: string) {
    if (!activeCircle) return;
    const code = activeCircle.code;
    confirm({
      title: `Remove "${areaCode}" from ${code}?`,
      message: `This removes "${areaCode}" from ${code}'s area list and unassigns any counters currently assigned to it. Its parties are removed from every season. Any KML map outline will remain on the map.`,
      confirmLabel: `Remove ${areaCode}`,
      onConfirm: () =>
        attempt(async () => {
          await db.deleteArea(code, areaCode);
          await reload();
          flash(`Removed "${areaCode}" from ${code} areas.`);
        }),
    });
  }

  return {
    reassign,
    changeCenter,
    importBoundaries,
    clearBoundaries,
    toggleResultsReceived,
    toggleAreaCounted,
    saveCounterNote,
    saveParty,
    removeParty,
    deleteArea,
  };
}
