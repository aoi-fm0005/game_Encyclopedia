(function () {
    'use strict';

    const canvas = document.getElementById('aim-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const startButton = document.getElementById('start-button');
    const stopButton = document.getElementById('stop-button');
    const difficultySelect = document.getElementById('difficulty-select');
    const difficultyDataElement = document.getElementById('difficulty-data');
    const targetAssetsElement = document.getElementById('target-assets');
    const audioAssetsElement = document.getElementById('audio-assets');
    const backgroundAssetsElement = document.getElementById('background-assets');
    const statusElement = document.getElementById('game-status');
    const finishBanner = document.getElementById('finish-banner');
    const countdownOverlay = document.getElementById('countdown-overlay');

    if (!canvas || !ctx || !startButton || !stopButton || !difficultySelect || !difficultyDataElement || !statusElement || !finishBanner) {
        console.warn('AIM Trainer: required DOM elements are missing.');
        return;
    }

    if (!countdownOverlay) {
        console.warn('AIM Trainer: countdown overlay element is missing.');
    }

    const hud = {
        score: document.getElementById('score'),
        kills: document.getElementById('kills'),
        accuracy: document.getElementById('accuracy'),
        avgTtk: document.getElementById('avg-ttk'),
        maxCombo: document.getElementById('max-combo'),
        misses: document.getElementById('misses'),
        timeRemaining: document.getElementById('time-remaining'),
    };

    if (Object.values(hud).some((node) => !node)) {
        console.warn('AIM Trainer: HUD elements are missing.');
        return;
    }

    function parseJsonScript(element) {
        if (!element) {
            return {};
        }
        try {
            return JSON.parse(element.textContent || '{}');
        } catch (error) {
            console.error('Failed to parse JSON script element:', error);
            return {};
        }
    }

    const difficultyPresets = parseJsonScript(difficultyDataElement);
    const targetAssetPaths = parseJsonScript(targetAssetsElement);
    const audioAssetPaths = parseJsonScript(audioAssetsElement);
    const backgroundData = parseJsonScript(backgroundAssetsElement);

    const backgroundStages = Array.isArray(backgroundData.stages)
        ? backgroundData.stages
              .map((stage) => ({
                  threshold: Number(stage.threshold) || 0,
                  url: typeof stage.image === 'string' ? stage.image : '',
              }))
              .filter((stage) => stage.url)
              .sort((a, b) => a.threshold - b.threshold)
        : [];

    if (backgroundStages.length === 0) {
        backgroundStages.push({ threshold: 0, url: '' });
    }

    const audioVolumePresets = { hit: 0.35, critical: 0.5, miss: 0.3, finish: 0.6, countdown: 0.5 };
    const targetImages = {};
    const sounds = {};
    const effects = [];
    const RESULTS_STORAGE_KEY = 'aimTrainerResults';
    const RECENT_RESULTS_LIMIT = 10;

    const GAME_DURATION_MS = 60_000;
    const COUNTDOWN_VALUES = ['3', '2', '1'];
    const COUNTDOWN_INTERVAL_MS = 1000;

    const metrics = {
        score: 0,
        kills: 0,
        misses: 0,
        streak: 0,
        maxCombo: 0,
        totalKillTime: 0,
    };

    const state = {
        running: false,
        presetKey: null,
        preset: null,
        activeTargets: [],
        animationFrameId: null,
        nextSpawnAt: 0,
        lastFrameTime: 0,
        startTime: 0,
        endTime: 0,
        sessionId: 0,
        submissionInProgress: false,
        assetsReady: false,
        currentBackgroundIndex: null,
        countdownActive: false,
        countdownTimeouts: [],
        pendingPresetKey: null,
        pendingPreset: null,
    };

    function loadStoredResults() {
        if (typeof window === 'undefined' || !window.localStorage) {
            return [];
        }
        try {
            const raw = window.localStorage.getItem(RESULTS_STORAGE_KEY);
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                return [];
            }
            return parsed
                .map((entry) => ({
                    played_at: entry.played_at || new Date().toISOString(),
                    difficulty: entry.difficulty || 'unknown',
                    score: Number(entry.score) || 0,
                    kills: Number(entry.kills) || 0,
                    accuracy: Number(entry.accuracy) || 0,
                    avg_ttk: Number(entry.avg_ttk) || 0,
                    max_combo: Number(entry.max_combo) || 0,
                    misses: Number(entry.misses) || 0,
                }))
                .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());
        } catch (error) {
            console.error('Failed to load stored results:', error);
            return [];
        }
    }

    function saveStoredResults(results) {
        if (typeof window === 'undefined' || !window.localStorage) {
            return;
        }
        try {
            window.localStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(results));
        } catch (error) {
            console.error('Failed to save results:', error);
        }
    }

    function renderRecentResults(results) {
        const tbody = document.getElementById('recent-results-body');
        if (!tbody) {
            return;
        }

        tbody.innerHTML = '';
        if (!results || results.length === 0) {
            const emptyRow = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 8;
            cell.textContent = 'No games played yet.';
            emptyRow.appendChild(cell);
            tbody.appendChild(emptyRow);
            return;
        }

        for (const result of results) {
            const row = document.createElement('tr');
            const values = [
                new Date(result.played_at).toLocaleString(),
                String(result.difficulty),
                String(result.score),
                String(result.kills),
                Number(result.accuracy).toFixed(1) + '%',
                Number(result.avg_ttk).toFixed(0) + ' ms',
                String(result.max_combo),
                String(result.misses),
            ];
            for (const value of values) {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.appendChild(cell);
            }
            tbody.appendChild(row);
        }
    }

    /** === Background Wiggle (slow pan) === */
