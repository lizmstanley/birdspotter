import { useMemo, useState } from 'react';
import type { AreaOption, ImportOptions } from '../../db/pgliteDb';
import { isAudubonExport, mapAudubonRows } from '../../services/audubonImport';
import {
  buildRows,
  checkRows,
  distinctValues,
  type ColumnMapping,
  type ValueMap,
} from '../../services/importPreview';
import { guessMapping } from './workbook';

const EMPTY_MAPPING: ColumnMapping = {
  nameCol: '',
  emailCol: '',
  areaCol: '',
  rsvpCol: '',
  typeCol: '',
  noteCol: '',
};

export type RosterImportForm = ReturnType<typeof useRosterImportForm>;

export function useRosterImportForm(areas: AreaOption[]) {
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [rsvpValues, setRsvpValues] = useState<ValueMap>({});
  const [typeValues, setTypeValues] = useState<ValueMap>({});
  const [isAudubon, setIsAudubon] = useState(false);
  const [defaultRsvp, setDefaultRsvp] = useState('');
  const [isCurrentList, setIsCurrentList] = useState(false);

  function startFile(name: string) {
    setFileName(name);
    setHeaders([]);
    setRawRows([]);
  }

  function loadRows(parsed: Record<string, unknown>[]) {
    const cols = parsed.length > 0 ? Object.keys(parsed[0]) : [];
    setHeaders(cols);
    setIsAudubon(isAudubonExport(cols));
    setRawRows(parsed);
    setRsvpValues({});
    setTypeValues({});
    setDefaultRsvp('');
    setIsCurrentList(false);
    setMapping(guessMapping(cols));
  }

  function chooseMapping(key: keyof ColumnMapping, value: string) {
    setMapping((m) => ({ ...m, [key]: value }));
    if (key === 'rsvpCol') setRsvpValues({});
    if (key === 'typeCol') setTypeValues({});
  }

  const mappedRows = useMemo(
    () => (isAudubon ? mapAudubonRows(rawRows) : buildRows(rawRows, mapping, rsvpValues, typeValues)),
    [isAudubon, rawRows, mapping, rsvpValues, typeValues]
  );
  const check = useMemo(
    () =>
      checkRows(
        mappedRows,
        areas.map((a) => a.code)
      ),
    [mappedRows, areas]
  );
  const rsvpDistinct = useMemo(
    () => (isAudubon ? [] : distinctValues(rawRows, mapping.rsvpCol)),
    [isAudubon, rawRows, mapping.rsvpCol]
  );
  const typeDistinct = useMemo(
    () => (isAudubon ? [] : distinctValues(rawRows, mapping.typeCol)),
    [isAudubon, rawRows, mapping.typeCol]
  );

  const needsDefaultRsvp = !isAudubon && !mapping.rsvpCol;

  /** @returns why the import cannot run yet, or null when it can. */
  function blockingProblem(): string | null {
    if (!isAudubon && !mapping.emailCol) return 'Please select an Email column first.';
    if (needsDefaultRsvp && !defaultRsvp) return 'Choose an RSVP for people new to this season first.';
    return null;
  }

  function importOptions(): ImportOptions {
    // An Audubon list adds people and marks who is on it. It never changes what the compiler recorded.
    return isAudubon
      ? { defaultRsvp: 'no_response', updateExisting: false, isCurrentList: false }
      : { defaultRsvp: defaultRsvp || undefined, updateExisting: true, isCurrentList };
  }

  return {
    fileName,
    headers,
    rawRows,
    mapping,
    rsvpValues,
    setRsvpValues,
    typeValues,
    setTypeValues,
    isAudubon,
    defaultRsvp,
    setDefaultRsvp,
    isCurrentList,
    setIsCurrentList,
    startFile,
    loadRows,
    chooseMapping,
    mappedRows,
    check,
    rsvpDistinct,
    typeDistinct,
    needsDefaultRsvp,
    blockingProblem,
    importOptions,
  };
}
