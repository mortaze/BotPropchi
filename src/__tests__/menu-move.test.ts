import { describe, it, expect, beforeEach } from 'vitest';

type Button = {
  id?: string;
  ref?: string;
  text?: string;
  visible?: boolean;
};

type Layout = Button[][];

function cloneLayout(l: Layout): Layout {
  return l.map(row => row.map(btn => ({ ...btn })));
}

function ensureButtonIds(layout: Layout): Layout {
  let nextId = 1;
  // First collect existing IDs to find max
  for (const row of layout) {
    for (const btn of row) {
      const num = Number(btn.id?.replace('btn_', ''));
      if (num >= nextId) nextId = num + 1;
    }
  }
  return layout.map(row =>
    row.map(btn => {
      if (!btn.id) {
        btn.id = `btn_${nextId++}`;
      }
      return btn;
    })
  );
}

function swapLeft(layout: Layout, rowIndex: number, colIndex: number): Layout {
  const updated = cloneLayout(layout);
  const row = updated[rowIndex];
  if (!row || colIndex <= 0) return updated;
  [row[colIndex - 1], row[colIndex]] = [row[colIndex], row[colIndex - 1]];
  return updated;
}

function swapRight(layout: Layout, rowIndex: number, colIndex: number): Layout {
  const updated = cloneLayout(layout);
  const row = updated[rowIndex];
  if (!row || colIndex >= row.length - 1) return updated;
  [row[colIndex], row[colIndex + 1]] = [row[colIndex + 1], row[colIndex]];
  return updated;
}

function moveUp(layout: Layout, rowIndex: number, colIndex: number): { layout: Layout; moved: boolean } {
  if (rowIndex <= 0) return { layout, moved: false };
  const updated = cloneLayout(layout);
  const [button] = updated[rowIndex].splice(colIndex, 1);
  if (!button) return { layout, moved: false };
  updated[rowIndex - 1].push(button);
  return { layout: updated, moved: true };
}

function moveDown(layout: Layout, rowIndex: number, colIndex: number): { layout: Layout; moved: boolean } {
  const updated = cloneLayout(layout);
  const [button] = updated[rowIndex].splice(colIndex, 1);
  if (!button) return { layout, moved: false };
  const targetRow = rowIndex + 1;
  if (targetRow >= updated.length) {
    updated.push([]);
  }
  updated[targetRow].push(button);
  return { layout: updated, moved: true };
}