const bgWiggle = {
  enabled: true,
  centerX: 50,   // % 基準位置（横）
  centerY: 50,   // % 基準位置（縦）
  ampX: 8,       // % 横の振れ幅（808x1440なら小さめ推奨）
  ampY: 50,    // % 縦の振れ幅（縦長なので大きめOK）
  freqX: 0.03,   // 1秒あたりの周回数（=0.03で約33秒/周）
  freqY: 0.25    // 0.02で約50秒/周
};
let bgWiggleRaf = null;
let bgWiggleT0  = performance.now();

function cancelBgWiggle(){
  if (bgWiggleRaf) { cancelAnimationFrame(bgWiggleRaf); bgWiggleRaf = null; }
}

function wiggleTick(now){
  if (!bgWiggle.enabled) return;
  const t = (now - bgWiggleT0) / 1000; // sec
  const x = bgWiggle.centerX + Math.sin(t * 2 * Math.PI * bgWiggle.freqX) * bgWiggle.ampX;
  const y = bgWiggle.centerY + Math.sin(t * 2 * Math.PI * bgWiggle.freqY + Math.PI/3) * bgWiggle.ampY;
  canvas.style.backgroundPosition = `${x}% ${y}%`;
  bgWiggleRaf = requestAnimationFrame(wiggleTick);
}

