import { failuresToError, type ActionContext } from './actionContext';

export function useSeasonActions({ db, activeCircle, reload, flash, setError }: ActionContext) {
  const attempt = failuresToError(setError);

  async function rollOver(nextSeason: number, carryAssignments: boolean) {
    if (!activeCircle) return;
    await attempt(async () => {
      await db.rolloverSeason(activeCircle.code, nextSeason, { carryAssignments });
      await reload();
      flash(`${activeCircle.code} is now on the ${nextSeason} season.`);
    });
  }

  return { rollOver };
}
