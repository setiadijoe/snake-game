(() => {
  function requireElement(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing required game element: #${id}`);
    return element;
  }

  const canvas = requireElement("game-board");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D rendering is unavailable");
  const overlay = requireElement("screen-overlay");
  const overlayTitle = requireElement("overlay-title");
  const overlayCaption = requireElement("overlay-caption");
  const scoreValue = requireElement("score-value");
  const bestValue = requireElement("best-value");
  const paceValue = requireElement("pace-value");
  const paceBars = requireElement("pace-bars");
  const playButton = requireElement("play-button");
  const newGameButton = requireElement("new-game-button");
  const gameStatus = requireElement("game-status");

  const GRID_SIZE = 20;
  const CELL_SIZE = 20;
  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }
  };
  const KEY_DIRECTIONS = {
    ArrowUp: "up", w: "up",
    ArrowRight: "right", d: "right",
    ArrowDown: "down", s: "down",
    ArrowLeft: "left", a: "left"
  };
  const COLORS = {
    background: "#bacd92",
    grid: "rgba(37, 54, 38, 0.08)",
    snake: "#253626",
    head: "#17271d",
    eye: "#bacd92",
    food: "#c64e36",
    leaf: "#536a42"
  };

  let snake = [];
  let direction = DIRECTIONS.right;
  let food = null;
  let score = 0;
  let bestScore = loadBestScore();
  let state = "ready";
  let timer = null;
  let turnLocked = false;

  function clearTimer() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  function loadBestScore() {
    try {
      return Number.parseInt(localStorage.getItem("pocket-arcade-snake-best") || "0", 10) || 0;
    } catch {
      return 0;
    }
  }

  function saveBestScore(value) {
    try {
      localStorage.setItem("pocket-arcade-snake-best", String(value));
    } catch {
      // The game remains playable when storage is unavailable.
    }
  }

  function createSnake() {
    return [
      { x: 9, y: 10 },
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 }
    ];
  }

  function spawnFood() {
    const openCells = [];
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (!snake.some((segment) => segment.x === x && segment.y === y)) {
          openCells.push({ x, y });
        }
      }
    }
    if (openCells.length === 0) return null;
    return openCells[Math.floor(Math.random() * openCells.length)];
  }

  function formatScore(value) {
    return String(value).padStart(3, "0");
  }

  function updateScoreboard() {
    scoreValue.value = formatScore(score);
    scoreValue.textContent = formatScore(score);
    bestValue.value = formatScore(bestScore);
    bestValue.textContent = formatScore(bestScore);
    const pace = 1 + Math.floor(score / 50);
    paceValue.textContent = String(pace).padStart(2, "0");
    paceBars.replaceChildren();
    for (let index = 0; index < 8; index += 1) {
      const bar = document.createElement("i");
      if (index < Math.min(pace, 8)) bar.classList.add("active");
      paceBars.append(bar);
    }
  }

  function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    const pixelSize = Math.max(1, Math.round(bounds.width * window.devicePixelRatio));
    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize;
      canvas.height = pixelSize;
    }
    context.setTransform(pixelSize / (GRID_SIZE * CELL_SIZE), 0, 0, pixelSize / (GRID_SIZE * CELL_SIZE), 0, 0);
  }

  function drawSnakeSegment(segment, isHead) {
    const inset = isHead ? 2 : 3;
    const x = segment.x * CELL_SIZE + inset;
    const y = segment.y * CELL_SIZE + inset;
    const size = CELL_SIZE - inset * 2;
    context.fillStyle = isHead ? COLORS.head : COLORS.snake;
    context.fillRect(x, y, size, size);

    if (isHead) {
      context.fillStyle = COLORS.eye;
      let eyes;
      if (direction.x === 1) eyes = [[12, 5], [12, 12]];
      else if (direction.x === -1) eyes = [[5, 5], [5, 12]];
      else if (direction.y === -1) eyes = [[5, 5], [12, 5]];
      else eyes = [[5, 12], [12, 12]];
      for (const [eyeX, eyeY] of eyes) {
        context.fillRect(segment.x * CELL_SIZE + eyeX, segment.y * CELL_SIZE + eyeY, 2, 2);
      }
    }
  }

  function drawFood() {
    if (!food) return;
    const originX = food.x * CELL_SIZE;
    const originY = food.y * CELL_SIZE;
    context.fillStyle = COLORS.food;
    context.fillRect(originX + 5, originY + 7, 10, 9);
    context.fillRect(originX + 7, originY + 5, 6, 13);
    context.fillStyle = COLORS.leaf;
    context.fillRect(originX + 11, originY + 3, 5, 3);
    context.fillRect(originX + 9, originY + 5, 3, 2);
  }

  function draw() {
    resizeCanvas();
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE);
    context.strokeStyle = COLORS.grid;
    context.lineWidth = 1;
    for (let index = 1; index < GRID_SIZE; index += 1) {
      const position = index * CELL_SIZE + 0.5;
      context.beginPath();
      context.moveTo(position, 0);
      context.lineTo(position, GRID_SIZE * CELL_SIZE);
      context.stroke();
      context.beginPath();
      context.moveTo(0, position);
      context.lineTo(GRID_SIZE * CELL_SIZE, position);
      context.stroke();
    }
    drawFood();
    snake.forEach((segment, index) => drawSnakeSegment(segment, index === 0));
  }

  function setOverlay(title, caption) {
    overlayTitle.textContent = title;
    overlayCaption.textContent = caption;
    overlay.hidden = !title;
  }

  function updateControls() {
    if (state === "running") {
      playButton.textContent = "PAUSE";
      setOverlay("", "");
    } else if (state === "paused") {
      playButton.textContent = "RESUME";
      setOverlay("PAUSED", "");
    } else if (state === "over") {
      playButton.textContent = "PLAY AGAIN";
      setOverlay("GAME OVER", "SCORE " + formatScore(score));
    } else if (state === "won") {
      playButton.textContent = "PLAY AGAIN";
      setOverlay("GRID CLEARED", "NICE WORK");
    } else {
      playButton.textContent = "START";
      setOverlay("READY?", "INSERT COIN");
    }
    const announcements = {
      ready: "Ready to play",
      running: "Game started",
      paused: "Game paused",
      over: "Game over. Score " + score,
      won: "Grid cleared. You win."
    };
    gameStatus.textContent = announcements[state];
  }

  function tickDuration() {
    return Math.max(72, 160 - Math.floor(score / 50) * 10);
  }

  function startGame() {
    if (state === "over" || state === "won") resetGame();
    state = "running";
    updateControls();
    clearTimer();
    timer = window.setInterval(advance, tickDuration());
    draw();
  }

  function pauseGame() {
    if (state !== "running") return;
    clearTimer();
    state = "paused";
    updateControls();
  }

  function togglePause() {
    if (state === "running") pauseGame();
    else if (state === "paused") startGame();
  }

  function resetGame() {
    clearTimer();
    snake = createSnake();
    direction = DIRECTIONS.right;
    food = spawnFood();
    score = 0;
    turnLocked = false;
    state = "ready";
    updateScoreboard();
    updateControls();
    draw();
  }

  function endGame(nextState) {
    clearTimer();
    turnLocked = false;
    state = nextState;
    updateControls();
    draw();
  }

  function advance() {
    if (!food) {
      endGame("won");
      return;
    }
    const head = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y
    };
    const eating = head.x === food.x && head.y === food.y;
    const collisionBody = eating ? snake : snake.slice(0, -1);
    const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID_SIZE || head.y >= GRID_SIZE;
    const hitSnake = collisionBody.some((segment) => segment.x === head.x && segment.y === head.y);

    if (hitWall || hitSnake) {
      endGame("over");
      return;
    }

    snake.unshift(head);
    if (eating) {
      score += 10;
      if (score > bestScore) {
        bestScore = score;
        saveBestScore(bestScore);
      }
      food = spawnFood();
      updateScoreboard();
      if (!food) {
        endGame("won");
        return;
      }
      clearTimer();
      timer = window.setInterval(advance, tickDuration());
    } else {
      snake.pop();
    }

    turnLocked = false;
    draw();
  }

  function requestDirection(name) {
    if (state === "paused" || state === "over" || state === "won" || turnLocked) return;
    const nextDirection = DIRECTIONS[name];
    if (!nextDirection) return;
    if (nextDirection.x === direction.x && nextDirection.y === direction.y) return;
    if (nextDirection.x === -direction.x && nextDirection.y === -direction.y) return;
    direction = nextDirection;
    turnLocked = true;
    if (state === "ready") startGame();
  }

  function startOrToggle() {
    if (state === "running") pauseGame();
    else startGame();
  }

  playButton.addEventListener("click", startOrToggle);
  newGameButton.addEventListener("click", () => {
    resetGame();
    startGame();
  });

  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => requestDirection(button.dataset.direction || ""));
  });

  document.addEventListener("keydown", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const directionName = KEY_DIRECTIONS[key];
    if (directionName) {
      event.preventDefault();
      requestDirection(directionName);
      return;
    }
    if (key === " " || key === "p") {
      event.preventDefault();
      if (!event.repeat) togglePause();
    }
  });

  window.addEventListener("resize", draw);
  if ("ResizeObserver" in window) new ResizeObserver(draw).observe(canvas);
  bestValue.value = formatScore(bestScore);
  bestValue.textContent = formatScore(bestScore);
  resetGame();
})();
