(() => {
  'use strict';

  const GRID = 10;
  const POINTS = GRID + 1;
  const MOVES_PER_TURN = 3;
  const MAX_ROUNDS = 50; // 仮仕様: 各プレイヤー50ターン
  const ALLOW_DIAGONAL = true;

  const COLORS = {
    A: '#37a8ff',
    B: '#ff5d72',
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
          pieces: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
          segments: [{ a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, initial: true }],
          score: 0
        },
        B: {
          pieces: [{ x: 0, y: 10 }, { x: 10, y: 0 }],
          segments: [{ a: { x: 0, y: 10 }, b: { x: 10, y: 0 }, initial: true }],
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

    drawGrid();
    drawSegments('A');
    drawSegments('B');
    drawCurrentLine();
    drawMoveHints();
    drawPieces('A');
    drawPieces('B');
  }

  function drawGrid() {
    ctx.save();
    for (let i = 0; i <= GRID; i++) {
      const x = view.pad + i * view.cell;
      const y = view.pad + i * view.cell;
      ctx.strokeStyle = (i === 0 || i === GRID) ? COLORS.gridStrong : COLORS.grid;
      ctx.lineWidth = (i === 0 || i === GRID) ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(x, view.pad);
      ctx.lineTo(x, view.pad + GRID * view.cell);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(view.pad, y);
      ctx.lineTo(view.pad + GRID * view.cell, y);
      ctx.stroke();
    }

    // dots
    for (let x = 0; x <= GRID; x++) {
      for (let y = 0; y <= GRID; y++) {
        const p = ptToPx({ x, y });
        ctx.fillStyle = '#728096';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.7, view.cell * .032), 0, Math.PI * 2);
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

      ctx.fillStyle = '#081018';
      ctx.font = `900 ${Math.max(10, r * .95)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), c.x, c.y + .5);
      ctx.restore();
    });
  }

  function legalTargets(pieceIndex) {
    const p = state.players[state.current].pieces[pieceIndex];
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (!ALLOW_DIAGONAL && dx !== 0 && dy !== 0) continue;
        const q = { x: p.x + dx, y: p.y + dy };
        if (q.x < 0 || q.x > GRID || q.y < 0 || q.y > GRID) continue;
        if (isOccupied(q)) continue;
        out.push(q);
      }
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

  function isOccupied(q) {
    for (const player of ['A', 'B']) {
      for (const p of state.players[player].pieces) {
        if (p.x === q.x && p.y === q.y) return true;
      }
    }
    return false;
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
    if (state.gameOver || state.movesUsed >= MOVES_PER_TURN) return;
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
    if (!state.undoStack.length || state.gameOver) return;
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
    state.turns[player] += 1;
    state.players[player].score = calculateArea(player);

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
  }

  // Approximate enclosed area by rasterizing only that player's line network
  // onto an expanded plane. The field boundary is NOT treated as a wall,
  // so only loops made by the player's own lines count.
  function calculateArea(player) {
    const SCALE = 48;           // pixels per board unit
    const MARGIN = SCALE * 2;   // lets flood-fill go around the board edge
    const W = GRID * SCALE + MARGIN * 2 + 1;
    const H = W;
    const oc = document.createElement('canvas');
    oc.width = W;
    oc.height = H;
    const ox = oc.getContext('2d', { willReadFrequently: true });
    ox.clearRect(0, 0, W, H);
    ox.strokeStyle = '#000';
    ox.lineWidth = 2.2;
    ox.lineCap = 'round';
    ox.lineJoin = 'round';

    const map = p => ({
      x: MARGIN + p.x * SCALE,
      y: MARGIN + (GRID - p.y) * SCALE
    });

    for (const seg of state.players[player].segments) {
      const a = map(seg.a), b = map(seg.b);
      ox.beginPath();
      ox.moveTo(a.x, a.y);
      ox.lineTo(b.x, b.y);
      ox.stroke();
    }

    const img = ox.getImageData(0, 0, W, H).data;
    const blocked = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < img.length; i += 4, p++) {
      if (img[i + 3] > 16) blocked[p] = 1;
    }

    const seen = new Uint8Array(W * H);
    const qx = new Int32Array(W * H);
    const qy = new Int32Array(W * H);
    let head = 0, tail = 0;

    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const idx = y * W + x;
      if (blocked[idx] || seen[idx]) return;
      seen[idx] = 1;
      qx[tail] = x;
      qy[tail] = y;
      tail++;
    };

    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let y = 1; y < H - 1; y++) { push(0, y); push(W - 1, y); }

    while (head < tail) {
      const x = qx[head], y = qy[head];
      head++;
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }

    const x0 = MARGIN;
    const y0 = MARGIN;
    const x1 = MARGIN + GRID * SCALE;
    const y1 = y0 + GRID * SCALE;
    let enclosed = 0;
    for (let y = y0; y < y1; y++) {
      let idx = y * W + x0;
      for (let x = x0; x < x1; x++, idx++) {
        if (!blocked[idx] && !seen[idx]) enclosed++;
      }
    }

    return enclosed / (SCALE * SCALE);
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
    ui.turnLabel.textContent = state.gameOver ? 'GAME OVER' : `PLAYER ${player} のターン`;
    ui.movesLeft.textContent = String(MOVES_PER_TURN - state.movesUsed);
    ui.undoBtn.disabled = state.gameOver || !state.undoStack.length;
    ui.endTurnBtn.disabled = state.gameOver || state.movesUsed !== MOVES_PER_TURN;

    if (state.gameOver) {
      ui.instruction.textContent = 'ゲーム終了です。';
    } else if (state.movesUsed >= MOVES_PER_TURN) {
      ui.instruction.textContent = '3 MOVE完了。「ターン終了」で現在の線を確定してください。';
    } else if (state.selectedPiece == null) {
      ui.instruction.textContent = `動かしたいPLAYER ${player}の駒を選んでください。残り${MOVES_PER_TURN - state.movesUsed} MOVEです。`;
    } else {
      ui.instruction.textContent = `駒${state.selectedPiece + 1}を選択中。光っている隣接点へ移動できます。`;
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
  ui.clearSelectionBtn.addEventListener('click', () => { state.selectedPiece = null; render(); });
  window.addEventListener('resize', resizeCanvas);

  resetGame();
  requestAnimationFrame(resizeCanvas);
})();
