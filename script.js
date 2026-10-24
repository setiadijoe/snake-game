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
  const levelValue = requireElement("level-value");
  const speedValue = requireElement("speed-value");
  const paceBars = requireElement("pace-bars");
  const playButton = requireElement("play-button");
  const handPreferenceStatus = requireElement("hand-preference-status");
  const gameStatus = requireElement("game-status");
  const scoreDialog = requireElement("score-dialog");
  const scoreForm = requireElement("score-form");
  const playerNameInput = requireElement("player-name");
  const gameOverScore = requireElement("game-over-score");
  const scoreDialogError = requireElement("score-dialog-error");
  const submitScoreButton = requireElement("submit-score");
  const cancelScoreButton = requireElement("cancel-score");

  const GRID_SIZE = 20;
  const CELL_SIZE = 20;
  const MAX_LEVEL = 99;
  const POINTS_PER_LEVEL = 300;
  const START_SPEED = 2;
  const SPEED_PER_LEVEL = 2;
  const HAND_PREFERENCE_KEY = "snake-game-hand-preference";
  const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || window.location.origin;
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
  let state = "ready";
  let timer = null;
  let turnLocked = false;
  const leaderboard = requireElement("leaderboard-list");
  const viewTopScoresButton = requireElement("view-top-scores");
  const highScoresDialog = requireElement("high-scores-dialog");
  const highScoresList = requireElement("high-scores-list");
  const closeHighScoresButton = requireElement("close-high-scores");
  const handOptions = document.querySelectorAll("[data-hand]");
  let highScoresCursor = "";
  let highScoresLoaded = 0;
  let highScoresLoading = false;
  let highScoresHasMore = true;

  function updateHandPreference(hand) {
    document.documentElement.dataset.controlHand = hand;
    handOptions.forEach((option) => {
      option.setAttribute("aria-pressed", String(option.dataset.hand === hand));
    });
  }

  try {
    const savedHand = window.localStorage.getItem(HAND_PREFERENCE_KEY);
    if (savedHand === "left" || savedHand === "right") updateHandPreference(savedHand);
  } catch {
    handPreferenceStatus.textContent = "Hand preference could not be loaded from this device.";
  }

  handOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const hand = option.dataset.hand;
      if (hand !== "left" && hand !== "right") return;
      updateHandPreference(hand);
      try {
        window.localStorage.setItem(HAND_PREFERENCE_KEY, hand);
        handPreferenceStatus.textContent = "";
      } catch {
        handPreferenceStatus.textContent = "Hand preference could not be saved on this device.";
      }
    });
  });

  function clearTimer() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
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
    const level = currentLevel();
    levelValue.textContent = String(level).padStart(2, "0");
    speedValue.textContent = speedForLevel(level).toFixed(1);
    paceBars.replaceChildren();
    for (let index = 0; index < 8; index += 1) {
      const bar = document.createElement("i");
      if (index < Math.ceil(level / MAX_LEVEL * 8)) bar.classList.add("active");
      paceBars.append(bar);
    }
  }

  function renderScores(list, scores) {
    list.replaceChildren();
    if (scores.length === 0) {
      const emptyMessage = document.createElement("li");
      emptyMessage.className = "leaderboard-message";
      emptyMessage.textContent = "No scores yet. Be the first!";
      list.append(emptyMessage);
      return;
    }

    appendScores(list, scores, 0);
  }

  function appendScores(list, scores, startIndex) {
    for (const [index, entry] of scores.entries()) {
      const row = document.createElement("li");
      const rank = document.createElement("span");
      const name = document.createElement("span");
      const value = document.createElement("span");
      rank.className = "leaderboard-rank";
      name.className = "leaderboard-name";
      value.className = "leaderboard-score";
      rank.textContent = `${String(startIndex + index + 1).padStart(2, "0")}.`;
      name.textContent = entry.name;
      value.textContent = formatScore(entry.score);
      row.append(rank, name, value);
      list.append(row);
    }
  }

  async function loadScores() {
    const requestUrl = new URL("/api/scores", API_BASE_URL);
    const response = await fetch(requestUrl);
    if (!response.ok) throw new Error(`Unable to load scores (${response.status})`);
    const page = await response.json();
    renderScores(leaderboard, page.scores);
  }

  async function loadHighScores() {
    highScoresList.replaceChildren();
    highScoresCursor = "";
    highScoresLoaded = 0;
    highScoresHasMore = true;
    const loadingMessage = document.createElement("li");
    loadingMessage.className = "leaderboard-message";
    loadingMessage.textContent = "Loading scores...";
    highScoresList.append(loadingMessage);
    await loadNextHighScores();
  }

  async function loadNextHighScores() {
    if (highScoresLoading || !highScoresHasMore) return;
    highScoresLoading = true;
    viewTopScoresButton.disabled = true;
    try {
      const requestUrl = new URL("/api/scores", API_BASE_URL);
      requestUrl.searchParams.set("limit", "10");
      if (highScoresCursor) requestUrl.searchParams.set("cursor", highScoresCursor);
      const response = await fetch(requestUrl);
      if (!response.ok) throw new Error(`Unable to load scores (${response.status})`);
      const page = await response.json();
      if (highScoresLoaded === 0) {
        renderScores(highScoresList, page.scores);
      } else {
        appendScores(highScoresList, page.scores, highScoresLoaded);
      }
      highScoresLoaded += page.scores.length;
      highScoresCursor = page.nextCursor;
      highScoresHasMore = Boolean(page.nextCursor);
    } catch (error) {
      if (highScoresLoaded === 0) highScoresList.replaceChildren();
      const errorMessage = document.createElement("li");
      errorMessage.className = "leaderboard-message";
      errorMessage.textContent = `Unable to load scores: ${error.message}`;
      highScoresList.append(errorMessage);
    } finally {
      viewTopScoresButton.disabled = false;
      highScoresLoading = false;
    }
  }

  function openScoreDialog() {
    scoreForm.reset();
    gameOverScore.value = String(score);
    gameOverScore.textContent = String(score);
    scoreDialogError.hidden = true;
    scoreDialogError.textContent = "";
    scoreDialog.showModal();
    playerNameInput.focus();
  }

  async function saveGameOverScore(event) {
    event.preventDefault();
    const name = playerNameInput.value.trim();
    if (!name || name.length > 30) {
      playerNameInput.setCustomValidity("Enter a name with 1 to 30 characters.");
      playerNameInput.reportValidity();
      return;
    }
    playerNameInput.setCustomValidity("");
    submitScoreButton.disabled = true;
    cancelScoreButton.disabled = true;
    scoreDialogError.hidden = true;
    try {
      const response = await fetch(new URL("/api/scores", API_BASE_URL), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, score })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Unable to save score (${response.status})`);
      gameStatus.textContent = `Score ${score} saved for ${result.name}.`;
      scoreDialog.close();
      loadScores().catch((error) => {
        gameStatus.textContent = `Score saved, but unable to refresh scores: ${error.message}`;
      });
    } catch (error) {
      scoreDialogError.textContent = `Unable to save score: ${error.message}`;
      scoreDialogError.hidden = false;
    } finally {
      submitScoreButton.disabled = false;
      cancelScoreButton.disabled = false;
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

  function currentLevel() {
    return Math.min(MAX_LEVEL, Math.floor(score / POINTS_PER_LEVEL) + 1);
  }

  function speedForLevel(level) {
    return START_SPEED + (level - 1) * SPEED_PER_LEVEL;
  }

  function tickDuration() {
    return 1000 / speedForLevel(currentLevel());
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
    if (nextState === "over") openScoreDialog();
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
  scoreForm.addEventListener("submit", (event) => {
    void saveGameOverScore(event);
  });
  playerNameInput.addEventListener("input", () => playerNameInput.setCustomValidity(""));
  cancelScoreButton.addEventListener("click", () => {
    scoreDialog.close();
    gameStatus.textContent = "Score not saved.";
  });
  scoreDialog.addEventListener("cancel", () => {
    gameStatus.textContent = "Score not saved.";
  });
  scoreDialog.addEventListener("close", () => {
    if (state === "over") playButton.focus();
  });
  viewTopScoresButton.addEventListener("click", () => {
    highScoresDialog.showModal();
    void loadHighScores();
  });
  highScoresList.addEventListener("scroll", () => {
    if (highScoresList.scrollTop + highScoresList.clientHeight >= highScoresList.scrollHeight - 48) {
      void loadNextHighScores();
    }
  });
  closeHighScoresButton.addEventListener("click", () => highScoresDialog.close());
  highScoresDialog.addEventListener("close", () => {
    viewTopScoresButton.focus();
  });

  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => requestDirection(button.dataset.direction || ""));
  });

  document.addEventListener("keydown", (event) => {
    if (
      scoreDialog.open ||
      highScoresDialog.open ||
      (event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable='true']"))
    ) {
      return;
    }

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const directionName = KEY_DIRECTIONS[key];
    if (directionName) {
      event.preventDefault();
      requestDirection(directionName);
      return;
    }
    if (key === "p") {
      event.preventDefault();
      if (!event.repeat) startOrToggle();
      return;
    }
    if (key === " ") {
      event.preventDefault();
      if (!event.repeat) togglePause();
    }
  });

  window.addEventListener("resize", draw);
  if ("ResizeObserver" in window) new ResizeObserver(draw).observe(canvas);
  resetGame();
  loadScores().catch((error) => {
    leaderboard.replaceChildren();
    const message = document.createElement("li");
    message.className = "leaderboard-message";
    message.textContent = `Unable to load scores: ${error.message}`;
    leaderboard.append(message);
  });
})();
