import { useState } from 'react';
import type { NewCirclePayload } from '../components/AddCirclePanel';
import type { CircleInfoInput } from '../components/CircleInfoBar';
import { fetchAudubonCircleDetails } from '../services/audubonCirclePage';
import { CBC_CIRCLE_RADIUS_MILES } from '../services/cbcCircle';
import { countDateInSeason } from '../services/countDay';
import { describeError } from '../services/describeError';
import { failuresToError, type ActionContext } from './actionContext';

interface CircleNavigation {
  afterSwitch: () => void;
  afterCreate: () => void;
}

export function useCircleActions(
  { db, activeCircle, reload, flash, setError, confirm }: ActionContext,
  savedCircleCodes: readonly string[],
  navigation: CircleNavigation
) {
  const [refreshingAudubon, setRefreshingAudubon] = useState(false);
  const attempt = failuresToError(setError);

  async function selectCircle(code: string) {
    await attempt(async () => {
      await db.setActiveCircle(code);
      await reload();
      navigation.afterSwitch();
      flash(`Switched to circle ${code}`);
    });
  }

  /** @returns true when the circle was added */
  async function createCircle(payload: NewCirclePayload): Promise<boolean> {
    const code = payload.code.trim().toUpperCase();
    if (savedCircleCodes.includes(code)) {
      setError(
        `Circle ${code} is already in My Circles. Select it from the list, or add the new circle with a different code.`
      );
      return false;
    }
    let isAdded = false;
    await attempt(async () => {
      await db.upsertFavoriteCircle({
        code,
        name: payload.name,
        state_province: payload.state_province ?? null,
        center_lat: payload.center_lat,
        center_lng: payload.center_lng,
        radius_miles: payload.radius_miles ?? CBC_CIRCLE_RADIUS_MILES,
        compiler_name: payload.compiler_name ?? null,
        compiler_email: payload.compiler_email ?? null,
        count_date: payload.count_date ?? null,
        audubon_url: payload.audubon_url ?? null,
        setActive: true,
      });
      if (payload.initialBoundaries && payload.initialBoundaries.length > 0) {
        await db.upsertCircleBoundaries(code, payload.initialBoundaries);
      }
      isAdded = true;
      await reload();
      navigation.afterCreate();
      flash(`Added ${code} (${payload.name}) to My Circles.`);
    });
    return isAdded;
  }

  async function renameActiveCircle() {
    if (!activeCircle) return;
    const nextName = window.prompt(`Rename circle ${activeCircle.code}:`, activeCircle.name)?.trim();
    if (!nextName || nextName === activeCircle.name) return;
    await attempt(async () => {
      await db.renameCircle(activeCircle.code, nextName);
      await reload();
      flash(`Renamed ${activeCircle.code} to "${nextName}".`);
    });
  }

  function removeActiveCircle() {
    if (!activeCircle) return;
    const target = activeCircle;
    confirm({
      title: `Delete Circle ${target.code} — ${target.name}?`,
      message:
        'Deleting this circle permanently removes ALL data associated with it from your local browser database.',
      details: [
        'All participants, emails, and multi-year assignment history for this circle',
        'All areas, notes, and active restrictions',
        'All imported KML / KMZ map boundaries',
      ],
      confirmLabel: `Permanently Delete ${target.code}`,
      requireTypedText: target.code,
      showBackupPrompt: true,
      onConfirm: () =>
        attempt(async () => {
          await db.removeFavoriteCircle(target.code);
          await reload();
          flash(`Removed ${target.code} from My Circles.`);
        }),
    });
  }

  /** @returns true when the info was saved */
  async function saveCircleInfo(info: CircleInfoInput): Promise<boolean> {
    if (!activeCircle) return false;
    let isSaved = false;
    await attempt(async () => {
      await db.updateCircleInfo(activeCircle.code, { ...info, audubon_url: activeCircle.audubon_url });
      isSaved = true;
      await reload();
      flash(`Updated circle info for ${activeCircle.code}.`);
    });
    return isSaved;
  }

  async function refreshFromAudubon() {
    if (!activeCircle) return;
    const circle = activeCircle;
    setRefreshingAudubon(true);
    try {
      const details = await fetchAudubonCircleDetails(circle.code);
      if (!details) {
        setError(`No Audubon circle page found for ${circle.code}.`);
        return;
      }
      const season = circle.current_year;
      const audubonDate = season === null ? null : countDateInSeason(details.countDate, season);
      const savedDate = season === null ? null : countDateInSeason(circle.count_date, season);
      await db.updateCircleInfo(circle.code, {
        compiler_name: details.compilerName ?? circle.compiler_name,
        compiler_email: details.compilerEmail ?? circle.compiler_email,
        count_date: audubonDate ?? savedDate,
        audubon_url: details.pageUrl,
      });
      await reload();
      flash(
        audubonDate || !details.countDate
          ? `Updated ${circle.code} count date and compiler from Audubon.`
          : `Updated ${circle.code} compiler from Audubon. Its count date, ${details.countDate}, is not in the ${season} season, so it was not used.`
      );
    } catch (err) {
      setError(`Audubon refresh failed: ${describeError(err)}`);
    } finally {
      setRefreshingAudubon(false);
    }
  }

  return { refreshingAudubon, selectCircle, createCircle, renameActiveCircle, removeActiveCircle, saveCircleInfo, refreshFromAudubon };
}
