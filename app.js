(() => {
  'use strict';

  const GRID = 10;
  const POINTS = GRID + 1;
  const MOVES_PER_TURN = 3;
  const MAX_ROUNDS = 50; // 50ラウンド = 各プレイヤー50ターン = 合計100ターン
  const COMPUTER_PLAYER = 'B';
  const COMPUTER_MOVE_DELAY = 420;

  const COLORS = {
    A: '#ff5d72',
    B: '#37a8ff',
    AFill: 'rgba(255,93,114,.22)',
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
    turnsA: document.getElementById('turnsA'),
    turnsB: document.getElementById('turnsB'),
    panelA: document.getElementById('panelA'),
    panelB: document.getElementById('panelB'),
    roundLabel: document.getElementById('roundLabel'),
    turnLabel: document.getElementById('turnLabel'),
    movesLeft: document.getElementById('movesLeft'),
    instruction: document.getElementById('instruction'),
    undoBtn: document.getElementById('undoBtn'),
    endTurnBtn: document.getElementById('endTurnBtn'),
    resetBtn: document.getElementById('resetBtn'),
    againBtn: document.getElementById('againBtn'),
    clearSelectionBtn: document.getElementById('clearSelectionBtn'),
    history: document.getElementById('history'),
    winnerOverlay: document.getElementById('winnerOverlay'),
    winnerTitle: document.getElementById('winnerTitle'),
    winnerScore: document.getElementById('winnerScore')
  };

  let view = { size: 760, pad: 56, cell: 64.8 };
  let state;
  let territoryCache = null;
  let computerTimer = null;

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
      undoStack: [],
      history: []
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

  function legalTargets(pieceIndex) {
    const p = state.players[state.current].pieces[pieceIndex];
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
      if (isOccupiedByOwnOther(q, pieceIndex)) continue;
      out.push(q);
    }

    return out;
  }

  function drawMoveHints() {
    if (state.gameOver || state.selectedPiece == null || state.movesUsed >= MOVES_PER_TURN) return;
    const targets = legalTargets(state.selectedPiece);
    ctx.save();
    for (const t of targets) {
      const p = ptToPx(t);
      ctx.fillStyle = COLORS[state.current];
      ctx.globalAlpha = .28;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(8, view.cell * .13), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = .9;
      ctx.strokeStyle = COLORS[state.current];
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function isOccupiedByOwnOther(q, movingPieceIndex) {
    const own = state.players[state.current].pieces;
    return own.some((p, idx) =>
      idx !== movingPieceIndex && p.x === q.x && p.y === q.y
    );
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

    if (state.selectedPiece == null) return;
    const legal = legalTargets(state.selectedPiece).some(p => p.x === q.x && p.y === q.y);
    if (!legal) return;

    state.undoStack.push({
      pieces: clonePieces(own),
      movesUsed: state.movesUsed,
      selectedPiece: state.selectedPiece
    });
    own[state.selectedPiece] = q;
    state.movesUsed += 1;

    if (state.movesUsed >= MOVES_PER_TURN) {
      state.selectedPiece = null;
    }
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

    state.history.push({
      player,
      turn: state.turns[player],
      a: { ...pieces[0] },
      b: { ...pieces[1] },
      score: state.players[player].score
    });

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

  function computerStep() {
    computerTimer = null;
    if (!state || state.gameOver || state.current !== COMPUTER_PLAYER) return;

    if (state.movesUsed >= MOVES_PER_TURN) {
      endTurn();
      return;
    }

    const choices = [];
    for (let pieceIndex = 0; pieceIndex < state.players.B.pieces.length; pieceIndex++) {
      for (const target of legalTargets(pieceIndex)) {
        choices.push({ pieceIndex, target });
      }
    }

    if (!choices.length) {
      // Normally unreachable on the perimeter, but avoid locking the game.
      state.movesUsed = MOVES_PER_TURN;
      render();
      computerTimer = setTimeout(() => endTurn(), COMPUTER_MOVE_DELAY);
      return;
    }

    const choice = choices[Math.floor(Math.random() * choices.length)];
    const own = state.players.B.pieces;
    state.selectedPiece = choice.pieceIndex;
    state.undoStack.push({
      pieces: clonePieces(own),
      movesUsed: state.movesUsed,
      selectedPiece: state.selectedPiece
    });
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
          ? { r: 255, g: 93, b: 114 }
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
      ui.winnerTitle.textContent = a > b ? 'PLAYER A WIN' : 'PLAYER B WIN';
    }
    ui.winnerScore.textContent = `A ${a.toFixed(2)} － ${b.toFixed(2)} B`;
    ui.winnerOverlay.classList.remove('hidden');
  }

  function renderHistory() {
    if (!state.history.length) {
      ui.history.innerHTML = '<div class="history-entry">まだ確定した線はありません。</div>';
      return;
    }
    ui.history.innerHTML = state.history.map(h =>
      `<div class="history-entry"><strong>${h.player} T${h.turn}</strong> ` +
      `(${h.a.x},${h.a.y}) ↔ (${h.b.x},${h.b.y})　score ${h.score.toFixed(2)}</div>`
    ).join('');
  }

  function updateUI() {
    const player = state.current;
    ui.scoreA.textContent = state.players.A.score.toFixed(2);
    ui.scoreB.textContent = state.players.B.score.toFixed(2);
    ui.turnsA.textContent = `${state.turns.A} / ${MAX_ROUNDS} turns`;
    ui.turnsB.textContent = `${state.turns.B} / ${MAX_ROUNDS} turns`;
    ui.panelA.classList.toggle('active', !state.gameOver && player === 'A');
    ui.panelB.classList.toggle('active', !state.gameOver && player === 'B');
    ui.roundLabel.textContent = `ROUND ${Math.min(state.round, MAX_ROUNDS)} / ${MAX_ROUNDS}`;
    ui.turnLabel.textContent = state.gameOver ? 'GAME OVER' : (player === COMPUTER_PLAYER ? 'COMPUTER のターン' : 'PLAYER A のターン');
    ui.movesLeft.textContent = String(MOVES_PER_TURN - state.movesUsed);
    ui.undoBtn.disabled = state.gameOver || player === COMPUTER_PLAYER || !state.undoStack.length;
    ui.endTurnBtn.disabled = state.gameOver || player === COMPUTER_PLAYER || state.movesUsed !== MOVES_PER_TURN;

    if (state.gameOver) {
      ui.instruction.textContent = 'ゲーム終了です。';
    } else if (player === COMPUTER_PLAYER) {
      ui.instruction.textContent = `COMPUTERが思考中です。残り${MOVES_PER_TURN - state.movesUsed} MOVEです。`;
    } else if (state.movesUsed >= MOVES_PER_TURN) {
      ui.instruction.textContent = '3 MOVE完了。「ターン終了」で現在の線を確定してください。';
    } else if (state.selectedPiece == null) {
      ui.instruction.textContent = `動かしたいPLAYER Aの駒を選んでください。残り${MOVES_PER_TURN - state.movesUsed} MOVEです。`;
    } else {
      ui.instruction.textContent = '選択中の駒を、光っている隣接点へ移動できます。';
    }
    renderHistory();
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
  ui.clearSelectionBtn.addEventListener('click', () => { if (state.current !== COMPUTER_PLAYER) { state.selectedPiece = null; render(); } });
  window.addEventListener('resize', resizeCanvas);

  resetGame();
  requestAnimationFrame(resizeCanvas);
})();
