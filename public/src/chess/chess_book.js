// public/src/chess/chess_book.js
// Curated Grandmaster Opening Book with 1,200+ Positions covering ECO Volumes A-E
// Fully conforms to Specifications 174-179 of CHESS_200_SPEC_PLAN.md.

import { ChessEngine } from './chess_engine.js';
import { ChessZobrist } from './chess_zobrist.js';

export class ChessBook {
  constructor() {
    this.fenTable = new Map();     // canonical FEN -> Array<{ from, to, promotion, san, weight, eco, name }>
    this.zobristTable = new Map(); // BigInt hash -> Array<{ from, to, promotion, san, weight, eco, name }>
    this.infoTable = new Map();    // canonical FEN -> { eco, name }
    this.initBook();
  }

  /**
   * Returns total count of distinct grandmaster positions in book
   */
  get size() {
    return this.fenTable.size;
  }

  /**
   * Initializes opening lines and compiles into FEN and Zobrist lookup tables
   */
  initBook() {
    const rawLines = [
      // =========================================================================
      // VOLUME A: FLANK OPENINGS, RETI, ENGLISH, BENONI, DUTCH
      // =========================================================================
      // English Opening (A10 - A39)
      { eco: "A10", name: "English Opening", weight: 50, moves: ["c2c4"] },
      { eco: "A15", name: "English: Anglo-Indian", weight: 45, moves: ["c2c4", "g8f6", "g1f3", "e7e6", "g2g3", "d7d5", "f1g2", "f8e7", "e1g1", "e8g8", "b2b3", "c7c5", "c1b2", "b8c6"] },
      { eco: "A16", name: "English: Anglo-Indian, King's Indian Setup", weight: 40, moves: ["c2c4", "g8f6", "b1c3", "g7g6", "g2g3", "f8g7", "f1g2", "e8g8", "g1f3", "d7d6", "e1g1", "e7e5", "d2d3", "b8c6", "a1b1", "a7a5"] },
      { eco: "A20", name: "English: King's English", weight: 55, moves: ["c2c4", "e7e5", "g2g3", "g8f6", "f1g2", "d7d5", "c4d5", "f6d5", "b1c3", "d5b6", "g1f3", "b8c6", "e1g1", "f8e7", "a2a3", "e8g8", "b2b4", "c8e6"] },
      { eco: "A21", name: "English: Reversed Sicilian", weight: 45, moves: ["c2c4", "e7e5", "b1c3", "d7d6", "g2g3", "g7g6", "f1g2", "f8g7", "e2e3", "f7f5", "g1e2", "g8f6", "d2d3", "e8g8", "e1g1", "c7c6", "a1b1", "a7a5"] },
      { eco: "A22", name: "English: Bremen System", weight: 45, moves: ["c2c4", "e7e5", "b1c3", "g8f6", "g2g3", "f8b4", "f1g2", "e8g8", "e2e4", "b4c3", "b2c3", "c7c6", "g1e2", "d7d5", "c4d5", "c6d5", "e4d5", "f6d5"] },
      { eco: "A25", name: "English: Closed System", weight: 50, moves: ["c2c4", "e7e5", "b1c3", "b8c6", "g2g3", "g7g6", "f1g2", "f8g7", "d2d3", "d7d6", "e2e4", "f7f5", "g1e2", "g8f6", "e1g1", "e8g8", "c3d5", "c8e6"] },
      { eco: "A28", name: "English: Four Knights System", weight: 50, moves: ["c2c4", "e7e5", "b1c3", "g8f6", "g1f3", "b8c6", "e2e3", "f8b4", "d1c2", "e8g8", "c3d5", "f8e8", "c2f5", "d7d6", "d5f6", "g7f6", "f5h5", "e5e4"] },
      { eco: "A29", name: "English: Four Knights, Kingside Fianchetto", weight: 45, moves: ["c2c4", "e7e5", "b1c3", "g8f6", "g1f3", "b8c6", "g2g3", "f8b4", "f1g2", "e8g8", "e1g1", "e5e4", "f3g5", "b4c3", "b2c3", "f8e8", "f2f3", "e4f3", "g5f3", "d7d5"] },
      { eco: "A30", name: "English: Symmetrical Variation", weight: 55, moves: ["c2c4", "c7c5", "g1f3", "g8f6", "g2g3", "b7b6", "f1g2", "c8b7", "e1g1", "e7e6", "b1c3", "f8e7", "d2d4", "c5d4", "d1d4", "d7d6", "f1d1", "a7a6", "b2b3", "b8d7"] },
      { eco: "A34", name: "English: Symmetrical, Three Knights", weight: 45, moves: ["c2c4", "c7c5", "b1c3", "g8f6", "g1f3", "d7d5", "c4d5", "f6d5", "e2e4", "d5b4", "f1c4", "b4d3", "e1e2", "d3f4", "e2f1", "f4e6", "b2b4", "c5b4"] },
      { eco: "A35", name: "English: Symmetrical, Four Knights", weight: 45, moves: ["c2c4", "c7c5", "b1c3", "b8c6", "g1f3", "g8f6", "d2d4", "c5d4", "f3d4", "e7e6", "a2a3", "f8c5", "d4b3", "c5e7", "e2e4", "e8g8", "f1e2", "b7b6", "e1g1", "c8b7"] },
      { eco: "A36", name: "English: Symmetrical, Ultra-Fianchetto", weight: 40, moves: ["c2c4", "c7c5", "g2g3", "g7g6", "f1g2", "f8g7", "b1c3", "b8c6", "a2a3", "e7e6", "b2b4", "c5b4", "a3b4", "c6b4", "c1a3", "b4c6", "c3b5", "g7e5", "g1f3", "e5b8"] },

      // Réti Opening (A04 - A09)
      { eco: "A04", name: "Réti Opening", weight: 45, moves: ["g1f3", "d7d5", "c2c4", "c7c6", "b2b3", "g8f6", "c1b2", "c8f5", "g2g3", "e7e6", "f1g2", "b8d7", "e1g1", "f8d6", "d2d3", "e8g8", "b1d2", "h7h6", "a1c1", "a7a5"] },
      { eco: "A05", name: "Réti: King's Indian Attack", weight: 50, moves: ["g1f3", "g8f6", "g2g3", "g7g6", "f1g2", "f8g7", "e1g1", "e8g8", "d2d3", "d7d6", "e2e4", "e7e5", "b1d2", "b8c6", "c2c3", "a7a5", "a2a4", "h7h6", "d2c4", "c8e6"] },
      { eco: "A06", name: "Réti: Old Indian Setup", weight: 40, moves: ["g1f3", "d7d5", "b2b3", "c8g4", "c1b2", "b8d7", "g2g3", "g4f3", "e2f3", "e7e6", "f1g2", "g8f6", "e1g1", "f8e7", "f3f4", "e8g8", "d2d3", "a7a5", "a2a4", "c7c6"] },
      { eco: "A07", name: "King's Indian Attack: Yugoslav", weight: 45, moves: ["g1f3", "d7d5", "g2g3", "g8f6", "f1g2", "c7c6", "e1g1", "c8g4", "d2d3", "b8d7", "b1d2", "e7e5", "e2e4", "f8d6", "h2h3", "g4h5", "d1e1", "e8g8", "f3h4", "f8e8"] },
      { eco: "A09", name: "Réti: Advance Variation", weight: 40, moves: ["g1f3", "d7d5", "c2c4", "d5d4", "b2b4", "f7f6", "e2e3", "e7e5", "c4c5", "a7a5", "f1c4", "a5b4", "d1b3", "g8h6", "e3d4", "e5e4", "e1g1", "e4f3", "f1e1", "f8e7"] },

      // Bird's Opening & Larsen (A01 - A03)
      { eco: "A01", name: "Nimzowitsch-Larsen Attack", weight: 35, moves: ["b2b3", "e7e5", "c1b2", "b8c6", "e2e3", "g8f6", "f1b5", "f8d6", "g1e2", "e8g8", "e1g1", "a7a6", "b5c6", "d7c6", "f2f4", "e5f4", "e2f4", "f6g4", "d1e1", "d8g5"] },
      { eco: "A02", name: "Bird's Opening", weight: 30, moves: ["f2f4", "d7d5", "g1f3", "g8f6", "e2e3", "g7g6", "b2b3", "f8g7", "c1b2", "e8g8", "f1e2", "c7c5", "e1g1", "b8c6", "f3e5", "c6e5", "b2e5", "b7b6", "e2f3", "c8b7"] },
      { eco: "A03", name: "Bird's Opening: From's Gambit", weight: 30, moves: ["f2f4", "e7e5", "f4e5", "d7d6", "e5d6", "f8d6", "g1f3", "g8f6", "d2d4", "f6g4", "d1d3", "b8c6", "c2c3", "e8g8", "e2e4", "f8e8", "f1e2", "d8e7", "e4e5", "d6e5", "d4e5", "c6e5"] },

      // Benko Gambit & Benoni (A56 - A79)
      { eco: "A56", name: "Benoni Defense", weight: 40, moves: ["d2d4", "g8f6", "c2c4", "c7c5", "d4d5", "e7e5", "b1c3", "d7d6", "e2e4", "f8e7", "g1f3", "e8g8", "f1e2", "b8d7", "e1g1", "f6e8", "a1b1", "g7g6", "c1h6", "e8g7"] },
      { eco: "A57", name: "Benko Gambit Half-Accepted", weight: 45, moves: ["d2d4", "g8f6", "c2c4", "c7c5", "d4d5", "b7b5", "c4b5", "a7a6", "b5b6", "e7e6", "b1c3", "f6d5", "c3d5", "e6d5", "d1d5", "b8c6", "g1f3", "a8b8", "e2e4", "f8e7", "f1c4", "e8g8"] },
      { eco: "A58", name: "Benko Gambit Accepted", weight: 50, moves: ["d2d4", "g8f6", "c2c4", "c7c5", "d4d5", "b7b5", "c4b5", "a7a6", "b5a6", "g7g6", "b1c3", "c8a6", "g1f3", "f8g7", "g2g3", "d7d6", "f1g2", "b8d7", "e1g1", "e8g8", "a1b1", "d8a5", "c1d2", "f8b8"] },
      { eco: "A59", name: "Benko Gambit: Modern King Walk", weight: 45, moves: ["d2d4", "g8f6", "c2c4", "c7c5", "d4d5", "b7b5", "c4b5", "a7a6", "b5a6", "c8a6", "b1c3", "d7d6", "e2e4", "a6f1", "e1f1", "g7g6", "g1f3", "f8g7", "g2g3", "e8g8", "f1g2", "b8d7", "h2h3", "d8a5"] },
      { eco: "A60", name: "Modern Benoni", weight: 45, moves: ["d2d4", "g8f6", "c2c4", "c7c5", "d4d5", "e7e6", "b1c3", "e6d5", "c4d5", "d7d6", "e2e4", "g7g6", "g1f3", "f8g7", "f1e2", "e8g8", "e1g1", "f8e8", "f3d2", "b8d7", "a2a4", "d7e5", "f2f4", "e5g4"] },
      { eco: "A70", name: "Modern Benoni: Classical", weight: 50, moves: ["d2d4", "g8f6", "c2c4", "c7c5", "d4d5", "e7e6", "b1c3", "e6d5", "c4d5", "d7d6", "e2e4", "g7g6", "h2h3", "f8g7", "g1f3", "e8g8", "f1d3", "b7b5", "c3b5", "f8e8", "b5c3", "f6e4", "c3e4", "f7f5"] },

      // Dutch Defense (A80 - A99)
      { eco: "A80", name: "Dutch Defense", weight: 40, moves: ["d2d4", "f7f5"] },
      { eco: "A84", name: "Dutch: Rubinstein", weight: 40, moves: ["d2d4", "f7f5", "c2c4", "g8f6", "b1c3", "e7e6", "g1f3", "d7d5", "c1f4", "c7c6", "e2e3", "f8d6", "f1d3", "e8g8", "e1g1", "d6f4", "e3f4", "f6e4", "a1c1", "b8d7"] },
      { eco: "A85", name: "Dutch with c4 & Nc3", weight: 40, moves: ["d2d4", "f7f5", "c2c4", "g8f6", "b1c3", "d7d6", "g1f3", "g7g6", "g2g3", "f8g7", "f1g2", "e8g8", "e1g1", "c7c6", "d1b3", "g8h8", "f1d1", "b8a6", "b3a3", "a6c7"] },
      { eco: "A87", name: "Dutch: Leningrad, Main Line", weight: 50, moves: ["d2d4", "f7f5", "c2c4", "g8f6", "g2g3", "g7g6", "f1g2", "f8g7", "g1f3", "e8g8", "e1g1", "d7d6", "b1c3", "d8e8", "d4d5", "a7a5", "c1e3", "b8a6", "d1d2", "c8d7", "e3h6", "a6c5"] },
      { eco: "A90", name: "Dutch: Stonewall", weight: 45, moves: ["d2d4", "f7f5", "c2c4", "g8f6", "g2g3", "e7e6", "f1g2", "d7d5", "g1f3", "c7c6", "e1g1", "f8d6", "b2b3", "d8e7", "c1b2", "e8g8", "d1c1", "b7b6", "b2a3", "c8b7", "a3d6", "e7d6"] },

      // =========================================================================
      // VOLUME B: SEMI-OPEN GAMES (SICILIAN, CARO-KANN, SCANDINAVIAN, PIRC)
      // =========================================================================
      // Sicilian Defense (B20 - B99)
      { eco: "B20", name: "Sicilian Defense", weight: 65, moves: ["e2e4", "c7c5"] },
      // Open Sicilian & Najdorf
      { eco: "B90", name: "Sicilian: Najdorf, Adams Attack", weight: 55, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6", "h2h3", "e7e5", "d4e2", "h7h5", "g2g3", "c8e6", "f1g2", "b8d7", "a2a4", "f8e7", "e1g1", "a8c8"] },
      { eco: "B90", name: "Sicilian: Najdorf, English Attack", weight: 60, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6", "c1e3", "e7e5", "d4b3", "c8e6", "f2f3", "f8e7", "d1d2", "e8g8", "e1c1", "b8d7", "g2g4", "b7b5", "g4g5", "b5b4", "c3e2", "f6e8"] },
      { eco: "B92", name: "Sicilian: Najdorf, Classical Opocensky", weight: 55, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6", "f1e2", "e7e5", "d4b3", "f8e7", "e1g1", "e8g8", "c1e3", "c8e6", "d1d2", "b8d7", "a2a4", "a8c8", "f1d1", "d8c7"] },
      { eco: "B95", name: "Sicilian: Najdorf, 6.Bg5 Main Line", weight: 55, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6", "c1g5", "e7e6", "f2f4", "f8e7", "d1f3", "d8c7", "e1c1", "b8d7", "g2g4", "b7b5", "g5f6", "d7f6", "g4g5", "f6d7", "f4f5", "e8g8"] },
      { eco: "B97", name: "Sicilian: Najdorf, Poisoned Pawn", weight: 50, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6", "c1g5", "e7e6", "f2f4", "d8b6", "d1d2", "b6b2", "a1b1", "b2a3", "f4f5", "b8c6", "f5e6", "f7e6", "d4c6", "b7c6", "e4e5", "d6e5"] },

      // Sicilian Dragon
      { eco: "B70", name: "Sicilian: Dragon", weight: 50, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "g7g6"] },
      { eco: "B75", name: "Sicilian: Dragon, Yugoslav Attack with 9.Bc4", weight: 60, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "g7g6", "c1e3", "f8g7", "f2f3", "b8c6", "d1d2", "e8g8", "f1c4", "c8d7", "e1c1", "a8c8", "c4b3", "c6e5", "h2h4", "h7h5", "e3g5", "c8c5"] },
      { eco: "B78", name: "Sicilian: Dragon, Yugoslav Main 9.O-O-O", weight: 55, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "g7g6", "c1e3", "f8g7", "f2f3", "e8g8", "d1d2", "b8c6", "f1c4", "c8d7", "e1c1", "a8c8", "b3b3", "c6e5", "c1b1", "a7a6", "g2g4", "b7b5"] },
      { eco: "B72", name: "Sicilian: Classical Dragon with Be2", weight: 45, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "g7g6", "f1e2", "f8g7", "e1g1", "e8g8", "c1e3", "b8c6", "d4b3", "c8e6", "f2f4", "c6a5", "f4f5", "e6c4", "b3a5", "c4e2"] },

      // Sicilian Classical & Scheveningen
      { eco: "B60", name: "Sicilian: Richter-Rauzer", weight: 50, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "b8c6", "c1g5", "e7e6", "d1d2", "a7a6", "e1c1", "c8d7", "f2f4", "h7h6", "g5h4", "f6e4", "d2e1", "e4f6"] },
      { eco: "B80", name: "Sicilian: Scheveningen, English Attack", weight: 50, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "e7e6", "c1e3", "a7a6", "f2f3", "b7b5", "g2g4", "h7h6", "d1d2", "b8d7", "e1c1", "c8b7", "h2h4", "b5b4", "c3a4", "d6d5"] },
      { eco: "B81", name: "Sicilian: Scheveningen, Keres Attack", weight: 50, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "e7e6", "g2g4", "h7h6", "h2h4", "b8c6", "h1g1", "h6h5", "g4h5", "f6h5", "c1g5", "h5f6", "d1d2", "d8b6", "d4b3", "a7a6"] },

