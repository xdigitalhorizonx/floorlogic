import { describe, expect, it } from 'vitest';
import {
  addDays, daysBetween, docNumberSuffix, fmtDate, fmtMoney, fmtNum, fmtQty, fmtSignedMoney, formatDocNumber, isoDay, num, round2,
} from '../../src/lib/logic';

describe('money', () => {
  it('num() is the app’s Number(v)||0', () => {
    expect([num(''), num(null), num(undefined), num('abc'), num('12.5'), num(3)]).toEqual([0, 0, 0, 0, 12.5, 3]);
  });

  it.each([
    [927.03, 927.03],
    [4217.9865, 4217.99],
    [432.992, 432.99],
    [1.005, 1], // 1.005 is 1.00499… in binary — same as the app
    [0.125, 0.13],
    [-2.5, -2.5],
  ])('round2(%s) = %s', (n, want) => expect(round2(n)).toBe(want));

  it('fmtMoney matches the app’s fmt$ shape', () => {
    expect(fmtMoney(8624.696)).toBe('$8,624.70');
    expect(fmtMoney(0)).toBe('$0.00');
    expect(fmtMoney(null)).toBe('$0.00');
    expect(fmtMoney('1234.5')).toBe('$1,234.50');
    expect(fmtMoney(-12.5)).toBe('$-12.50');
  });

  it('fmtSignedMoney uses — under half a cent and a real minus sign', () => {
    expect(fmtSignedMoney(0.004)).toBe('—');
    expect(fmtSignedMoney(56.27)).toBe('+$56.27');
    expect(fmtSignedMoney(-36)).toBe('−$36.00');
  });

  it('fmtQty / fmtNum', () => {
    expect([fmtQty(''), fmtQty(null), fmtQty('x'), fmtQty(912), fmtQty(927.03)]).toEqual(['', '', '', '912.00', '927.03']);
    expect([fmtNum(912), fmtNum(1234.5), fmtNum(19.333)]).toEqual(['912', '1,234.5', '19.33']);
  });

  it('document numbers pad to 3 digits', () => {
    expect([formatDocNumber('WO-', 7), formatDocNumber('IN-', 325), formatDocNumber('PO-', 1193)]).toEqual(['WO-007', 'IN-325', 'PO-1193']);
    expect(docNumberSuffix('QT-330')).toBe(330);
    expect(Number.isNaN(docNumberSuffix('QT-'))).toBe(true);
  });
});

describe('dates', () => {
  it('addDays rolls months and years', () => {
    expect(addDays('2026-10-14', 1)).toBe('2026-10-15');
    expect(addDays('2026-10-14', 30)).toBe('2026-11-13');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('nope', 1)).toBe('');
  });

  it('daysBetween on date-only strings is exact', () => {
    expect(daysBetween('2026-10-06', '2026-10-14')).toBe(8);
    expect(daysBetween('2026-10-14', '2026-10-14')).toBe(0);
    expect(daysBetween('2026-10-15', '2026-10-14')).toBe(-1);
  });

  it('fmtDate matches en-US toLocaleDateString for date-only input', () => {
    for (const iso of ['2026-10-16', '2026-01-01', '2027-02-28', '2026-12-31', '2026-07-04']) {
      const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
      const viaLocale = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      expect(fmtDate(iso)).toBe(viaLocale);
    }
    expect(fmtDate('2026-10-16')).toBe('Oct 16, 2026');
    expect(fmtDate('')).toBe('—');
    expect(fmtDate(null)).toBe('—');
  });

  it('isoDay formats a local date', () => {
    expect(isoDay(new Date(2026, 9, 14))).toBe('2026-10-14');
  });
});
