import { describe, it, expect } from 'vitest';

type Btn = { text: string; type?: string; value?: string; style?: string };
type Grid = Btn[][];

function clone(g: Grid): Grid {
  return JSON.parse(JSON.stringify(g));
}

function gridText(g: Grid): string {
  return g.map((row, r) => `Row${r + 1}: ${row.map(b => b.text).join(' ')}`).join('\n');
}

function moveDown(grid: Grid, row: number, col: number): { grid: Grid; newRow: number; newCol: number } {
  const g = clone(grid);
  const btn = g[row][col];
  const wasSingleton = g[row].length === 1;

  g[row].splice(col, 1);
  if (g[row].length === 0) g.splice(row, 1);

  let newRow = row;
  let newCol = col;

  if (!wasSingleton) {
    g.splice(row + 1, 0, [btn]);
    newRow = row + 1;
    newCol = 0;
  } else {
    if (row < g.length) {
      g[row].push(btn);
      newRow = row;
      newCol = g[row].length - 1;
    } else {
      g.push([btn]);
      newRow = g.length - 1;
      newCol = 0;
    }
  }

  return { grid: g, newRow, newCol };
}

function moveUp(grid: Grid, row: number, col: number): { grid: Grid; newRow: number; newCol: number } {
  const g = clone(grid);
  const btn = g[row][col];
  const wasSingleton = g[row].length === 1;

  g[row].splice(col, 1);
  if (g[row].length === 0) g.splice(row, 1);

  let newRow = row;
  let newCol = col;

  if (!wasSingleton) {
    g.splice(row, 0, [btn]);
    newRow = row;
    newCol = 0;
  } else {
    if (row > 0) {
      g[row - 1].unshift(btn);
      newRow = row - 1;
      newCol = 0;
    } else {
      g.unshift([btn]);
      newRow = 0;
      newCol = 0;
    }
  }

  return { grid: g, newRow, newCol };
}

function moveLeft(grid: Grid, row: number, col: number): { grid: Grid; newRow: number; newCol: number } | null {
  if (col <= 0) return null;
  const g = clone(grid);
  [g[row][col - 1], g[row][col]] = [g[row][col], g[row][col - 1]];
  return { grid: g, newRow: row, newCol: col - 1 };
}

function moveRight(grid: Grid, row: number, col: number): { grid: Grid; newRow: number; newCol: number } | null {
  if (col >= grid[row].length - 1) return null;
  const g = clone(grid);
  [g[row][col], g[row][col + 1]] = [g[row][col + 1], g[row][col]];
  return { grid: g, newRow: row, newCol: col + 1 };
}

const B = (text: string): Btn => ({ text });

