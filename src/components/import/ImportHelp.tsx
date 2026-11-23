import * as XLSX from 'xlsx';
import { SAMPLE_HEADERS, SAMPLE_ROWS } from '../../services/importPreview';
import { writeParticipantsSheet, type SheetFormat } from './workbook';

function downloadSample(format: SheetFormat) {
  const sheet = XLSX.utils.json_to_sheet(SAMPLE_ROWS, { header: SAMPLE_HEADERS });
  writeParticipantsSheet(sheet, 'cbc-participants-sample', format);
}

export function ImportHelp() {
  return (
    <details className="import-help">
      <summary>What columns can I use? Download a sample</summary>
      <ul>
        <li><strong>Email</strong> (required): rows without an email are skipped. The same email in a later row updates the same person.</li>
        <li><strong>Name</strong>: if blank, the part of the email before the @ is used.</li>
        <li><strong>Area</strong>: an area code such as A1. New codes are added to the circle.</li>
        <li><strong>RSVP</strong>: for example Yes, Maybe, No. You can choose what each value in your file means before you import. With no RSVP column, you choose the RSVP for people new to this season.</li>
        <li><strong>Counter Type</strong>: Field, Feeder, or Both. Blank means Field.</li>
        <li><strong>Notes</strong>: saved as a note on the person.</li>
      </ul>
      <p>
        A column you skip, or a blank Area, keeps what is already saved for this season.
      </p>
      <p>
        A participant list exported from your circle page on the Audubon site is recognized and needs no setup. It adds
        new people and marks who is on the Audubon list. It never changes the RSVP, type, or area you already have for
        someone. The sample file uses made-up names and emails.
      </p>
      <div className="row-actions">
        <button type="button" onClick={() => downloadSample('csv')}>Sample (.csv)</button>
        <button type="button" onClick={() => downloadSample('xlsx')}>Sample (.xlsx)</button>
      </div>
    </details>
  );
}
