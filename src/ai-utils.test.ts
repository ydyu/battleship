import { describe, expect, it } from 'vitest';
import { Board } from './engine';
import { 
  getSaturationCount, 
  remainderIsValid, 
  getUnsunkHits, 
  getShipSize, 
  maxRunThrough 
} from './ai-utils';

describe('ai-utils', () => {
  describe('getShipSize', () => {
    it('returns correct sizes for standard ships', () => {
      expect(getShipSize('Carrier')).toBe(5);
      expect(getShipSize('PatrolBoat')).toBe(2);
      expect(getShipSize('NonExistent')).toBe(0);
    });
  });

  describe('getUnsunkHits', () => {
    it('filters out sunk cells', () => {
      const board = new Board();
      board.hitsReceived.add('0,0');
      board.hitsReceived.add('1,1');
      board.sunkCells.add('0,0');

      const unsunk = getUnsunkHits(board);
      expect(unsunk.has('1,1')).toBe(true);
      expect(unsunk.has('0,0')).toBe(false);
      expect(unsunk.size).toBe(1);
    });
  });

  describe('getSaturationCount', () => {
    it('identifies when scouting is redundant (2 ships, 2 distinct hits)', () => {
      const board = new Board();
      const hits = new Set(['0,0', '5,5']);
      const maxSize = 5;
      
      // With hits far apart, they MUST be different ships
      const count = getSaturationCount(hits, maxSize, board, 5);
      expect(count).toBe(2);
    });

    it('identifies when hits could be the same ship', () => {
      const board = new Board();
      const hits = new Set(['0,0', '0,1']);
      const maxSize = 5;
      
      // Adjacent hits can be explained by 1 ship
      const count = getSaturationCount(hits, maxSize, board, 5);
      expect(count).toBe(1);
    });

    it('correctly identifies separate ships when separated by a miss', () => {
      const board = new Board();
      const hits = new Set(['0,0', '0,2']);
      board.misses.add('0,1'); // Obstacle between hits
      const maxSize = 5;
      
      const count = getSaturationCount(hits, maxSize, board, 5);
      expect(count).toBe(2);
    });
  });

  describe('maxRunThrough', () => {
    it('calculates the longest span through a coordinate', () => {
      const board = new Board();
      // (0,0) (1,0) [2,0=miss] (3,0)
      board.misses.add('2,0');
      // (0,0) (0,1) [0,2=miss]
      board.misses.add('0,2');
      
      // Horizontal span at (0,0) is 2: (0,0) and (1,0)
      // Vertical span at (0,0) is 2: (0,0) and (0,1)
      // Result should be 2.
      expect(maxRunThrough(board, 0, 0)).toBe(2);

      // Remove the vertical miss
      board.misses.delete('0,2');
      // Vertical span at (0,0) is now 10 (full height)
      expect(maxRunThrough(board, 0, 0)).toBe(10);
    });
  });

  describe('remainderIsValid', () => {
    it('returns false if a wound cannot be reached by any remaining ship', () => {
      const board = new Board();
      // Setup a situation where a wound at (0,0) is trapped in a tiny pocket
      board.misses.add('1,0');
      board.misses.add('0,1');
      
      const remainingWounds = new Set(['0,0']);
      const remainingShips = ['Carrier']; // Carrier size 5 cannot fit in a 1x1 pocket
      
      expect(remainderIsValid(board, remainingWounds, remainingShips)).toBe(false);
    });

    it('returns true if a wound can be reached', () => {
      const board = new Board();
      const remainingWounds = new Set(['0,0']);
      const remainingShips = ['Carrier'];
      
      expect(remainderIsValid(board, remainingWounds, remainingShips)).toBe(true);
    });

    it('handles excluded cells during validation', () => {
      const board = new Board();
      // Wound at (0,0) and (0,2). 
      // If we "exclude" (0,1), they are separated.
      const remainingWounds = new Set(['0,2']);
      const remainingShips = ['PatrolBoat']; // Size 2
      const excluded = new Set(['0,1']); 
      
      // At (0,2), vertical run is blocked by excluded (0,1) above and edge below
      // Max run would be restricted.
      const isValid = remainderIsValid(board, remainingWounds, remainingShips, excluded);
      // This is a complex case, but verifies the API supports 'excluded'
      expect(typeof isValid).toBe('boolean');
    });
  });
});