describe('Menu button movement (no DB)', () => {
  let layout: Layout;

  beforeEach(() => {
    layout = ensureButtonIds([
      [
        { ref: 'post1', text: 'First Post', visible: true },
        { ref: 'post2', text: 'Second Post', visible: true },
      ],
      [
        { ref: 'post3', text: 'Third Post', visible: false },
      ],
    ]);
  });

  // ─── moveDown ───
  it('moveDown: moves button to next row', () => {
    const result = moveDown(layout, 0, 0);
    expect(result.moved).toBe(true);
    expect(result.layout[0].length).toBe(1);
    expect(result.layout[1].length).toBe(2);
    expect(result.layout[1][1].ref).toBe('post1');
  });

  it('moveDown: creates new empty row when button is in last row', () => {
    const result = moveDown(layout, 1, 0);
    expect(result.moved).toBe(true);
    expect(result.layout.length).toBe(3);
    expect(result.layout[1].length).toBe(0);
    expect(result.layout[2].length).toBe(1);
    expect(result.layout[2][0].ref).toBe('post3');
  });

  it('moveDown: no duplicate button after move', () => {
    const result = moveDown(layout, 0, 0);
    const allRefs = result.layout.flat().map(b => b.ref);
    const refCounts = allRefs.reduce<Record<string, number>>((acc, r) => {
      if (r) acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {});
    expect(refCounts['post1']).toBe(1);
  });

  // ─── moveUp ───
  it('moveUp: moves button to previous row', () => {
    const result = moveUp(layout, 1, 0);
    expect(result.moved).toBe(true);
    expect(result.layout[0].length).toBe(3);
    expect(result.layout[1].length).toBe(0);
    expect(result.layout[0][2].ref).toBe('post3');
  });

  it('moveUp: does nothing when button is in first row', () => {
    const result = moveUp(layout, 0, 0);
    expect(result.moved).toBe(false);
  });

  // ─── swapLeft ───
  it('swapLeft: exchanges button with left neighbor', () => {
    const swapped = swapLeft(layout, 0, 1);
    expect(swapped[0][0].ref).toBe('post2');
    expect(swapped[0][1].ref).toBe('post1');
  });

  it('swapLeft: does nothing at column 0', () => {
    const swapped = swapLeft(layout, 0, 0);
    expect(swapped[0][0].ref).toBe('post1');
  });

  // ─── swapRight ───
  it('swapRight: exchanges button with right neighbor', () => {
    const swapped = swapRight(layout, 0, 0);
    expect(swapped[0][0].ref).toBe('post2');
    expect(swapped[0][1].ref).toBe('post1');
  });

  it('swapRight: does nothing at last column', () => {
    const swapped = swapRight(layout, 0, 1);
    expect(swapped[0][0].ref).toBe('post1');
    expect(swapped[0][1].ref).toBe('post2');
  });

  // ─── ensureButtonIds ───
  it('ensureButtonIds: assigns stable IDs to buttons missing them', () => {
    const noIds: Layout = [[{ ref: 'a', text: 'A', visible: true }]];
    const withIds = ensureButtonIds(noIds);
    expect(withIds[0][0].id).toBeTruthy();
    expect(withIds[0][0].id).toMatch(/^btn_\d+$/);
  });

  it('ensureButtonIds: preserves existing IDs', () => {
    const layoutWithIds: Layout = [[{ id: 'btn_42', ref: 'a', text: 'A', visible: true }]];
    const result = ensureButtonIds(layoutWithIds);
    expect(result[0][0].id).toBe('btn_42');
  });

  // ─── Normalize: no undefined in any row ───
  function normalizeLayout(layout: Layout): Layout {
    return layout
      .map(row => Array.isArray(row) ? row.filter(btn => btn != null) : [])
      .filter(row => row.length > 0);
  }

  it('normalizeLayout: removes undefined from rows', () => {
    const dirty: Layout = [[undefined as any, { ref: 'a', text: 'A' }, undefined as any]];
    const clean = normalizeLayout(dirty);
    expect(clean.length).toBe(1);
    expect(clean[0].length).toBe(1);
    expect(clean[0][0].ref).toBe('a');
    expect(clean[0].every(b => b !== undefined)).toBe(true);
  });

  it('normalizeLayout: removes null from rows', () => {
    const dirty: Layout = [[null as any, { ref: 'a', text: 'A' }]];
    const clean = normalizeLayout(dirty);
    expect(clean[0].length).toBe(1);
    expect(clean[0][0].ref).toBe('a');
  });

  it('normalizeLayout: removes empty rows', () => {
    const dirty: Layout = [[], [{ ref: 'a', text: 'A' }], []];
    const clean = normalizeLayout(dirty);
    expect(clean.length).toBe(1);
    expect(clean[0][0].ref).toBe('a');
  });

  it('normalizeLayout: handles top-level undefined rows', () => {
    const dirty: Layout = [undefined as any, [{ ref: 'a', text: 'A' }], undefined as any];
    const clean = normalizeLayout(dirty);
    expect(clean.length).toBe(1);
    expect(clean[0][0].ref).toBe('a');
  });

  it('normalizeLayout: handles completely empty layout', () => {
    expect(normalizeLayout([])).toEqual([]);
    expect(normalizeLayout([[], []])).toEqual([]);
    expect(normalizeLayout([undefined as any])).toEqual([]);
  });

  it('normalizeLayout: preserves valid dense layout', () => {
    const layout = ensureButtonIds([
      [{ ref: 'a', text: 'A' }, { ref: 'b', text: 'B' }],
      [{ ref: 'c', text: 'C' }],
    ]);
    const clean = normalizeLayout(layout);
    expect(clean.length).toBe(2);
    expect(clean[0].length).toBe(2);
    expect(clean[1].length).toBe(1);
    expect(clean.flat().every(b => b !== undefined && b !== null)).toBe(true);
  });

  // ─── JSON serialization: no undefined ───
  it('JSON.stringify layout contains no undefined', () => {
    const layout = ensureButtonIds([
      [{ ref: 'a', text: 'A' }, { ref: 'b', text: 'B' }],
    ]);
    const json = JSON.stringify(layout);
    expect(json).not.toContain('undefined');
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].length).toBe(2);
  });

  // ─── moveDown: no undefined in result ───
  it('moveDown: no undefined values in result', () => {
    const result = moveDown(layout, 0, 0);
    expect(result.moved).toBe(true);
    const allRows = result.layout.flat();
    expect(allRows.every(b => b !== undefined && b !== null)).toBe(true);
  });

  // ─── moveUp: no undefined in result ───
  it('moveUp: no undefined values in result', () => {
    const result = moveUp(layout, 1, 0);
    expect(result.moved).toBe(true);
    const allRows = result.layout.flat();
    expect(allRows.every(b => b !== undefined && b !== null)).toBe(true);
  });

  // ─── swapLeft: no undefined ───
  it('swapLeft: no undefined values in result', () => {
    const swapped = swapLeft(layout, 0, 1);
    const allRows = swapped.flat();
    expect(allRows.every(b => b !== undefined && b !== null)).toBe(true);
  });

  // ─── swapRight: no undefined ───
  it('swapRight: no undefined values in result', () => {
    const swapped = swapRight(layout, 0, 0);
    const allRows = swapped.flat();
    expect(allRows.every(b => b !== undefined && b !== null)).toBe(true);
  });

  // ─── Single button row: moveRight should no-op ───
  it('swapRight: single button row stays unchanged with no undefined', () => {
    const single: Layout = ensureButtonIds([[{ ref: 'a', text: 'A' }]]);
    const swapped = swapRight(single, 0, 0);
    expect(swapped[0].length).toBe(1);
    expect(swapped[0][0].ref).toBe('a');
    expect(swapped.flat().every(b => b !== undefined)).toBe(true);
  });

  it('swapLeft: single button row stays unchanged with no undefined', () => {
    const single: Layout = ensureButtonIds([[{ ref: 'a', text: 'A' }]]);
    const swapped = swapLeft(single, 0, 0);
    expect(swapped[0].length).toBe(1);
    expect(swapped[0][0].ref).toBe('a');
    expect(swapped.flat().every(b => b !== undefined)).toBe(true);
  });

  // ─── moveDown: preserve all buttons, no duplicate ───
  it('moveDown: preserves all buttons with no undefined', () => {
    const threeRows: Layout = ensureButtonIds([
      [{ ref: 'a', text: 'A' }, { ref: 'b', text: 'B' }],
      [{ ref: 'c', text: 'C' }],
      [{ ref: 'd', text: 'D' }],
    ]);
    const result = moveDown(threeRows, 0, 0);
    expect(result.moved).toBe(true);
    const allRefs = result.layout.flat().map(b => b?.ref).filter(Boolean);
    expect(allRefs).toContain('a');
    expect(allRefs).toContain('b');
    expect(allRefs).toContain('c');
    expect(allRefs).toContain('d');
    expect(allRefs.length).toBe(4);
    expect(result.layout.flat().every(b => b !== undefined && b !== null)).toBe(true);
  });

  // ─── moveUp: preserve all buttons ───
  it('moveUp: preserves all buttons with no undefined', () => {
    const result = moveUp(layout, 1, 0);
    expect(result.moved).toBe(true);
    const allRefs = result.layout.flat().map(b => b?.ref).filter(Boolean);
    expect(allRefs).toContain('post1');
    expect(allRefs).toContain('post2');
    expect(allRefs).toContain('post3');
    expect(allRefs.length).toBe(3);
    expect(result.layout.flat().every(b => b !== undefined && b !== null)).toBe(true);
  });

  // ─── Every row is an actual array ───
  it('every row is an array after any movement', () => {
    const ops = [
      () => moveDown(layout, 0, 0).layout,
      () => moveUp(layout, 1, 0).layout,
      () => swapLeft(layout, 0, 1),
      () => swapRight(layout, 0, 0),
    ];
    for (const op of ops) {
      const result = op();
      expect(Array.isArray(result)).toBe(true);
      for (const row of result) {
        expect(Array.isArray(row)).toBe(true);
      }
    }
  });
});