describe('Button Editor Move Mode', () => {
  describe('down — non-singleton row creates singleton row below', () => {
    it('Example 1: row [1,2,3] → button 2 goes down', () => {
      const g: Grid = [[B('1'), B('2'), B('3')], [B('5'), B('6')]];
      const r = moveDown(g, 0, 1);
      expect(gridText(r.grid)).toBe('Row1: 1 3\nRow2: 2\nRow3: 5 6');
      expect(r.newRow).toBe(1);
      expect(r.newCol).toBe(0);
    });

    it('second ⬇️ on button 2 from Row2 singleton → appends to Row3', () => {
      let g: Grid = [[B('1'), B('2'), B('3')], [B('5'), B('6')]];
      let r = moveDown(g, 0, 1);
      expect(gridText(r.grid)).toBe('Row1: 1 3\nRow2: 2\nRow3: 5 6');

      r = moveDown(r.grid, 1, 0);
      expect(gridText(r.grid)).toBe('Row1: 1 3\nRow2: 5 6 2');
      expect(r.newRow).toBe(1);
      expect(r.newCol).toBe(2);
    });
  });

  describe('up — non-singleton row creates singleton row above', () => {
    it('Example 2: button 2 at Row2 singleton goes up → appends to Row2 with Row3', () => {
      const g: Grid = [[B('1'), B('3')], [B('2')], [B('5'), B('6')]];
      const r = moveUp(g, 1, 0);
      expect(gridText(r.grid)).toBe('Row1: 1 3\nRow2: 2 5 6');
      expect(r.newRow).toBe(1);
      expect(r.newCol).toBe(0);
    });

    it('second ⬆️ from merged row → button 2 creates singleton at row 1', () => {
      let g: Grid = [[B('1'), B('3')], [B('2')], [B('5'), B('6')]];
      let r = moveUp(g, 1, 0);
      expect(gridText(r.grid)).toBe('Row1: 1 3\nRow2: 2 5 6');

      r = moveUp(r.grid, 1, 0);
      expect(gridText(r.grid)).toBe('Row1: 1 3\nRow2: 2\nRow3: 5 6');
      expect(r.newRow).toBe(1);
      expect(r.newCol).toBe(0);
    });

    it('third ⬆️ merges singleton back into Row1', () => {
      let g: Grid = [[B('1'), B('3')], [B('2')], [B('5'), B('6')]];
      let r = moveUp(g, 1, 0);
      r = moveUp(r.grid, 1, 0);
      r = moveUp(r.grid, 1, 0);
      expect(gridText(r.grid)).toBe('Row1: 1 2 3\nRow2: 5 6');
      expect(r.newRow).toBe(0);
      expect(r.newCol).toBe(1);
    });
  });

  describe('left/right — horizontal swap', () => {
    it('swaps left within a row', () => {
      const g: Grid = [[B('1'), B('2'), B('3')]];
      const r = moveLeft(g, 0, 1);
      expect(r).not.toBeNull();
      expect(gridText(r!.grid)).toBe('Row1: 1 2 3');
      expect(r!.newCol).toBe(0);
    });

    it('swaps right within a row', () => {
      const g: Grid = [[B('1'), B('2'), B('3')]];
      const r = moveRight(g, 0, 1);
      expect(r).not.toBeNull();
      expect(gridText(r!.grid)).toBe('Row1: 1 2 3');
      expect(r!.newCol).toBe(2);
    });

    it('left on first column returns null (no-op)', () => {
      const g: Grid = [[B('1'), B('2')]];
      expect(moveLeft(g, 0, 0)).toBeNull();
    });

    it('right on last column returns null (no-op)', () => {
      const g: Grid = [[B('1'), B('2')]];
      expect(moveRight(g, 0, 1)).toBeNull();
    });
  });

  describe('edge cases — first/last row vertical movement', () => {
    it('down from last row with singleton creates new row', () => {
      const g: Grid = [[B('1'), B('2')], [B('3')]];
      const r = moveDown(g, 1, 0);
      expect(gridText(r.grid)).toBe('Row1: 1 2\nRow2: 3');
      expect(r.newRow).toBe(1);
      expect(r.newCol).toBe(0);
    });

    it('down from last row non-singleton creates new row below', () => {
      const g: Grid = [[B('1'), B('2')], [B('3'), B('4')]];
      const r = moveDown(g, 1, 0);
      expect(gridText(r.grid)).toBe('Row1: 1 2\nRow2: 4\nRow3: 3');
      expect(r.newRow).toBe(2);
      expect(r.newCol).toBe(0);
    });

    it('up from first row singleton creates new row at top', () => {
      const g: Grid = [[B('1')], [B('2'), B('3')]];
      const r = moveUp(g, 0, 0);
      expect(gridText(r.grid)).toBe('Row1: 1\nRow2: 2 3');
      expect(r.newRow).toBe(0);
      expect(r.newCol).toBe(0);
    });

    it('up from first row non-singleton creates singleton at row 0', () => {
      const g: Grid = [[B('1'), B('2'), B('3')]];
      const r = moveUp(g, 0, 1);
      expect(gridText(r.grid)).toBe('Row1: 2\nRow2: 1 3');
      expect(r.newRow).toBe(0);
      expect(r.newCol).toBe(0);
    });
  });

  describe('empty row cleanup — row becomes empty after splice', () => {
    it('down from 2-row layout where singleton row removed', () => {
      const g: Grid = [[B('1')], [B('2')]];
      const r = moveDown(g, 0, 0);
      expect(gridText(r.grid)).toBe('Row1: 1 2');
      expect(r.newRow).toBe(0);
      expect(r.newCol).toBe(1);
    });

    it('up from last singleton row merges into previous', () => {
      const g: Grid = [[B('1'), B('2')], [B('3')]];
      const r = moveUp(g, 1, 0);
      expect(gridText(r.grid)).toBe('Row1: 3 1 2');
      expect(r.newRow).toBe(0);
      expect(r.newCol).toBe(0);
    });
  });

  describe('multi-step sequences', () => {
    it('sequential down moves on different buttons', () => {
      let g: Grid = [[B('A'), B('B'), B('C')]];
      let r = moveDown(g, 0, 1);
      expect(gridText(r.grid)).toBe('Row1: A C\nRow2: B');

      r = moveDown(r.grid, 0, 0);
      expect(gridText(r.grid)).toBe('Row1: C\nRow2: A\nRow3: B');
    });

    it('down then up returns to original', () => {
      const orig: Grid = [[B('1'), B('2'), B('3')], [B('5'), B('6')]];
      let r = moveDown(clone(orig) as any, 0, 1);
      r = moveUp(r.grid, 1, 0);
      expect(gridText(r.grid)).toBe('Row1: 1 3\nRow2: 2 5 6');

      r = moveUp(r.grid, 1, 0);
      expect(gridText(r.grid)).toBe('Row1: 1 3\nRow2: 2\nRow3: 5 6');

      r = moveUp(r.grid, 1, 0);
      expect(gridText(r.grid)).toBe('Row1: 1 2 3\nRow2: 5 6');
    });

    it('zigzag down-up-down', () => {
      let g: Grid = [[B('1'), B('2'), B('3')]];
      let r = moveDown(g, 0, 1);
      expect(gridText(r.grid)).toBe('Row1: 1 3\nRow2: 2');

      r = moveUp(r.grid, 1, 0);
      expect(gridText(r.grid)).toBe('Row1: 1 2 3');

      r = moveDown(r.grid, 0, 1);
      expect(gridText(r.grid)).toBe('Row1: 1 3\nRow2: 2');
    });
  });

  describe('left-right across multi-row grid', () => {
    it('swap right on button 1 in row [1,2,3]', () => {
      const g: Grid = [[B('1'), B('2'), B('3')]];
      const r = moveRight(g, 0, 0);
      expect(r).not.toBeNull();
      expect(gridText(r!.grid)).toBe('Row1: 1 2 3');
      expect(r!.newCol).toBe(1);
    });

    it('swap left on button 3 in row [1,2,3]', () => {
      const g: Grid = [[B('1'), B('2'), B('3')]];
      const r = moveLeft(g, 0, 2);
      expect(r).not.toBeNull();
      expect(gridText(r!.grid)).toBe('Row1: 1 2 3');
      expect(r!.newCol).toBe(1);
    });
  });
});