      // Sicilian Sveshnikov & Kalashnikov
      { eco: "B33", name: "Sicilian: Sveshnikov, Positional Line", weight: 60, moves: ["e2e4", "c7c5", "g1f3", "b8c6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "e7e5", "d4b5", "d7d6", "c1g5", "a7a6", "b5a3", "b7b5", "c3d5", "f8e7", "g5f6", "e7f6", "c2c3", "e8g8", "a3c2", "c8b7"] },
      { eco: "B33", name: "Sicilian: Sveshnikov, 9.Bxf6", weight: 55, moves: ["e2e4", "c7c5", "g1f3", "b8c6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "e7e5", "d4b5", "d7d6", "c1g5", "a7a6", "b5a3", "b7b5", "g5f6", "g7f6", "c3d5", "f7f5", "f1d3", "c8e6", "d1h5", "f8g7", "c2c3", "e8g8"] },
      { eco: "B32", name: "Sicilian: Kalashnikov", weight: 45, moves: ["e2e4", "c7c5", "g1f3", "b8c6", "d2d4", "c5d4", "f3d4", "e7e5", "d4b5", "d7d6", "c2c4", "f8e7", "b1c3", "a7a6", "b5a3", "f7f5", "e4f5", "c8f5", "f1d3", "f5e6", "e1g1", "g8f6"] },

      // Sicilian Taimanov & Kan
      { eco: "B46", name: "Sicilian: Taimanov", weight: 50, moves: ["e2e4", "c7c5", "g1f3", "e7e6", "d2d4", "c5d4", "f3d4", "b8c6", "b1c3", "a7a6", "c1e3", "g8f6", "f1d3", "d8c7", "e1g1", "c6e5", "h2h3", "f8c5", "d1e2", "d7d6", "f2f4", "e5d7"] },
      { eco: "B42", name: "Sicilian: Kan, 5.Bd3", weight: 45, moves: ["e2e4", "c7c5", "g1f3", "e7e6", "d2d4", "c5d4", "f3d4", "a7a6", "f1d3", "f8c5", "d4b3", "c5e7", "e1g1", "d7d6", "c2c4", "g8f6", "b1c3", "b7b6", "c1e3", "c8b7", "f2f4", "b8d7"] },

      // Sicilian Anti-Open: Alapin, Closed, Rossolimo, Moscow
      { eco: "B22", name: "Sicilian: Alapin, 2...d5", weight: 50, moves: ["e2e4", "c7c5", "c2c3", "d7d5", "e4d5", "d8d5", "d2d4", "g8f6", "g1f3", "e7e6", "f1e2", "f8e7", "e1g1", "e8g8", "c1e3", "c5d4", "c3d4", "b8c6", "b1c3", "d5d6"] },
      { eco: "B22", name: "Sicilian: Alapin, 2...Nf6", weight: 50, moves: ["e2e4", "c7c5", "c2c3", "g8f6", "e4e5", "f6d5", "d2d4", "c5d4", "g1f3", "b8c6", "f1c4", "d5b6", "c4b3", "d7d5", "e5d6", "d8d6", "e1g1", "c8e6", "b1a3", "e6b3", "a2b3", "e7e6"] },
      { eco: "B23", name: "Sicilian: Closed System", weight: 45, moves: ["e2e4", "c7c5", "b1c3", "b8c6", "g2g3", "g7g6", "f1g2", "f8g7", "d2d3", "d7d6", "c1e3", "e7e5", "d1d2", "g8e7", "g1e2", "c6d4", "e1g1", "e8g8", "f2f4", "c8e6"] },
      { eco: "B30", name: "Sicilian: Rossolimo", weight: 55, moves: ["e2e4", "c7c5", "g1f3", "b8c6", "f1b5", "g7g6", "e1g1", "f8g7", "f1e1", "e7e5", "c2c3", "g8e7", "d2d4", "c5d4", "c3d4", "e5d4", "c1f4", "a7a6", "b5f1", "d7d6"] },
      { eco: "B51", name: "Sicilian: Moscow Variation", weight: 50, moves: ["e2e4", "c7c5", "g1f3", "d7d6", "f1b5", "c8d7", "b5d7", "d8d7", "e1g1", "g8f6", "d1e2", "b8c6", "c2c3", "e7e6", "d2d4", "c5d4", "c3d4", "d6d5", "e4e5", "f6e4"] },

      // Caro-Kann Defense (B10 - B19)
      { eco: "B10", name: "Caro-Kann Defense", weight: 60, moves: ["e2e4", "c7c6"] },
      { eco: "B12", name: "Caro-Kann: Advance Variation", weight: 55, moves: ["e2e4", "c7c6", "d2d4", "d7d5", "e4e5", "c8f5", "g1f3", "e7e6", "f1e2", "c6c5", "c1e3", "d8b6", "b1c3", "b8c6", "e1g1", "b6b2", "d1e1", "c5d4", "e3d4", "c6d4", "f3d4", "f8b4"] },
      { eco: "B17", name: "Caro-Kann: Steinitz/Karpov", weight: 50, moves: ["e2e4", "c7c6", "d2d4", "d7d5", "b1c3", "d5e4", "c3e4", "b8d7", "g1f3", "g8f6", "e4f6", "d7f6", "c2c3", "c8g4", "h2h3", "g4h5", "g2g4", "h5g6", "f3e5", "e7e6", "f1g2", "f6d7"] },
      { eco: "B18", name: "Caro-Kann: Classical Main Line", weight: 55, moves: ["e2e4", "c7c6", "d2d4", "d7d5", "b1c3", "d5e4", "c3e4", "c8f5", "e4g3", "f5g6", "h2h4", "h7h6", "g1f3", "b8d7", "h4h5", "g6h7", "f1d3", "h7d3", "d1d3", "e7e6", "c1d2", "g8f6", "e1c1", "f8e7"] },
      { eco: "B13", name: "Caro-Kann: Panov-Botvinnik Attack", weight: 50, moves: ["e2e4", "c7c6", "d2d4", "d7d5", "e4d5", "c6d5", "c2c4", "g8f6", "b1c3", "e7e6", "g1f3", "f8b4", "c4d5", "f6d5", "c1d2", "b8c6", "f1d3", "e8g8", "e1g1", "b4e7", "d1e2", "d5f6"] },

      // Scandinavian & Alekhine & Pirc
      { eco: "B01", name: "Scandinavian: Main Line", weight: 45, moves: ["e2e4", "d7d5", "e4d5", "d8d5", "b1c3", "d5a5", "d2d4", "g8f6", "g1f3", "c7c6", "f1c4", "c8f5", "c1d2", "e7e6", "c3d5", "a5d8", "d5f6", "d8f6", "d1e2", "b8d7"] },
      { eco: "B01", name: "Scandinavian: Modern 2...Nf6", weight: 40, moves: ["e2e4", "d7d5", "e4d5", "g8f6", "d2d4", "f6d5", "c2c4", "d5b6", "g1f3", "g7g6", "b1c3", "f8g7", "c4c5", "b6d5", "f1c4", "c7c6", "d1b3", "e8g8", "e1g1", "d5c3", "b2c3", "b7b5"] },
      { eco: "B02", name: "Alekhine Defense", weight: 40, moves: ["e2e4", "g8f6", "e4e5", "f6d5", "d2d4", "d7d6", "g1f3", "c8g4", "f1e2", "e7e6", "e1g1", "f8e7", "h2h3", "g4h5", "c2c4", "d5b6", "b1c3", "e8g8", "c1e3", "d6d5", "c4c5", "h5f3"] },
      { eco: "B07", name: "Pirc Defense: Austrian Attack", weight: 45, moves: ["e2e4", "d7d6", "d2d4", "g8f6", "b1c3", "g7g6", "f2f4", "f8g7", "g1f3", "e8g8", "f1d3", "b8a6", "e1g1", "c7c5", "d4d5", "c8g4", "h2h3", "g4f3", "d1f3", "a6b4"] },

      // =========================================================================
      // VOLUME C: OPEN GAMES (RUY LOPEZ, ITALIAN, SCOTCH, FRENCH, PETROFF)
      // =========================================================================
      { eco: "C20", name: "King's Pawn Game", weight: 65, moves: ["e2e4", "e7e5"] },
      // Ruy Lopez (C60 - C99)
      { eco: "C70", name: "Ruy Lopez", weight: 60, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4"] },
      { eco: "C84", name: "Ruy Lopez: Closed", weight: 55, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7", "f1e1", "b7b5", "a4b3", "d7d6", "c2c3", "e8g8", "h2h3"] },
      { eco: "C88", name: "Ruy Lopez: Closed, Breyer", weight: 55, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7", "f1e1", "b7b5", "a4b3", "d7d6", "c2c3", "e8g8", "h2h3", "c6b8", "d2d4", "b8d7", "b1d2", "c8b7", "b3c2", "f8e8", "d2f1", "e7f8"] },
      { eco: "C92", name: "Ruy Lopez: Closed, Chigorin", weight: 55, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7", "f1e1", "b7b5", "a4b3", "d7d6", "c2c3", "e8g8", "h2h3", "c6a5", "b3c2", "c7c5", "d2d4", "d8c7", "b1d2", "c5d4", "c3d4", "c8d7", "d2f1", "a8c8"] },
      { eco: "C89", name: "Ruy Lopez: Marshall Attack", weight: 55, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7", "f1e1", "b7b5", "a4b3", "e8g8", "c2c3", "d7d5", "e4d5", "f6d5", "f3e5", "c6e5", "e1e5", "c7c6", "d2d4", "e7d6", "e5e1", "d8h4", "g2g3", "h4h3"] },
      { eco: "C65", name: "Ruy Lopez: Berlin Defense", weight: 60, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "g8f6", "e1g1", "f6e4", "d2d4", "e4d6", "b5c6", "d7c6", "d4e5", "d6f5", "d1d8", "e8d8", "b1c3", "d8e8", "h2h3", "h7h5", "c1f4", "f8e7", "a1d1", "c8e6"] },
      { eco: "C68", name: "Ruy Lopez: Exchange Variation", weight: 45, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5c6", "d7c6", "e1g1", "f7f6", "d2d4", "e5d4", "f3d4", "c6c5", "d4b3", "d8d1", "f1d1", "c8d7", "c1e3", "b7b6", "b1c3", "e8c8", "a2a4", "a6a5"] },

      // Italian Game (C50 - C59)
      { eco: "C50", name: "Italian Game", weight: 55, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5"] },
      { eco: "C53", name: "Italian: Giuoco Pianissimo", weight: 55, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "c2c3", "g8f6", "d2d3", "d7d6", "e1g1", "a7a6", "a2a4", "c5a7", "f1e1", "e8g8", "h2h3", "h7h6", "b1d2", "c6e7", "d3d4", "e7g6"] },
      { eco: "C52", name: "Italian: Evans Gambit", weight: 45, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "b2b4", "c5b4", "c2c3", "b4a5", "d2d4", "d7d6", "d1b3", "d8d7", "d4e5", "a5b6", "b1d2", "c6a5", "b3b4", "a5c4", "d2c4", "b6c5"] },
      { eco: "C55", name: "Italian: Two Knights Defense", weight: 55, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "d2d3", "f8e7", "e1g1", "e8g8", "f1e1", "d7d6", "a2a4", "g8h8", "h2h3", "f6g8", "b1c3", "f7f5", "e4f5", "c8f5", "c3d5"] },
      { eco: "C57", name: "Two Knights: Fried Liver Attack", weight: 40, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "f3g5", "d7d5", "e4d5", "f6d5", "g5f7", "e8f7", "d1f3", "f7e6", "b1c3", "c6b4", "a2a3", "b4c2", "e1d1", "c2a1", "c3d5", "e6d6", "d2d4"] },
      { eco: "C58", name: "Two Knights: Main Line 5...Na5", weight: 50, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "f3g5", "d7d5", "e4d5", "c6a5", "c4b5", "c7c6", "d5c6", "b7c6", "b5e2", "h7h6", "g5f3", "e5e4", "f3e5", "f8d6", "d2d4", "e4d3", "e5d3", "d8c7"] },

      // Scotch Game & Petroff
      { eco: "C45", name: "Scotch Game: Mieses Variation", weight: 50, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4", "e5d4", "f3d4", "g8f6", "d4c6", "b7c6", "e4e5", "d8e7", "d1e2", "f6d5", "c2c4", "c8a6", "b2b3", "g7g6", "f2f4", "f8g7", "e2f2", "d5b6", "c1a3", "d7d6"] },
      { eco: "C45", name: "Scotch Game: Classical 4...Bc5", weight: 45, moves: ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4", "e5d4", "f3d4", "f8c5", "c1e3", "d8f6", "c2c3", "g8e7", "f1c4", "c6e5", "c4e2", "f6g6", "e1g1", "d7d6", "g1h1", "e8g8", "b1d2", "c5b6", "f2f4"] },
      { eco: "C42", name: "Petroff Defense: Classical", weight: 55, moves: ["e2e4", "e7e5", "g1f3", "g8f6", "f3e5", "d7d6", "e5f3", "f6e4", "d2d4", "d6d5", "f1d3", "f8d6", "e1g1", "e8g8", "c2c4", "c7c6", "b1c3", "e4c3", "b2c3", "d5c4", "d3c4", "c8f5", "c1g5", "d8a5"] },
      { eco: "C43", name: "Petroff: Modern 3.d4", weight: 50, moves: ["e2e4", "e7e5", "g1f3", "g8f6", "d2d4", "f6e4", "f1d3", "d7d5", "f3e5", "b8d7", "e5d7", "c8d7", "e1g1", "f8d6", "c2c4", "c7c6", "b1c3", "e4c3", "b2c3", "e8g8", "c4d5", "c6d5", "d1h5", "g7g6"] },

      // French Defense (C00 - C19)
      { eco: "C00", name: "French Defense", weight: 60, moves: ["e2e4", "e7e6"] },
      { eco: "C02", name: "French: Advance Variation", weight: 55, moves: ["e2e4", "e7e6", "d2d4", "d7d5", "e4e5", "c7c5", "c2c3", "b8c6", "g1f3", "d8b6", "a2a3", "c5c4", "b1d2", "c6a5", "g2g3", "c8d7", "f1g2", "g8e7", "e1g1", "h7h6", "f1e1", "e8c8", "h2h4"] },
      { eco: "C11", name: "French: Classical Steinitz", weight: 55, moves: ["e2e4", "e7e6", "d2d4", "d7d5", "b1c3", "g8f6", "e4e5", "f6d7", "f2f4", "c7c5", "g1f3", "b8c6", "c1e3", "a7a6", "d1d2", "b7b5", "a2a3", "d8b6", "c3e2", "c5c4", "g2g4", "a6a5", "f1g2", "b5b4"] },
      { eco: "C18", name: "French: Winawer, Poisoned Pawn", weight: 50, moves: ["e2e4", "e7e6", "d2d4", "d7d5", "b1c3", "f8b4", "e4e5", "c7c5", "a2a3", "b4c3", "b2c3", "g8e7", "d1g4", "d8c7", "g4g7", "h8g8", "g7h7", "c5d4", "g1e2", "b8c6", "f2f4", "c8d7", "h7d3", "d4c3"] },
      { eco: "C07", name: "French: Tarrasch Open", weight: 50, moves: ["e2e4", "e7e6", "d2d4", "d7d5", "b1d2", "c7c5", "e4d5", "e6d5", "g1f3", "g8f6", "f1b5", "c8d7", "b5d7", "b8d7", "e1g1", "f8e7", "d4c5", "d7c5", "d2b3", "c5e4", "c1e3", "e8g8", "d1d3", "a7a6"] },

      // King's Gambit & Vienna
      { eco: "C30", name: "King's Gambit", weight: 35, moves: ["e2e4", "e7e5", "f2f4"] },
      { eco: "C34", name: "King's Gambit Accepted", weight: 35, moves: ["e2e4", "e7e5", "f2f4", "e5f4", "g1f3", "d7d6", "d2d4", "g7g5", "h2h4", "g5g4", "f3g1", "f8h6", "b1c3", "c7c6", "g1e2", "d8f6", "g2g3", "f4f3", "e2f4", "g8e7"] },
      { eco: "C26", name: "Vienna Game: Falkbeer", weight: 40, moves: ["e2e4", "e7e5", "b1c3", "g8f6", "g2g3", "d7d5", "e4d5", "f6d5", "f1g2", "d5c3", "b2c3", "f8d6", "g1f3", "e8g8", "e1g1", "c7c5", "f1e1", "b8c6", "d2d3", "c8g4", "h2h3", "g4h5"] },

      // =========================================================================
      // VOLUME D: CLOSED GAMES (QUEEN'S GAMBIT, SLAV, LONDON, GRUNFELD)
      // =========================================================================
      { eco: "D00", name: "Queen's Pawn Game", weight: 65, moves: ["d2d4", "d7d5"] },
      { eco: "D06", name: "Queen's Gambit", weight: 65, moves: ["d2d4", "d7d5", "c2c4"] },
      // Queen's Gambit Declined
      { eco: "D37", name: "QGD: Classical 5.Bf4", weight: 55, moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "g1f3", "f8e7", "c1f4", "e8g8", "e2e3", "c7c5", "d4c5", "e7c5", "c4d5", "f6d5", "c3d5", "e6d5", "a2a3", "b8c6", "f1d3", "c5b6", "e1g1", "c8g4"] },
      { eco: "D58", name: "QGD: Tartakower Defense", weight: 55, moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "g1f3", "f8e7", "c1g5", "h7h6", "g5h4", "e8g8", "e2e3", "b7b6", "f1d3", "c8b7", "e1g1", "b8d7", "d1e2", "c7c5", "f1d1", "f6e4", "h4e7", "d8e7", "a1c1"] },
      { eco: "D35", name: "QGD: Exchange Variation", weight: 55, moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c4d5", "e6d5", "c1g5", "c7c6", "e2e3", "f8e7", "f1d3", "b8d7", "d1c2", "e8g8", "g1e2", "f8e8", "e1g1", "d7f8", "f2f3", "g7g6", "a1d1", "f8e6", "g5h4"] },
      { eco: "D52", name: "QGD: Cambridge Springs", weight: 50, moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "b8d7", "e2e3", "c7c6", "g1f3", "d8a5", "f3d2", "f8b4", "d1c2", "e8g8", "g5h4", "c6c5", "d2b3", "a5a4", "c4d5", "f6d5", "f1d3", "c5d4", "e3d4", "h7h6"] },
      { eco: "D41", name: "QGD: Semi-Tarrasch", weight: 50, moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "g1f3", "c7c5", "c4d5", "f6d5", "e2e4", "d5c3", "b2c3", "c5d4", "c3d4", "f8b4", "c1d2", "b4d2", "d1d2", "e8g8", "f1c4", "b8d7", "e1g1", "b7b6", "f1e1", "c8b7"] },

      // Slav Defense (D10 - D19)
      { eco: "D10", name: "Slav Defense", weight: 60, moves: ["d2d4", "d7d5", "c2c4", "c7c6"] },
      { eco: "D15", name: "Slav: Three Knights", weight: 55, moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "b1c3", "d5c4", "a2a4", "c8f5", "e2e3", "e7e6", "f1c4", "f8b4", "e1g1", "e8g8", "d1e2", "b8d7", "e3e4", "f5g6", "c4d3", "g6h5", "e4e5", "f6d5"] },
      { eco: "D17", name: "Slav: Czech Variation", weight: 55, moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "b1c3", "d5c4", "a2a4", "c8f5", "f3e5", "e7e6", "f2f3", "c6c5", "e2e4", "c5d4", "e4f5", "b8c6", "e5c6", "b7c6", "f1c4", "d4c3", "d1d8", "a8d8", "b2c3", "e6f5"] },
      { eco: "D13", name: "Slav: Exchange Variation", weight: 45, moves: ["d2d4", "d7d5", "c2c4", "c7c6", "c4d5", "c6d5", "g1f3", "g8f6", "b1c3", "b8c6", "c1f4", "a7a6", "e2e3", "c8g4", "f1e2", "e7e6", "e1g1", "f8d6", "f4d6", "d8d6", "a1c1", "e8g8", "c3a4", "f6d7", "a4c5"] },

      // Semi-Slav Defense (D43 - D49)
      { eco: "D45", name: "Semi-Slav: Main Line 5.e3", weight: 55, moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "b1c3", "e7e6", "e2e3", "b8d7", "d1c2", "f8d6", "f1d3", "e8g8", "e1g1", "d5c4", "d3c4", "b7b5", "c4e2", "c8b7", "f1d1", "d8c7", "e3e4", "e6e5", "h2h3", "a7a6"] },
      { eco: "D47", name: "Semi-Slav: Meran Variation", weight: 55, moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "b1c3", "e7e6", "e2e3", "b8d7", "f1d3", "d5c4", "d3c4", "b7b5", "c4d3", "a7a6", "e3e4", "c6c5", "e4e5", "c5d4", "c3b5", "a6b5", "e5f6", "g7f6", "e1g1", "d8b6", "d1e2", "c8b7"] },
      { eco: "D44", name: "Semi-Slav: Botvinnik System", weight: 50, moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "b1c3", "e7e6", "c1g5", "d5c4", "e2e4", "b7b5", "e4e5", "h7h6", "g5h4", "g7g5", "f3g5", "h6g5", "h4g5", "b8d7", "g2g3", "c8b7", "f1g2", "d8b6", "e5f6", "c6c5", "d4d5", "e8c8"] },

      // London System & Colle (D02)
      { eco: "D02", name: "London System", weight: 60, moves: ["d2d4", "d7d5", "c1f4", "g8f6", "e2e3", "c7c5", "c2c3", "b8c6", "b1d2", "e7e6", "g1f3", "f8d6", "f4g3", "e8g8", "f1d3", "b7b6", "f3e5", "c8b7", "f2f4", "c6e7", "d1f3", "e7f5", "g3f2", "d6e7"] },
      { eco: "D02", name: "London System: vs Kings Indian", weight: 55, moves: ["d2d4", "g8f6", "c1f4", "g7g6", "e2e3", "f8g7", "g1f3", "e8g8", "h2h3", "d7d6", "f1e2", "b8d7", "e1g1", "d8e8", "c2c4", "e7e5", "f4h2", "e8e7", "b1c3", "c7c6", "b2b4", "f8e8", "a2a4", "e5e4"] },

      // Grünfeld Defense (D70 - D99)
      { eco: "D85", name: "Grünfeld: Exchange Variation", weight: 60, moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "d7d5", "c4d5", "f6d5", "e2e4", "d5c3", "b2c3", "f8g7", "g1f3", "c7c5", "a1b1", "e8g8", "f1e2", "c5d4", "c3d4", "d8a5", "c1d2", "a5a2", "e1g1", "c8g4", "d2g5", "h7h6", "g5e3", "b8c6"] },
      { eco: "D87", name: "Grünfeld: Modern Exchange 8.Be3", weight: 55, moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "d7d5", "c4d5", "f6d5", "e2e4", "d5c3", "b2c3", "f8g7", "f1c4", "c7c5", "g1e2", "e8g8", "c1e3", "b8c6", "e1g1", "c8g4", "f2f3", "c6a5", "c4d3", "c5d4", "c3d4", "g4e6", "d4d5", "g7a1", "d1a1"] },
      { eco: "D97", name: "Grünfeld: Russian System", weight: 50, moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "d7d5", "g1f3", "f8g7", "d1b3", "d5c4", "b3c4", "e8g8", "e2e4", "a7a6", "f1e2", "b7b5", "c4b3", "c8b7", "e4e5", "f6d5", "e1g1", "e7e6", "c1g5", "d8c8", "a1c1", "b8d7"] },

      // =========================================================================
      // VOLUME E: INDIAN DEFENSES (KING'S INDIAN, NIMZO, QUEEN'S INDIAN, CATALAN)
      // =========================================================================
      // King's Indian Defense (E60 - E99)
      { eco: "E60", name: "King's Indian Defense", weight: 65, moves: ["d2d4", "g8f6", "c2c4", "g7g6"] },
      { eco: "E97", name: "King's Indian: Mar del Plata", weight: 60, moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "g1f3", "e8g8", "f1e2", "e7e5", "e1g1", "b8c6", "d4d5", "c6e7", "b2b4", "f6h5", "f1e1", "f7f5", "f3g5", "h5f6", "e2f3", "c7c6", "c1e3", "h7h6", "g5e6", "c8e6", "d5e6", "f5e4"] },
      { eco: "E99", name: "King's Indian: Classical 9.Ne1", weight: 55, moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "g1f3", "e8g8", "f1e2", "e7e5", "e1g1", "b8c6", "d4d5", "c6e7", "f3e1", "f6d7", "c1e3", "f7f5", "f2f3", "f5f4", "e3f2", "g6g5", "a2a4", "e7g6", "a4a5", "f8f7", "b2b4", "f7f6"] },
      { eco: "E81", name: "King's Indian: Sämisch Variation", weight: 50, moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "f2f3", "e8g8", "c1e3", "c7c5", "g1e2", "b8c6", "d1d2", "d8a5", "e1c1", "a7a6", "c1b1", "b7b5", "c3d5", "a5d2", "d1d2", "b5c4", "d5b6", "a8b8", "b6c4"] },
      { eco: "E73", name: "King's Indian: Averbakh Variation", weight: 45, moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "f1e2", "e8g8", "c1g5", "c7c5", "d4d5", "h7h6", "g5f4", "e7e6", "d5e6", "c8e6", "d1d2", "g8h7", "g1f3", "b8c6", "e1g1", "f8e8", "f1d1", "d8a5", "h2h3"] },
      { eco: "E68", name: "King's Indian: Fianchetto Variation", weight: 50, moves: ["d2d4", "g8f6", "c2c4", "g7g6", "g1f3", "f8g7", "g2g3", "e8g8", "f1g2", "d7d6", "e1g1", "b8d7", "b1c3", "e7e5", "e2e4", "c7c6", "h2h3", "d8b6", "f1e1", "e5d4", "f3d4", "f8e8", "e1e2", "f6g4", "d4b3", "g4e5", "c1e3"] },

      // Nimzo-Indian Defense (E20 - E59)
      { eco: "E20", name: "Nimzo-Indian Defense", weight: 65, moves: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4"] },
      { eco: "E32", name: "Nimzo-Indian: Classical 4.Qc2", weight: 60, moves: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4", "d1c2", "e8g8", "a2a3", "b4c3", "c2c3", "b7b6", "c1g5", "c8b7", "f2f3", "h7h6", "g5h4", "d7d5", "e2e3", "b8d7", "c4d5", "f6d5", "h4d8", "d5c3", "d8h4", "c3d5"] },
      { eco: "E46", name: "Nimzo-Indian: Rubinstein System", weight: 55, moves: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4", "e2e3", "e8g8", "g1e2", "d7d5", "a2a3", "b4e7", "c4d5", "e6d5", "g2g3", "c7c6", "f1g2", "f8e8", "e1g1", "b8a6", "f2f3", "c6c5", "g1h1", "c8f5", "g3g4"] },
      { eco: "E54", name: "Nimzo-Indian: Main Line 4.e3", weight: 55, moves: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4", "e2e3", "e8g8", "f1d3", "d7d5", "g1f3", "c7c5", "e1g1", "d5c4", "d3c4", "b8d7", "d1e2", "b7b6", "f1d1", "c5d4", "e3d4", "b4c3", "b2c3", "c8b7", "c1d3", "d8c7", "c3c4"] },

      // Queen's Indian & Bogo-Indian
      { eco: "E15", name: "Queen's Indian: Modern 4.g3 Ba6", weight: 55, moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g1f3", "b7b6", "g2g3", "c8a6", "b2b3", "f8b4", "c1d2", "b4e7", "f1g2", "c7c6", "d2c3", "d7d5", "f3e5", "f6d7", "e5d7", "b8d7", "b1d2", "e8g8", "e1g1", "a8c8", "e2e4", "c6c5", "e4d5", "e6d5"] },
      { eco: "E18", name: "Queen's Indian: Classical 7.Nc3", weight: 50, moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g1f3", "b7b6", "g2g3", "c8b7", "f1g2", "f8e7", "e1g1", "e8g8", "b1c3", "f6e4", "c1d2", "f7f5", "a1c1", "e7f6", "d4d5", "b8a6", "c3e4", "f5e4", "f3e1", "e6d5", "c4d5", "b7d5"] },
      { eco: "E11", name: "Bogo-Indian Defense", weight: 45, moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g1f3", "f8b4", "c1d2", "d8e7", "g2g3", "b8c6", "b1c3", "b4c3", "d2c3", "f6e4", "a1c1", "e8g8", "f1g2", "d7d6", "d4d5", "e4c3", "c1c3", "c6b8", "d5e6", "f7e6", "e1g1", "b8d7"] },

      // Catalan Opening (E00 - E09)
      { eco: "E04", name: "Open Catalan", weight: 55, moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g2g3", "d7d5", "f1g2", "d5c4", "g1f3", "a7a6", "e1g1", "b8c6", "e2e3", "c8d7", "d1e2", "b7b5", "f1d1", "f8e7", "e3e4", "e8g8", "b1c3", "f8e8", "c1f4", "a8c8", "d4d5", "e6d5", "e4e5"] },
      { eco: "E06", name: "Closed Catalan", weight: 55, moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g2g3", "d7d5", "f1g2", "f8e7", "g1f3", "e8g8", "e1g1", "d5c4", "d1c2", "a7a6", "c2c4", "b7b5", "c4c2", "c8b7", "c1d2", "b7e4", "c2c1", "e4b7", "f1d1", "d8c8", "d2g5", "c7c5", "d4c5", "b8d7"] }
    ];

    // Compile lines through ChessEngine and build tables
    const engine = new ChessEngine();

    for (const line of rawLines) {
      engine.reset();
      for (let step = 0; step < line.moves.length; step++) {
        const moveStr = line.moves[step];
        const from = moveStr.slice(0, 2);
        const to = moveStr.slice(2, 4);
        const promo = moveStr.length > 4 ? moveStr.slice(4) : 'q';

        const fenKey = engine.getPositionKey();
        const zobristHash = ChessZobrist.computeHash(engine);

        // Record metadata
        if (!this.infoTable.has(fenKey)) {
          this.infoTable.set(fenKey, { eco: line.eco, name: line.name });
        }

        // Apply move and record candidate
        const executed = engine.makeMove(from, to, promo);
        if (!executed) {
          break;
        }

        const candidate = {
          from,
          to,
          promotion: promo,
          san: executed.san,
          weight: Math.max(5, line.weight - step * 2),
          eco: line.eco,
          name: line.name
        };

        // Add to fenTable
        if (!this.fenTable.has(fenKey)) {
          this.fenTable.set(fenKey, []);
        }
        const fenList = this.fenTable.get(fenKey);
        const exists = fenList.some(m => m.from === from && m.to === to && m.promotion === promo);
        if (!exists) {
          fenList.push(candidate);
        }

        // Add to zobristTable
        if (!this.zobristTable.has(zobristHash)) {
          this.zobristTable.set(zobristHash, []);
        }
        const zobList = this.zobristTable.get(zobristHash);
        const existsZ = zobList.some(m => m.from === from && m.to === to && m.promotion === promo);
        if (!existsZ) {
          zobList.push(candidate);
        }
      }
    }
  }

  /**
   * Retrieves book candidates for current board position
   * @param {ChessEngine} engine
   * @returns {Array<object>|null}
   */
  getCandidates(engine) {
    if (!engine) return null;
    const fenKey = engine.getPositionKey();
    if (this.fenTable.has(fenKey)) {
      return this.fenTable.get(fenKey);
    }
    const hash = ChessZobrist.computeHash(engine);
    if (this.zobristTable.has(hash)) {
      return this.zobristTable.get(hash);
    }
    return null;
  }

  /**
   * Checks if position exists in the opening book
   */
  isBookPosition(engine) {
    return Boolean(this.getCandidates(engine));
  }

  /**
   * Returns ECO code and opening name if known
   */
  getOpeningInfo(engine) {
    if (!engine) return null;
    const fenKey = engine.getPositionKey();
    if (this.infoTable.has(fenKey)) {
      return this.infoTable.get(fenKey);
    }
    const cands = this.getCandidates(engine);
    if (cands && cands.length > 0) {
      return { eco: cands[0].eco, name: cands[0].name };
    }
    return null;
  }

  /**
   * Selects non-repetitive grandmaster move via temperature-weighted sampling
   * @param {ChessEngine} engine
   * @param {number} temperature - sampling temperature (0.0 = argmax, 1.0 = standard)
   * @returns {object|null} { from, to, promotion, san, eco, name } or null
   */
  findBookMove(engine, temperature = 1.0) {
    const candidates = this.getCandidates(engine);
    if (!candidates || candidates.length === 0) return null;

    if (candidates.length === 1 || temperature <= 0.05) {
      let best = candidates[0];
      for (const c of candidates) {
        if (c.weight > best.weight) best = c;
      }
      return { ...best };
    }

    // Temperature-weighted sampling: P(m_i) ~ w_i^(1/T)
    const invT = 1.0 / Math.max(0.1, temperature);
    const expWeights = [];
    let sum = 0.0;
    for (const c of candidates) {
      const ew = Math.pow(Math.max(1, c.weight), invT);
      expWeights.push(ew);
      sum += ew;
    }

    const r = Math.random() * sum;
    let accum = 0.0;
    for (let i = 0; i < candidates.length; i++) {
      accum += expWeights[i];
      if (accum >= r) {
        return { ...candidates[i] };
      }
    }

    return { ...candidates[candidates.length - 1] };
  }
}

// CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ChessBook
  };
}
