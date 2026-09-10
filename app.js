(() => {
  'use strict';

  const GRID = 10;
  const POINTS = GRID + 1;
  const MOVES_PER_TURN = 3;
  const MAX_ROUNDS = 50; // 50ラウンド = 各プレイヤー50ターン = 合計100ターン
  const COMPUTER_PLAYER = 'B';
  const COMPUTER_MOVE_DELAY = 420;

  const COLORS = {
    A: '#32c770',
    B: '#37a8ff',
    AFill: 'rgba(50,199,112,.22)',
    BFill: 'rgba(55,168,255,.22)',
    grid: '#344052',
    gridStrong: '#526176',
    pieceStroke: '#f7fbff',
    current: '#ffffff'
  };

  const board = document.getElementById('board');
  const ctx = board.getContext('2d');
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  const ui = {
    scoreA: document.getElementById('scoreA'),
    scoreB: document.getElementById('scoreB'),
    panelA: document.getElementById('panelA'),
    panelB: document.getElementById('panelB'),
    roundLabel: document.getElementById('roundLabel'),
    undoBtn: document.getElementById('undoBtn'),
    endTurnBtn: document.getElementById('endTurnBtn'),
    resetBtn: document.getElementById('resetBtn'),
    againBtn: document.getElementById('againBtn'),
    winnerOverlay: document.getElementById('winnerOverlay'),
    winnerTitle: document.getElementById('winnerTitle'),
    winnerScore: document.getElementById('winnerScore')
  };

  let view = { size: 760, pad: 56, cell: 64.8 };
  let state;
  let territoryCache = null;
  let computerTimer = null;
  let computerPlan = null;

  function initialState() {
    return {
      current: 'A',
      round: 1,
      turns: { A: 0, B: 0 },
      movesUsed: 0,
      selectedPiece: null,
      gameOver: false,
      players: {
        A: {
          pieces: [{ x: 0, y: 10 }, { x: 10, y: 0 }],
          segments: [{ a: { x: 0, y: 10 }, b: { x: 10, y: 0 }, initial: true }],
          score: 0
        },
        B: {
          pieces: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
          segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, initial: true }],
          score: 0
        }
      },
      turnStartPieces: null,
      undoStack: []
    };
  }

  function clonePieces(pieces) {
    return pieces.map(p => ({ x: p.x, y: p.y }));
  }

  function resetGame() {
    if (computerTimer) {
      clearTimeout(computerTimer);
      computerTimer = null;
    }
    computerPlan = null;
    territoryCache = null;
    state = initialState();
    state.turnStartPieces = clonePieces(state.players.A.pieces);
    ui.winnerOverlay.classList.add('hidden');
    render();
  }

  function resizeCanvas() {
    const rect = board.getBoundingClientRect();
    const cssSize = Math.max(300, Math.floor(Math.min(rect.width, rect.height || rect.width)));
    board.width = Math.round(cssSize * dpr);
    board.height = Math.round(cssSize * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.size = cssSize;
    view.pad = Math.max(34, cssSize * 0.075);
    view.cell = (cssSize - view.pad * 2) / GRID;
    drawBoard();
  }

  function ptToPx(p) {
    return {
      x: view.pad + p.x * view.cell,
      y: view.pad + (GRID - p.y) * view.cell
    };
  }

  function drawBoard() {
    if (!state) return;
    const s = view.size;
    ctx.clearRect(0, 0, s, s);

    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, '#151c28');
    grad.addColorStop(1, '#0c1119');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // faint board field
    ctx.fillStyle = '#101721';
    ctx.fillRect(view.pad, view.pad, view.cell * GRID, view.cell * GRID);

    drawTerritory('A');
    drawTerritory('B');
    drawGrid();
    drawSegments('A');
    drawSegments('B');
    drawCurrentLine();
    drawMoveHints();
    drawPieces('A');
    drawPieces('B');
  }

  function isPerimeterPoint(p) {
    return p.x === 0 || p.x === GRID || p.y === 0 || p.y === GRID;
  }

  function drawGrid() {
    ctx.save();

    // The field has only 40 playable points: 11 on each side, with corners shared.
    ctx.strokeStyle = COLORS.gridStrong;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(view.pad, view.pad, GRID * view.cell, GRID * view.cell);

    for (let x = 0; x <= GRID; x++) {
      for (let y = 0; y <= GRID; y++) {
        if (!isPerimeterPoint({ x, y })) continue;
        const p = ptToPx({ x, y });
        ctx.fillStyle = '#728096';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(2.2, view.cell * .04), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawSegments(player) {
    const color = COLORS[player];
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const seg of state.players[player].segments) {
      const a = ptToPx(seg.a);
      const b = ptToPx(seg.b);
      ctx.globalAlpha = seg.initial ? .42 : .55;
      ctx.lineWidth = seg.initial ? Math.max(2.3, view.cell * .05) : Math.max(2, view.cell * .042);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCurrentLine() {
    if (state.gameOver) return;
    const p = state.players[state.current].pieces;
    const a = ptToPx(p[0]);
    const b = ptToPx(p[1]);
    ctx.save();
    ctx.strokeStyle = COLORS.current;
    ctx.lineWidth = Math.max(2.2, view.cell * .055);
    ctx.setLineDash([view.cell * .12, view.cell * .10]);
    ctx.globalAlpha = .92;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawPieces(player) {
    const pieces = state.players[player].pieces;
    pieces.forEach((p, idx) => {
      const c = ptToPx(p);
      const active = player === state.current && idx === state.selectedPiece && !state.gameOver;
      const r = Math.max(9, view.cell * .16);

      ctx.save();
      if (active) {
        ctx.shadowColor = COLORS[player];
        ctx.shadowBlur = 22;
      }
      ctx.fillStyle = COLORS[player];
      ctx.strokeStyle = COLORS.pieceStroke;
      ctx.lineWidth = active ? 3.5 : 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, active ? r * 1.12 : r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    });
  }

  function legalTargetsForPieces(pieces, pieceIndex) {
    const p = pieces[pieceIndex];
    const out = [];
    const steps = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];

    for (const step of steps) {
      const q = { x: p.x + step.x, y: p.y + step.y };
      if (q.x < 0 || q.x > GRID || q.y < 0 || q.y > GRID) continue;
      if (!isPerimeterPoint(q)) continue;

      const occupiedByOwnOther = pieces.some((own, idx) =>
        idx !== pieceIndex && own.x === q.x && own.y === q.y
      );
      if (occupiedByOwnOther) continue;

      out.push(q);
    }

    return out;
  }

  function legalTargets(pieceIndex) {
    return legalTargetsForPieces(state.players[state.current].pieces, pieceIndex);
  }

  function drawMoveHints() {
    if (
      state.gameOver ||
      state.current === COMPUTER_PLAYER ||
      state.movesUsed >= MOVES_PER_TURN
    ) return;

    let targets = [];

    if (state.selectedPiece == null) {
      // At the start of a human turn, show every legal destination for both pieces.
      const seen = new Set();
      for (let pieceIndex = 0; pieceIndex < state.players.A.pieces.length; pieceIndex++) {
        for (const target of legalTargets(pieceIndex)) {
          const key = `${target.x},${target.y}`;
          if (!seen.has(key)) {
            seen.add(key);
            targets.push(target);
          }
        }
      }
    } else {
      targets = legalTargets(state.selectedPiece);
    }

    ctx.save();
    for (const t of targets) {
      const p = ptToPx(t);
      ctx.fillStyle = COLORS.A;
      ctx.globalAlpha = state.selectedPiece == null ? .24 : .34;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(8, view.cell * .13), 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = .92;
      ctx.strokeStyle = COLORS.A;
      ctx.lineWidth = state.selectedPiece == null ? 1.3 : 1.8;
      ctx.stroke();
    }
    ctx.restore();
  }

  function boardPointFromEvent(ev) {
    const rect = board.getBoundingClientRect();
    const xPx = ev.clientX - rect.left;
    const yPx = ev.clientY - rect.top;
    const gx = Math.round((xPx - view.pad) / view.cell);
    const gy = Math.round(GRID - (yPx - view.pad) / view.cell);
    if (gx < 0 || gx > GRID || gy < 0 || gy > GRID) return null;
    const snap = ptToPx({ x: gx, y: gy });
    const dist = Math.hypot(snap.x - xPx, snap.y - yPx);
    if (dist > view.cell * .36) return null;
    return { x: gx, y: gy };
  }

  function handleBoardPointer(ev) {
    if (state.gameOver || state.current === COMPUTER_PLAYER || state.movesUsed >= MOVES_PER_TURN) return;
    const q = boardPointFromEvent(ev);
    if (!q) return;

    // click own piece -> select
    const own = state.players[state.current].pieces;
    const clickedOwnIndex = own.findIndex(p => p.x === q.x && p.y === q.y);
    if (clickedOwnIndex !== -1) {
      state.selectedPiece = clickedOwnIndex;
      render();
      return;
    }

    // A candidate point can be clicked directly even when no piece is selected.
    // If both pieces can reach the same point, choose the move that leaves the
    // longer current line; ties are resolved by the lower piece index.
    let movingPieceIndex = state.selectedPiece;

    if (movingPieceIndex == null) {
      const candidates = [];

      for (let pieceIndex = 0; pieceIndex < own.length; pieceIndex++) {
        const canReach = legalTargets(pieceIndex).some(
          p => p.x === q.x && p.y === q.y
        );
        if (!canReach) continue;

        const simulated = clonePieces(own);
        simulated[pieceIndex] = { ...q };
        const lineLength = Math.hypot(
          simulated[1].x - simulated[0].x,
          simulated[1].y - simulated[0].y
        );

        candidates.push({ pieceIndex, lineLength });
      }

      if (!candidates.length) return;

      candidates.sort((a, b) =>
        b.lineLength - a.lineLength || a.pieceIndex - b.pieceIndex
      );
      movingPieceIndex = candidates[0].pieceIndex;
    } else {
      const legal = legalTargets(movingPieceIndex).some(
        p => p.x === q.x && p.y === q.y
      );
      if (!legal) return;
    }

    state.undoStack.push({
      pieces: clonePieces(own),
      movesUsed: state.movesUsed,
      selectedPiece: state.selectedPiece
    });

    own[movingPieceIndex] = { ...q };
    state.movesUsed += 1;

    // After every move, return to the all-candidates state so the next
    // destination can also be clicked directly without selecting a piece first.
    state.selectedPiece = null;

    render();
  }

  function undoMove() {
    if (!state.undoStack.length || state.gameOver || state.current === COMPUTER_PLAYER) return;
    const last = state.undoStack.pop();
    state.players[state.current].pieces = clonePieces(last.pieces);
    state.movesUsed = last.movesUsed;
    state.selectedPiece = last.selectedPiece;
    render();
  }

  function endTurn() {
    if (state.gameOver || state.movesUsed !== MOVES_PER_TURN) return;
    const player = state.current;
    const pieces = state.players[player].pieces;

    state.players[player].segments.push({
      a: { ...pieces[0] },
      b: { ...pieces[1] },
      initial: false
    });
    territoryCache = null;
    state.turns[player] += 1;

    const territories = computeTerritories();
    state.players.A.score = territories.A.area;
    state.players.B.score = territories.B.area;



    if (player === 'B' && state.turns.B >= MAX_ROUNDS) {
      finishGame();
      render();
      return;
    }

    state.current = player === 'A' ? 'B' : 'A';
    if (state.current === 'A') state.round += 1;
    state.movesUsed = 0;
    state.selectedPiece = null;
    state.undoStack = [];
    state.turnStartPieces = clonePieces(state.players[state.current].pieces);
    computerPlan = null;
    render();
    scheduleComputerTurn();
  }

  function scheduleComputerTurn() {
    if (computerTimer) {
      clearTimeout(computerTimer);
      computerTimer = null;
    }
    if (!state || state.gameOver || state.current !== COMPUTER_PLAYER) return;
    computerTimer = setTimeout(computerStep, COMPUTER_MOVE_DELAY);
  }

  function segmentLength(seg) {
    return Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
  }

  function orientation(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function properIntersection(s1, s2) {
    const o1 = orientation(s1.a, s1.b, s2.a);
    const o2 = orientation(s1.a, s1.b, s2.b);
    const o3 = orientation(s2.a, s2.b, s1.a);
    const o4 = orientation(s2.a, s2.b, s1.b);
    return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) &&
           ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
  }

  function sameSegment(s1, s2) {
    const sameDirection =
      s1.a.x === s2.a.x && s1.a.y === s2.a.y &&
      s1.b.x === s2.b.x && s1.b.y === s2.b.y;
    const oppositeDirection =
      s1.a.x === s2.b.x && s1.a.y === s2.b.y &&
      s1.b.x === s2.a.x && s1.b.y === s2.a.y;
    return sameDirection || oppositeDirection;
  }

  // Fast territory calculation used only by the CPU while comparing candidates.
  // It follows the same mixed-boundary rule as the visible scoring, but at lower
  // raster resolution so every reachable 3-MOVE result can be evaluated quickly.
  function computeTerritoryAreasFast(extraBSegment) {
    const SCALE = 14;
    const MARGIN = SCALE * 2;
    const BOARD_PX = GRID * SCALE;
    const W = BOARD_PX + MARGIN * 2 + 1;
    const H = W;
    const N = W * H;

    const map = p => ({
      x: MARGIN + p.x * SCALE,
      y: MARGIN + (GRID - p.y) * SCALE
    });

    function rasterizePlayer(player) {
      const oc = document.createElement('canvas');
      oc.width = W;
      oc.height = H;
      const ox = oc.getContext('2d', { willReadFrequently: true });
      ox.clearRect(0, 0, W, H);
      ox.strokeStyle = '#000';
      ox.lineWidth = 1.8;
      ox.lineCap = 'round';
      ox.lineJoin = 'round';

      const segments = player === 'B' && extraBSegment
        ? [...state.players.B.segments, extraBSegment]
        : state.players[player].segments;

      for (const seg of segments) {
        const a = map(seg.a);
        const b = map(seg.b);
        ox.beginPath();
        ox.moveTo(a.x, a.y);
        ox.lineTo(b.x, b.y);
        ox.stroke();
      }

      const img = ox.getImageData(0, 0, W, H).data;
      const mask = new Uint8Array(N);
      for (let i = 0, p = 0; i < img.length; i += 4, p++) {
        if (img[i + 3] > 16) mask[p] = 1;
      }
      return mask;
    }

    const blockedA = rasterizePlayer('A');
    const blockedB = rasterizePlayer('B');
    const blocked = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      blocked[i] = blockedA[i] || blockedB[i] ? 1 : 0;
    }

    const outside = new Uint8Array(N);
    const queue = new Int32Array(N);
    let head = 0;
    let tail = 0;

    const pushOutside = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const idx = y * W + x;
      if (blocked[idx] || outside[idx]) return;
      outside[idx] = 1;
      queue[tail++] = idx;
    };

    for (let x = 0; x < W; x++) {
      pushOutside(x, 0);
      pushOutside(x, H - 1);
    }
    for (let y = 1; y < H - 1; y++) {
      pushOutside(0, y);
      pushOutside(W - 1, y);
    }

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % W;
      const y = (idx / W) | 0;
      pushOutside(x + 1, y);
      pushOutside(x - 1, y);
      pushOutside(x, y + 1);
      pushOutside(x, y - 1);
    }

    const claimed = new Uint8Array(N);
    let areaA = 0;
    let areaB = 0;

    const inBoardPixel = (x, y) =>
      x >= MARGIN && x < MARGIN + BOARD_PX &&
      y >= MARGIN && y < MARGIN + BOARD_PX;

    for (let by = 0; by < BOARD_PX; by++) {
      for (let bx = 0; bx < BOARD_PX; bx++) {
        const sx = MARGIN + bx;
        const sy = MARGIN + by;
        const startIdx = sy * W + sx;
        if (blocked[startIdx] || outside[startIdx] || claimed[startIdx]) continue;

        head = 0;
        tail = 0;
        queue[tail++] = startIdx;
        claimed[startIdx] = 1;

        let componentBoardPixels = 0;
        let touchesA = false;
        let touchesB = false;

        while (head < tail) {
          const idx = queue[head++];
          const x = idx % W;
          const y = (idx / W) | 0;
          if (inBoardPixel(x, y)) componentBoardPixels++;

          const neighbors = [idx + 1, idx - 1, idx + W, idx - W];
          for (const nidx of neighbors) {
            if (nidx < 0 || nidx >= N) continue;

            if (blocked[nidx]) {
              if (blockedA[nidx]) touchesA = true;
              if (blockedB[nidx]) touchesB = true;
              continue;
            }

            if (outside[nidx] || claimed[nidx]) continue;
            claimed[nidx] = 1;
            queue[tail++] = nidx;
          }
        }

        if (touchesA && !touchesB) areaA += componentBoardPixels;
        else if (touchesB && !touchesA) areaB += componentBoardPixels;
      }
    }

    return {
      A: areaA / (SCALE * SCALE),
      B: areaB / (SCALE * SCALE)
    };
  }

  function evaluateComputerFinalPieces(pieces) {
    const candidate = {
      a: { ...pieces[0] },
      b: { ...pieces[1] },
      initial: false
    };

    const areas = computeTerritoryAreasFast(candidate);

    // Immediate board advantage is by far the most important factor.
    let value = (areas.B - areas.A) * 10000;

    // When no territory is created yet, prefer useful long lines and lines that
    // intersect our earlier lines, because those are more likely to close loops.
    value += segmentLength(candidate) * 8;

    let ownCrossings = 0;
    let opponentCrossings = 0;
    let duplicate = false;

    for (const seg of state.players.B.segments) {
      if (sameSegment(candidate, seg)) duplicate = true;
      if (properIntersection(candidate, seg)) ownCrossings++;
    }
    for (const seg of state.players.A.segments) {
      if (properIntersection(candidate, seg)) opponentCrossings++;
    }

    value += ownCrossings * 35;
    value += opponentCrossings * 8;
    if (duplicate) value -= 120;

    return value;
  }

  function buildComputerPlan() {
    const startPieces = clonePieces(state.players.B.pieces);
    const candidates = new Map();

    function search(pieces, depth, plan) {
      if (depth === MOVES_PER_TURN) {
        const key = `${pieces[0].x},${pieces[0].y}|${pieces[1].x},${pieces[1].y}`;
        if (!candidates.has(key)) {
          candidates.set(key, {
            pieces: clonePieces(pieces),
            plan: plan.map(move => ({
              pieceIndex: move.pieceIndex,
              target: { ...move.target }
            }))
          });
        }
        return;
      }

      for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex++) {
        for (const target of legalTargetsForPieces(pieces, pieceIndex)) {
          const next = clonePieces(pieces);
          next[pieceIndex] = { ...target };
          search(next, depth + 1, [...plan, { pieceIndex, target }]);
        }
      }
    }

    search(startPieces, 0, []);

    let best = null;
    for (const candidate of candidates.values()) {
      const score = evaluateComputerFinalPieces(candidate.pieces);
      // Tiny random tie-break keeps repeated equal positions from looking robotic.
      const tieBrokenScore = score + Math.random() * 0.001;
      if (!best || tieBrokenScore > best.score) {
        best = { score: tieBrokenScore, plan: candidate.plan };
      }
    }

    return best ? best.plan : [];
  }

  function computerStep() {
    computerTimer = null;
    if (!state || state.gameOver || state.current !== COMPUTER_PLAYER) return;

    if (state.movesUsed >= MOVES_PER_TURN) {
      endTurn();
      return;
    }

    if (!computerPlan) {
      computerPlan = buildComputerPlan();
    }

    const choice = computerPlan[state.movesUsed];
    if (!choice) {
      state.movesUsed = MOVES_PER_TURN;
      render();
      computerTimer = setTimeout(() => endTurn(), COMPUTER_MOVE_DELAY);
      return;
    }

    const own = state.players.B.pieces;
    state.selectedPiece = choice.pieceIndex;
    own[choice.pieceIndex] = { ...choice.target };
    state.movesUsed += 1;

    if (state.movesUsed >= MOVES_PER_TURN) {
      state.selectedPiece = null;
    }
    render();

    computerTimer = setTimeout(() => {
      if (state.movesUsed >= MOVES_PER_TURN) endTurn();
      else computerStep();
    }, COMPUTER_MOVE_DELAY);
  }

  // Build the planar regions from BOTH players' confirmed lines.
  // A region scores only when every line on that region's boundary belongs
  // to one player. If the boundary contains both red and blue lines, it is neutral.
  // The outer square itself is not a scoring boundary.
  function computeTerritories() {
    if (territoryCache) return territoryCache;

    const SCALE = 48;
    const MARGIN = SCALE * 2;
    const BOARD_PX = GRID * SCALE;
    const W = BOARD_PX + MARGIN * 2 + 1;
    const H = W;
    const N = W * H;

    const map = p => ({
      x: MARGIN + p.x * SCALE,
      y: MARGIN + (GRID - p.y) * SCALE
    });

    function rasterizePlayer(player) {
      const oc = document.createElement('canvas');
      oc.width = W;
      oc.height = H;
      const ox = oc.getContext('2d', { willReadFrequently: true });
      ox.clearRect(0, 0, W, H);
      ox.strokeStyle = '#000';
      ox.lineWidth = 3;
      ox.lineCap = 'round';
      ox.lineJoin = 'round';

      for (const seg of state.players[player].segments) {
        const a = map(seg.a);
        const b = map(seg.b);
        ox.beginPath();
        ox.moveTo(a.x, a.y);
        ox.lineTo(b.x, b.y);
        ox.stroke();
      }

      const img = ox.getImageData(0, 0, W, H).data;
      const mask = new Uint8Array(N);
      for (let i = 0, p = 0; i < img.length; i += 4, p++) {
        if (img[i + 3] > 16) mask[p] = 1;
      }
      return mask;
    }

    const blockedA = rasterizePlayer('A');
    const blockedB = rasterizePlayer('B');
    const blocked = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      blocked[i] = blockedA[i] || blockedB[i] ? 1 : 0;
    }

    // First mark every free pixel connected to the outside.
    const outside = new Uint8Array(N);
    const q = new Int32Array(N);
    let head = 0;
    let tail = 0;

    const pushOutside = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const idx = y * W + x;
      if (blocked[idx] || outside[idx]) return;
      outside[idx] = 1;
      q[tail++] = idx;
    };

    for (let x = 0; x < W; x++) {
      pushOutside(x, 0);
      pushOutside(x, H - 1);
    }
    for (let y = 1; y < H - 1; y++) {
      pushOutside(0, y);
      pushOutside(W - 1, y);
    }

    while (head < tail) {
      const idx = q[head++];
      const x = idx % W;
      const y = (idx / W) | 0;
      pushOutside(x + 1, y);
      pushOutside(x - 1, y);
      pushOutside(x, y + 1);
      pushOutside(x, y - 1);
    }

    const claimed = new Uint8Array(N);
    const maskA = document.createElement('canvas');
    const maskB = document.createElement('canvas');
    maskA.width = maskB.width = BOARD_PX;
    maskA.height = maskB.height = BOARD_PX;
    const mxA = maskA.getContext('2d');
    const mxB = maskB.getContext('2d');
    const imgA = mxA.createImageData(BOARD_PX, BOARD_PX);
    const imgB = mxB.createImageData(BOARD_PX, BOARD_PX);

    let areaPixelsA = 0;
    let areaPixelsB = 0;

    const inBoardPixel = (x, y) =>
      x >= MARGIN && x < MARGIN + BOARD_PX &&
      y >= MARGIN && y < MARGIN + BOARD_PX;

    // Every remaining free component is one atomic enclosed region.
    for (let by = 0; by < BOARD_PX; by++) {
      for (let bx = 0; bx < BOARD_PX; bx++) {
        const sx = MARGIN + bx;
        const sy = MARGIN + by;
        const startIdx = sy * W + sx;
        if (blocked[startIdx] || outside[startIdx] || claimed[startIdx]) continue;

        head = 0;
        tail = 0;
        q[tail++] = startIdx;
        claimed[startIdx] = 1;

        const componentBoardPixels = [];
        let touchesA = false;
        let touchesB = false;

        while (head < tail) {
          const idx = q[head++];
          const x = idx % W;
          const y = (idx / W) | 0;

          if (inBoardPixel(x, y)) {
            componentBoardPixels.push((y - MARGIN) * BOARD_PX + (x - MARGIN));
          }

          const neighbors = [
            idx + 1,
            idx - 1,
            idx + W,
            idx - W
          ];

          for (const nidx of neighbors) {
            if (nidx < 0 || nidx >= N) continue;

            if (blocked[nidx]) {
              if (blockedA[nidx]) touchesA = true;
              if (blockedB[nidx]) touchesB = true;
              continue;
            }

            if (outside[nidx] || claimed[nidx]) continue;
            claimed[nidx] = 1;
            q[tail++] = nidx;
          }
        }

        // All boundary segments must belong to exactly one player.
        const owner = touchesA && !touchesB
          ? 'A'
          : touchesB && !touchesA
            ? 'B'
            : null;

        if (!owner || componentBoardPixels.length === 0) continue;

        const target = owner === 'A' ? imgA : imgB;
        const rgb = owner === 'A'
          ? { r: 50, g: 199, b: 112 }
          : { r: 55, g: 168, b: 255 };

        for (const p of componentBoardPixels) {
          const dst = p * 4;
          target.data[dst] = rgb.r;
          target.data[dst + 1] = rgb.g;
          target.data[dst + 2] = rgb.b;
          target.data[dst + 3] = 58;
        }

        if (owner === 'A') areaPixelsA += componentBoardPixels.length;
        else areaPixelsB += componentBoardPixels.length;
      }
    }

    mxA.putImageData(imgA, 0, 0);
    mxB.putImageData(imgB, 0, 0);

    territoryCache = {
      A: { area: areaPixelsA / (SCALE * SCALE), mask: maskA },
      B: { area: areaPixelsB / (SCALE * SCALE), mask: maskB }
    };
    return territoryCache;
  }

  function calculateArea(player) {
    return computeTerritories()[player].area;
  }

  function drawTerritory(player) {
    const territory = computeTerritories()[player];
    if (territory.area <= 0) return;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      territory.mask,
      view.pad,
      view.pad,
      view.cell * GRID,
      view.cell * GRID
    );
    ctx.restore();
  }

  function finishGame() {
    state.gameOver = true;
    state.selectedPiece = null;
    const a = state.players.A.score;
    const b = state.players.B.score;
    if (Math.abs(a - b) < 0.005) {
      ui.winnerTitle.textContent = 'DRAW';
    } else {
      ui.winnerTitle.textContent = a > b ? 'PLAYER A WIN' : 'COMPUTER WIN';
    }
    ui.winnerScore.textContent = `A ${a.toFixed(2)} － ${b.toFixed(2)} COMPUTER`;
    ui.winnerOverlay.classList.remove('hidden');
  }


  function updateUI() {
    const player = state.current;
    ui.scoreA.textContent = state.players.A.score.toFixed(2);
    ui.scoreB.textContent = state.players.B.score.toFixed(2);
    ui.panelA.classList.toggle('active', !state.gameOver && player === 'A');
    ui.panelB.classList.toggle('active', !state.gameOver && player === 'B');
    ui.roundLabel.textContent = `${Math.min(state.round, MAX_ROUNDS)} / ${MAX_ROUNDS}`;
    ui.undoBtn.disabled = state.gameOver || player === COMPUTER_PLAYER || !state.undoStack.length;
    ui.endTurnBtn.disabled = state.gameOver || player === COMPUTER_PLAYER || state.movesUsed !== MOVES_PER_TURN;
  }

  function render() {
    updateUI();
    drawBoard();
  }

  board.addEventListener('pointerdown', handleBoardPointer);
  ui.undoBtn.addEventListener('click', undoMove);
  ui.endTurnBtn.addEventListener('click', endTurn);
  ui.resetBtn.addEventListener('click', resetGame);
  ui.againBtn.addEventListener('click', resetGame);
  window.addEventListener('resize', resizeCanvas);

  resetGame();
  requestAnimationFrame(resizeCanvas);
})();
