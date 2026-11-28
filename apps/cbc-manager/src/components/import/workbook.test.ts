import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { SAMPLE_HEADERS, SAMPLE_ROWS } from '../../services/importPreview.ts';
import { csvSafeRows, participantsWorkbook, readFirstSheet } from './workbook.ts';

test('csv text that a spreadsheet would run as a formula starts with a quote', () => {
  const rows = csvSafeRows([
    { Name: '=HYPERLINK("http://example.com","x")', Notes: '+1', Email: '-5', Area: '@SUM(A1)', Cities: '\tx', Other: '\rx' },
    { Name: 'Pat Example', Notes: 'a=b', Email: 'pat@example.com', Area: 'A1', Cities: '', Other: '' },
  ]);
  const csv: string = XLSX.write(participantsWorkbook(XLSX.utils.json_to_sheet(rows)), { type: 'string', bookType: 'csv' });
  assert.deepEqual(rows[0], {
    Name: `'=HYPERLINK("http://example.com","x")`,
    Notes: "'+1",
    Email: "'-5",
    Area: "'@SUM(A1)",
    Cities: "'\tx",
    Other: "'\rx",
  });
  assert.deepEqual(rows[1], { Name: 'Pat Example', Notes: 'a=b', Email: 'pat@example.com', Area: 'A1', Cities: '', Other: '' });
  assert.ok(csv.includes(`"'=HYPERLINK(""http://example.com"",""x"")"`), csv);
});

function sampleFile(bookType: XLSX.BookType, name: string): File {
  const sheet = XLSX.utils.json_to_sheet(SAMPLE_ROWS, { header: SAMPLE_HEADERS });
  const bytes: ArrayBuffer = XLSX.write(participantsWorkbook(sheet), { type: 'array', bookType });
  return new File([bytes], name);
}

for (const [bookType, name] of [['xlsx', 'roster.xlsx'], ['biff8', 'roster.xls'], ['csv', 'roster.csv']] as const) {
  test(`a sample roster written as ${name} reads back as the same rows`, async () => {
    assert.deepEqual(await readFirstSheet(sampleFile(bookType, name)), SAMPLE_ROWS);
  });
}

test('the exported workbook holds one sheet named Participants', () => {
  const wb = participantsWorkbook(XLSX.utils.json_to_sheet(SAMPLE_ROWS));
  assert.deepEqual(wb.SheetNames, ['Participants']);
});

test('only the first sheet is read', async () => {
  const wb = participantsWorkbook(XLSX.utils.json_to_sheet([{ Email: 'first@example.com' }]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Email: 'second@example.com' }]), 'Other');
  const bytes: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  assert.deepEqual(await readFirstSheet(new File([bytes], 'two-sheets.xlsx')), [{ Email: 'first@example.com' }]);
});

test('a blank cell reads as an empty string, so every row has every column', async () => {
  const sheet = XLSX.utils.aoa_to_sheet([['Name', 'Email'], ['', 'pat@example.com']]);
  const bytes: ArrayBuffer = XLSX.write(participantsWorkbook(sheet), { type: 'array', bookType: 'xlsx' });
  assert.deepEqual(await readFirstSheet(new File([bytes], 'blank.xlsx')), [{ Name: '', Email: 'pat@example.com' }]);
});