function startBgWiggle(){
  cancelBgWiggle();
  bgWiggleT0 = performance.now();
  bgWiggleRaf = requestAnimationFrame(wiggleTick);
}


    applyBackground(0, { skipEffect: true });
    hideFinishBanner();

    function setStatus(message, tone = 'info') {
        statusElement.textContent = message;
        statusElement.dataset.tone = tone;
    }

    function showFinishBanner() {
        finishBanner.classList.add('is-visible');
        finishBanner.setAttribute('aria-hidden', 'false');
    }

    function hideFinishBanner() {
        finishBanner.classList.remove('is-visible');
        finishBanner.setAttribute('aria-hidden', 'true');
    }

    function showCountdown(value) {
        if (!countdownOverlay) {
            return;
        }
        countdownOverlay.textContent = value;
        countdownOverlay.classList.add('is-visible');
        countdownOverlay.setAttribute('aria-hidden', 'false');
    }

    function hideCountdown() {
        if (!countdownOverlay) {
            return;
        }
        countdownOverlay.classList.remove('is-visible');
        countdownOverlay.setAttribute('aria-hidden', 'true');
        countdownOverlay.textContent = '';
    }

    function clearCountdownTimers() {
        for (const id of state.countdownTimeouts) {
            clearTimeout(id);
        }
        state.countdownTimeouts.length = 0;
    }

    function cancelCountdown(options = {}) {
        if (!state.countdownActive) {
            return;
        }
        state.countdownActive = false;
        clearCountdownTimers();
        hideCountdown();
        state.pendingPresetKey = null;
        state.pendingPreset = null;
        if (options.updateStatus) {
            setStatus('Countdown cancelled.', options.tone || 'warning');
        }
        startButton.disabled = false;
        stopButton.disabled = true;
    }

    function startCountdown() {
        if (state.running || state.countdownActive) {
            return;
        }

        const presetKey = difficultySelect.value;
        const preset = difficultyPresets[presetKey];
        if (!preset) {
            setStatus('Select a valid difficulty to start.', 'error');
            return;
        }

        state.countdownActive = true;
        state.pendingPresetKey = presetKey;
        state.pendingPreset = preset;
        clearCountdownTimers();
        setStatus('Get ready...', 'info');

        startButton.disabled = true;
        stopButton.disabled = false;

        if (!countdownOverlay) {
            state.countdownActive = false;
            state.pendingPresetKey = null;
            state.pendingPreset = null;
            startGame(presetKey, preset);
            return;
        }

        let stepIndex = 0;

        const runStep = () => {
            if (!state.countdownActive) {
                return;
            }
            showCountdown(COUNTDOWN_VALUES[stepIndex]);
            playSound('countdown');
            stepIndex += 1;

            if (stepIndex < COUNTDOWN_VALUES.length) {
                const id = setTimeout(runStep, COUNTDOWN_INTERVAL_MS);
                state.countdownTimeouts.push(id);
                return;
            }

            const startId = setTimeout(() => {
                if (!state.countdownActive) {
                    return;
                }
                state.countdownActive = false;
                clearCountdownTimers();
                hideCountdown();
                const key = state.pendingPresetKey;
                const nextPreset = state.pendingPreset;
                state.pendingPresetKey = null;
                state.pendingPreset = null;
                startGame(key, nextPreset);
            }, COUNTDOWN_INTERVAL_MS);
            state.countdownTimeouts.push(startId);
        };

        runStep();
    }

    function preloadImages() {
        const entries = Object.entries(targetAssetPaths);
        if (entries.length === 0) {
            return Promise.resolve();
        }

        const jobs = entries.map(([key, src]) => new Promise((resolve) => {
            const image = new Image();
            image.addEventListener('load', () => {
                targetImages[key] = image;
                resolve(null);
            }, { once: true });
            image.addEventListener('error', () => {
                console.warn('Failed to load target asset for ' + key + ' at ' + src);
                resolve(null);
            }, { once: true });
            image.src = src;
        }));

        return Promise.all(jobs).then(() => undefined);
    }

    function preloadAudio() {
        const entries = Object.entries(audioAssetPaths);
        if (entries.length === 0) {
            return Promise.resolve();
        }

        const jobs = entries.map(([key, src]) => new Promise((resolve) => {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.volume = audioVolumePresets[key] ?? 0.4;
            audio.addEventListener('canplaythrough', () => {
                sounds[key] = audio;
                resolve(null);
            }, { once: true });
            audio.addEventListener('error', () => {
                console.warn('Failed to load audio asset for ' + key + ' at ' + src);
                resolve(null);
            }, { once: true });
            audio.src = src;
        }));

        return Promise.all(jobs).then(() => undefined);
    }

    Promise.all([preloadImages(), preloadAudio()])
        .then(() => {
            state.assetsReady = true;
            updateBackgroundForKills();
            setStatus('Assets ready. Click start when you are ready.', 'info');
        })
        .catch((error) => {
            console.error('Asset preload failed:', error);
            setStatus('Asset preload failed. You can still play using fallback graphics.', 'warning');
        });

    function resetMetrics() {
        metrics.score = 0;
        metrics.kills = 0;
        metrics.misses = 0;
        metrics.streak = 0;
        metrics.maxCombo = 0;
        metrics.totalKillTime = 0;
    }

    function updateHud(timestamp) {
        const now = timestamp !== undefined ? timestamp : performance.now();

        hud.score.textContent = String(Math.round(metrics.score));
        hud.kills.textContent = String(metrics.kills);
        hud.misses.textContent = String(metrics.misses);
        hud.maxCombo.textContent = String(metrics.maxCombo);

        const attempts = metrics.kills + metrics.misses;
        const accuracy = attempts === 0 ? 0 : (metrics.kills / attempts) * 100;
        hud.accuracy.textContent = accuracy.toFixed(1) + '%';

        const avgTtk = metrics.kills === 0 ? 0 : metrics.totalKillTime / metrics.kills;
        hud.avgTtk.textContent = avgTtk.toFixed(0) + ' ms';

        if (state.running) {
            const remaining = Math.max(0, state.endTime - now);
            hud.timeRemaining.textContent = (remaining / 1000).toFixed(1) + ' s';
        } else {
            hud.timeRemaining.textContent = '0.0 s';
        }

        updateBackgroundForKills();
    }

    function randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    function createTarget(now) {
        const preset = state.preset;
        const radius = preset.radius;
        const x = radius + Math.random() * (canvas.width - radius * 2);
        const y = radius + Math.random() * (canvas.height - radius * 2);
        const minSpeed = preset.speed[0];
        const maxSpeed = preset.speed[1];
        const speedValue = maxSpeed <= minSpeed ? minSpeed : randomBetween(minSpeed, maxSpeed);
        const angle = Math.random() * Math.PI * 2;
        const velocityScale = speedValue / 1000;
        const vx = Math.cos(angle) * velocityScale;
        const vy = Math.sin(angle) * velocityScale;

        return {
            x,
            y,
            radius,
            vx,
            vy,
            createdAt: now,
            expiresAt: now + preset.lifetime_ms,
            preset,
            assetKey: state.presetKey,
        };
    }

    function spawnTarget(now) {
        if (!state.preset) {
            return;
        }
        state.activeTargets.push(createTarget(now));
    }

    function scheduleNextSpawn(now) {
        const interval = state.preset.spawn_interval_ms;
        state.nextSpawnAt = now + randomBetween(interval[0], interval[1]);
    }

    function spawnIfNeeded(now) {
        if (!state.preset) {
            return;
        }
        if (state.activeTargets.length >= state.preset.max_concurrent) {
            return;
        }
        if (now >= state.nextSpawnAt) {
            spawnTarget(now);
            scheduleNextSpawn(now);
        }
    }

    function updateTargets(now, deltaMs) {
        const width = canvas.width;
        const height = canvas.height;
        const survivors = [];

        for (const target of state.activeTargets) {
            target.x += target.vx * deltaMs;
            target.y += target.vy * deltaMs;

            if (target.x - target.radius <= 0 || target.x + target.radius >= width) {
                target.vx *= -1;
                target.x = Math.min(Math.max(target.radius, target.x), width - target.radius);
            }
            if (target.y - target.radius <= 0 || target.y + target.radius >= height) {
                target.vy *= -1;
                target.y = Math.min(Math.max(target.radius, target.y), height - target.radius);
            }

            if (now >= target.expiresAt) {
                metrics.misses += 1;
                metrics.streak = 0;
                playSound('miss');
                continue;
            }

            survivors.push(target);
        }

        state.activeTargets = survivors;
    }

    function renderScene(now) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const target of state.activeTargets) {
            const image = targetImages[target.assetKey];
            if (state.assetsReady && image && image.complete) {
                const diameter = target.radius * 2;
                ctx.drawImage(image, target.x - target.radius, target.y - target.radius, diameter, diameter);
            } else {
                ctx.beginPath();
                ctx.fillStyle = '#f44336';
                ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
                ctx.fill();

                ctx.beginPath();
                ctx.fillStyle = '#ffffff';
                ctx.arc(target.x, target.y, target.preset.critical_threshold_px, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        renderEffects(now);
    }

    function renderEffects(now) {
        if (effects.length === 0) {
            return;
        }

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        const survivors = [];

        for (const effect of effects) {
            const progress = (now - effect.startTime) / effect.duration;
            if (progress >= 1) {
                continue;
            }

            const eased = Math.min(Math.max(progress, 0), 1);
            const alpha = (1 - eased) * 0.6;
            const maxRadius = Math.max(canvas.width, canvas.height) * 0.6;
            const radius = effect.baseRadius + maxRadius * eased;

            ctx.globalAlpha = alpha;
            ctx.lineWidth = 6 * (1 - eased);
            ctx.strokeStyle = effect.stroke;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.stroke();

            for (const shard of effect.shards) {
                const shardRadius = radius * shard.scale;
                const angle = shard.angle + eased * shard.spin;
                const x = Math.cos(angle) * shardRadius;
                const y = Math.sin(angle) * shardRadius;
                ctx.fillStyle = shard.fill;
                ctx.globalAlpha = alpha * 0.8;
                ctx.beginPath();
                ctx.arc(x, y, shard.size * (1 - eased * 0.5), 0, Math.PI * 2);
                ctx.fill();
            }

            survivors.push(effect);
        }

        ctx.restore();
        effects.length = 0;
        effects.push(...survivors);
    }

    function spawnBackgroundSwapEffect() {
        const now = performance.now();
        const shards = [];
        const shardCount = 24;
        for (let i = 0; i < shardCount; i += 1) {
            shards.push({
                angle: (Math.PI * 2 * i) / shardCount,
                spin: (Math.random() - 0.5) * Math.PI,
                scale: 0.25 + Math.random() * 0.75,
                size: 8 + Math.random() * 6,
                fill: 'rgba(255, 200, 80, 1)',
            });
        }
        effects.push({
            startTime: now,
            duration: 700,
            baseRadius: Math.min(canvas.width, canvas.height) * 0.1,
            stroke: 'rgba(255, 180, 80, 1)',
            shards,
        });
    }

    function playSound(key) {
        const base = sounds[key];
        if (!base) {
            return;
        }
        try {
            const instance = base.cloneNode();
            instance.volume = base.volume;
            instance.play().catch(() => {});
        } catch (error) {
            console.debug('Unable to play sound', key, error);
        }
    }

    function updateBackgroundForKills() {
        let candidateIndex = 0;
        for (let i = 0; i < backgroundStages.length; i += 1) {
            if (metrics.kills >= backgroundStages[i].threshold) {
                candidateIndex = i;
            } else {
                break;
            }
        }

        if (state.currentBackgroundIndex === candidateIndex) {
            return;
        }

        applyBackground(candidateIndex, { skipEffect: state.currentBackgroundIndex === null });
    }

    function applyBackground(index, options = {}) {
  const stage = backgroundStages[index];
  if (!stage) {
      canvas.style.backgroundImage = '';
      state.currentBackgroundIndex = null;
      cancelBgWiggle();
      return;
  }

  if (stage.url) {
      canvas.style.backgroundImage = "url('" + stage.url + "')";
      canvas.style.backgroundSize = 'cover';
      canvas.style.backgroundRepeat = 'no-repeat';
      // 初期位置（基準）
      canvas.style.backgroundPosition = `${bgWiggle.centerX}% ${bgWiggle.centerY}%`;
      startBgWiggle();  // ← ここでゆっくり動かし始める
  } else {
      canvas.style.backgroundImage = '';
      cancelBgWiggle();
  }

  const shouldBurst = !options.skipEffect && state.currentBackgroundIndex !== null;
  state.currentBackgroundIndex = index;
  if (shouldBurst) spawnBackgroundSwapEffect();
}


    function handleShot(event) {
        if (!state.running) {
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        let hitTarget = null;
        let hitDistance = Number.POSITIVE_INFINITY;

        for (const target of state.activeTargets) {
            const dx = x - target.x;
            const dy = y - target.y;
            const distance = Math.hypot(dx, dy);
            if (distance <= target.radius && distance < hitDistance) {
                hitTarget = target;
                hitDistance = distance;
            }
        }

        if (hitTarget) {
            const now = performance.now();
            state.activeTargets = state.activeTargets.filter((candidate) => candidate !== hitTarget);

            metrics.kills += 1;
            metrics.totalKillTime += now - hitTarget.createdAt;
            metrics.streak += 1;
            metrics.maxCombo = Math.max(metrics.maxCombo, metrics.streak);

            let points = 100;
            const critical = hitDistance <= hitTarget.preset.critical_threshold_px;
            if (critical) {
                points += 50;
            }
            const multiplier = 1 + Math.floor(metrics.streak / 5) * 0.1;
            metrics.score += points * multiplier;

            scheduleNextSpawn(now);
            setStatus(critical ? 'Critical!' : 'Nice shot!', 'success');
            playSound(critical ? 'critical' : 'hit');
        } else {
            metrics.misses += 1;
            metrics.streak = 0;
            setStatus('Missed shot.', 'warning');
            playSound('miss');
        }

        const now = performance.now();
        updateHud(now);
        renderScene(now);
    }

    function stopGame(options) {
        const aborted = options && options.aborted;
        if (!state.running) {
            return;
        }

        state.countdownActive = false;
        clearCountdownTimers();
        hideCountdown();
        state.pendingPresetKey = null;
        state.pendingPreset = null;

        state.running = false;
        state.activeTargets = [];
        if (state.animationFrameId) {
            cancelAnimationFrame(state.animationFrameId);
            state.animationFrameId = null;
        }

        startButton.disabled = false;
        stopButton.disabled = true;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        updateHud(performance.now());

        if (aborted) {
            hideFinishBanner();
            setStatus('Session stopped.', 'info');
        } else {
            showFinishBanner();
            playSound('finish');
            setStatus('Session complete!', 'success');
        }

        submitResults(aborted).catch((error) => {
            console.error('Failed to submit results:', error);
            setStatus('Failed to save results.', 'error');
        });
    }

    function gameLoop(now) {
        if (!state.running) {
            return;
        }

        const delta = now - state.lastFrameTime;
        state.lastFrameTime = now;

        updateTargets(now, delta);
        spawnIfNeeded(now);
        renderScene(now);
        updateHud(now);

        if (now >= state.endTime) {
            stopGame({ aborted: false });
            return;
        }

        state.animationFrameId = requestAnimationFrame(gameLoop);
    }

    function startGame(presetKeyOverride, presetOverride) {
        if (state.running) {
            return;
        }

        const presetKey = presetKeyOverride || difficultySelect.value;
        const preset = presetOverride || difficultyPresets[presetKey];
        if (!preset) {
            setStatus('Select a valid difficulty to start.', 'error');
            startButton.disabled = false;
            stopButton.disabled = true;
            return;
        }

        resetMetrics();
        updateHud();
        effects.length = 0;
        hideFinishBanner();
        hideCountdown();
        clearCountdownTimers();

        state.countdownActive = false;
        state.pendingPresetKey = null;
        state.pendingPreset = null;

        state.running = true;
        state.presetKey = presetKey;
        state.preset = preset;
        state.activeTargets = [];
        state.sessionId = Date.now();
        state.submissionInProgress = false;

        const now = performance.now();
        state.startTime = now;
        state.endTime = now + GAME_DURATION_MS;
        state.lastFrameTime = now;
        state.nextSpawnAt = now;

        spawnTarget(now);
        scheduleNextSpawn(now);

        renderScene(now);
        setStatus('Session started. Good luck!', 'info');
        startButton.disabled = true;
        stopButton.disabled = false;

        state.animationFrameId = requestAnimationFrame(gameLoop);
    }

    async function submitResults(aborted) {
        if (state.submissionInProgress) {
            return;
        }

        const attempts = metrics.kills + metrics.misses;
        const accuracy = attempts === 0 ? 0 : (metrics.kills / attempts) * 100;
        const avgTtk = metrics.kills === 0 ? 0 : metrics.totalKillTime / metrics.kills;

        if (aborted && attempts === 0) {
            return;
        }

        state.submissionInProgress = true;

        try {
            const result = {
                id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
                score: Math.round(metrics.score),
                kills: metrics.kills,
                accuracy: Number(accuracy.toFixed(2)),
                avg_ttk: Number(avgTtk.toFixed(2)),
                max_combo: metrics.maxCombo,
                misses: metrics.misses,
                difficulty: state.presetKey || 'unknown',
                played_at: new Date().toISOString(),
            };

            const results = loadStoredResults();
            results.unshift(result);
            while (results.length > RECENT_RESULTS_LIMIT) {
                results.pop();
            }
            saveStoredResults(results);
            renderRecentResults(results);
        } finally {
            state.submissionInProgress = false;
        }
    }

    async function loadRecentResults() {
        const results = loadStoredResults();
        renderRecentResults(results);
        return results;
    }

    startButton.addEventListener('click', () => {
        if (!state.running && !state.countdownActive) {
            startCountdown();
        }
    });

    stopButton.addEventListener('click', () => {
        if (state.countdownActive) {
            cancelCountdown({ updateStatus: true, tone: 'info' });
            return;
        }
        if (state.running) {
            stopGame({ aborted: true });
        }
    });

    canvas.addEventListener('click', handleShot);

    updateHud();
    renderScene(performance.now());
    loadRecentResults();
})();
