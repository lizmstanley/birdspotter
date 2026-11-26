import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAudubonCirclePage } from './audubonCirclePage.ts';

interface Leader {
  fullName: string;
  email: string;
  isVisibleLeader: boolean;
}

function pageWithCircle(abbreviation: string, leaders: Leader[], description = 'Plain text.'): string {
  const circle = {
    circleId: 'id-1',
    abbreviation,
    circleName: 'Testville',
    stateProvinceId: 'MN',
    position: { latitude: 44.5, longitude: -93.25 },
    countDate: '2026-12-19',
    circleDescription: description,
    leaders,
  };
  const flight = `19:["$","$L32",null,{"circle":${JSON.stringify(circle)},"children":[]}]\n`;
  // Split across two pushes, as Next.js does, to prove the chunks are joined before parsing.
  const half = Math.floor(flight.length / 2);
  const push = (s: string) => `<script>self.__next_f.push([1,${JSON.stringify(s)}])</script>`;
  return `<html><body>${push('0:{"P":null}\n')}${push(flight.slice(0, half))}${push(flight.slice(half))}</body></html>`;
}

const visible: Leader = { fullName: 'Pat Compiler', email: 'pat@example.com', isVisibleLeader: true };
const hidden: Leader = { fullName: 'Hidden Helper', email: 'hidden@example.com', isVisibleLeader: false };

test('reads count date, center, and the visible compiler', () => {
  const details = parseAudubonCirclePage(pageWithCircle('TEST', [hidden, visible]), 'TEST');
  assert.deepEqual(details, {
    code: 'TEST',
    name: 'Testville',
    stateProvince: 'MN',
    lat: 44.5,
    lng: -93.25,
    countDate: '2026-12-19',
    compilerName: 'Pat Compiler',
    compilerEmail: 'pat@example.com',
    pageUrl: 'https://cbc.audubon.org/en/join/circles/TEST',
  });
});

test('never returns a leader the page does not show publicly', () => {
  const details = parseAudubonCirclePage(pageWithCircle('TEST', [hidden]), 'TEST');
  assert.equal(details?.compilerName, null);
  assert.equal(details?.compilerEmail, null);
});

test('returns null when the page holds a different circle', () => {
  assert.equal(parseAudubonCirclePage(pageWithCircle('OTHR', [visible]), 'TEST'), null);
});

test('ignores braces and quotes inside the description', () => {
  const details = parseAudubonCirclePage(
    pageWithCircle('TEST', [visible], 'Areas {1-24} "north" } and { more'),
    'TEST'
  );
  assert.equal(details?.countDate, '2026-12-19');
});

test('returns null for a page without circle data', () => {
  assert.equal(parseAudubonCirclePage('<html><body>Not found</body></html>', 'TEST'), null);
});
