import type { PGlite } from '@electric-sql/pglite';
import type { MultiLineString } from 'geojson';
import * as areas from './areas.ts';
import * as backup from './backup.ts';
import * as circles from './circles.ts';
import { DatabaseNotOpenError } from './errors.ts';
import { migrate, type Migration } from './migrations.ts';
import * as parties from './parties.ts';
import * as readModels from './readModels.ts';
import * as roster from './roster.ts';
import * as seasons from './seasons.ts';
import type {
  AreaBoundaryRow,
  AreaOption,
  AreaPartyTotals,
  AssignmentRow,
  BoundaryInput,
  CircleInfoInput,
  CircleInput,
  ImportedParticipantRow,
  ImportOptions,
  OpenAreaRow,
  Party,
  PartyRoute,
  PersonHistory,
  PossibleOutreachRow,
  ReminderRow,
  RolloverOptions,
  SavedCircle,
  SeasonParty,
} from './types.ts';

export class CbcDb {
  private client: PGlite | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly openClient: () => Promise<PGlite>;
  private readonly migrations: readonly Migration[];
  private readonly viewsSql: string;

  constructor(openClient: () => Promise<PGlite>, migrations: readonly Migration[], viewsSql: string) {
    this.openClient = openClient;
    this.migrations = migrations;
    this.viewsSql = viewsSql;
  }

  init(): Promise<void> {
    this.initPromise ??= this.openAndMigrate();
    return this.initPromise;
  }

  private async openAndMigrate(): Promise<void> {
    const client = await this.openClient();
    await migrate(client, this.migrations, this.viewsSql);
    this.client = client;
  }

  private get db(): PGlite {
    if (!this.client) throw new DatabaseNotOpenError();
    return this.client;
  }

  getSavedCircles(): Promise<SavedCircle[]> {
    return circles.getSavedCircles(this.db);
  }

  upsertFavoriteCircle(circle: CircleInput): Promise<void> {
    return circles.upsertFavoriteCircle(this.db, circle);
  }

  setActiveCircle(code: string): Promise<void> {
    return circles.setActiveCircle(this.db, code);
  }

  removeFavoriteCircle(code: string): Promise<void> {
    return circles.removeFavoriteCircle(this.db, code);
  }

  updateActiveCircleCenter(code: string, lat: number, lng: number): Promise<void> {
    return circles.updateActiveCircleCenter(this.db, code, lat, lng);
  }

  renameCircle(code: string, newName: string): Promise<void> {
    return circles.renameCircle(this.db, code, newName);
  }

  updateCircleInfo(code: string, info: CircleInfoInput): Promise<void> {
    return circles.updateCircleInfo(this.db, code, info);
  }

  getAssignments(circleCode: string): Promise<AssignmentRow[]> {
    return readModels.getAssignments(this.db, circleCode);
  }

  getPersonHistory(personId: number): Promise<PersonHistory | null> {
    return readModels.getPersonHistory(this.db, personId);
  }

  getOpenAreas(circleCode: string): Promise<OpenAreaRow[]> {
    return readModels.getOpenAreas(this.db, circleCode);
  }

  getNeedsReminder(circleCode: string): Promise<ReminderRow[]> {
    return readModels.getNeedsReminder(this.db, circleCode);
  }

  getPossibleOutreach(circleCode: string): Promise<PossibleOutreachRow[]> {
    return readModels.getPossibleOutreach(this.db, circleCode);
  }

  getAreas(circleCode: string): Promise<AreaOption[]> {
    return areas.getAreas(this.db, circleCode);
  }

  getCircleBoundaries(circleCode: string): Promise<AreaBoundaryRow[]> {
    return areas.getCircleBoundaries(this.db, circleCode);
  }

  upsertCircleBoundaries(circleCode: string, boundaries: BoundaryInput[]): Promise<{ saved: number }> {
    return areas.upsertCircleBoundaries(this.db, circleCode, boundaries);
  }

  setAreaCounted(circleCode: string, areaCode: string, isCounted: boolean): Promise<void> {
    return areas.setAreaCounted(this.db, circleCode, areaCode, isCounted);
  }

  setAreaCounterNote(circleCode: string, areaCode: string, note: string): Promise<void> {
    return areas.setAreaCounterNote(this.db, circleCode, areaCode, note);
  }

  setAreaResultsReceived(circleCode: string, areaCode: string, received: boolean): Promise<void> {
    return areas.setAreaResultsReceived(this.db, circleCode, areaCode, received);
  }

  deleteArea(circleCode: string, areaCode: string): Promise<void> {
    return areas.deleteArea(this.db, circleCode, areaCode);
  }

  clearCircleBoundaries(circleCode: string): Promise<void> {
    return areas.clearCircleBoundaries(this.db, circleCode);
  }

  getCurrentParties(circleCode: string): Promise<Party[]> {
    return parties.getCurrentParties(this.db, circleCode);
  }

  getCurrentPartyRoutes(circleCode: string): Promise<PartyRoute[]> {
    return parties.getCurrentPartyRoutes(this.db, circleCode);
  }

  getCurrentPartyTotals(circleCode: string): Promise<AreaPartyTotals[]> {
    return parties.getCurrentPartyTotals(this.db, circleCode);
  }

  saveParty(circleCode: string, party: Party): Promise<void> {
    return parties.saveParty(this.db, circleCode, party);
  }

  savePartyInSeason(circleCode: string, season: number, party: Party, route: MultiLineString | null): Promise<void> {
    return parties.savePartyInSeason(this.db, circleCode, season, party, route);
  }

  findParty(circleCode: string, partyId: string): Promise<SeasonParty | null> {
    return parties.findParty(this.db, circleCode, partyId);
  }

  getSeasons(circleCode: string): Promise<number[]> {
    return seasons.getSeasons(this.db, circleCode);
  }

  deleteParty(circleCode: string, partyId: string): Promise<void> {
    return parties.deleteParty(this.db, circleCode, partyId);
  }

  clearCircleRoster(circleCode: string): Promise<void> {
    return roster.clearCircleRoster(this.db, circleCode);
  }

  reassignArea(participationId: number, newAreaCode: string | null): Promise<void> {
    return roster.reassignArea(this.db, participationId, newAreaCode);
  }

  importParticipants(
    circleCode: string,
    rows: ImportedParticipantRow[],
    options: ImportOptions
  ): Promise<{ imported: number }> {
    return roster.importParticipants(this.db, circleCode, rows, options);
  }

  rolloverSeason(circleCode: string, newYear: number, options: RolloverOptions): Promise<void> {
    return seasons.rolloverSeason(this.db, circleCode, newYear, options);
  }

  exportJsonBackup(): Promise<string> {
    return backup.exportJsonBackup(this.db);
  }

  importJsonBackup(jsonText: string): Promise<{ people: number; participations: number; circles: number }> {
    return backup.importJsonBackup(this.db, jsonText);
  }
}
