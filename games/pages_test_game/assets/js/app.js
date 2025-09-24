(() => {
    const difficulties = {
        easy: { label: "かんたん", min: 2, max: 3 },
        normal: { label: "ふつう", min: 3, max: 4 },
        hard: { label: "むずかしい", min: 4, max: 5 },
    };

    const SYLLABLES = Object.freeze([
        { kana: "あ", romaji: "a" },
        { kana: "い", romaji: "i" },
        { kana: "う", romaji: "u" },
        { kana: "え", romaji: "e" },
        { kana: "お", romaji: "o" },
        { kana: "か", romaji: "ka" },
        { kana: "き", romaji: "ki" },
        { kana: "く", romaji: "ku" },
        { kana: "け", romaji: "ke" },
        { kana: "こ", romaji: "ko" },
        { kana: "さ", romaji: "sa" },
        { kana: "し", romaji: "shi" },
        { kana: "す", romaji: "su" },
        { kana: "せ", romaji: "se" },
        { kana: "そ", romaji: "so" },
        { kana: "た", romaji: "ta" },
        { kana: "ち", romaji: "chi" },
        { kana: "つ", romaji: "tsu" },
        { kana: "て", romaji: "te" },
        { kana: "と", romaji: "to" },
        { kana: "な", romaji: "na" },
        { kana: "に", romaji: "ni" },
        { kana: "ぬ", romaji: "nu" },
        { kana: "ね", romaji: "ne" },
        { kana: "の", romaji: "no" },
        { kana: "は", romaji: "ha" },
        { kana: "ひ", romaji: "hi" },
        { kana: "ふ", romaji: "fu" },
        { kana: "へ", romaji: "he" },
        { kana: "ほ", romaji: "ho" },
        { kana: "ま", romaji: "ma" },
        { kana: "み", romaji: "mi" },
        { kana: "む", romaji: "mu" },
        { kana: "め", romaji: "me" },
        { kana: "も", romaji: "mo" },
        { kana: "や", romaji: "ya" },
        { kana: "ゆ", romaji: "yu" },
        { kana: "よ", romaji: "yo" },
        { kana: "ら", romaji: "ra" },
        { kana: "り", romaji: "ri" },
        { kana: "る", romaji: "ru" },
        { kana: "れ", romaji: "re" },
        { kana: "ろ", romaji: "ro" },
        { kana: "わ", romaji: "wa" },
        { kana: "を", romaji: "wo" },
        { kana: "ん", romaji: "n" },
        { kana: "が", romaji: "ga" },
        { kana: "ぎ", romaji: "gi" },
        { kana: "ぐ", romaji: "gu" },
        { kana: "げ", romaji: "ge" },
        { kana: "ご", romaji: "go" },
        { kana: "ざ", romaji: "za" },
        { kana: "じ", romaji: "ji" },
        { kana: "ず", romaji: "zu" },
        { kana: "ぜ", romaji: "ze" },
        { kana: "ぞ", romaji: "zo" },
        { kana: "だ", romaji: "da" },
        { kana: "ぢ", romaji: "ji" },
        { kana: "づ", romaji: "zu" },
        { kana: "で", romaji: "de" },
        { kana: "ど", romaji: "do" },
        { kana: "ば", romaji: "ba" },
        { kana: "び", romaji: "bi" },
        { kana: "ぶ", romaji: "bu" },
        { kana: "べ", romaji: "be" },
        { kana: "ぼ", romaji: "bo" },
        { kana: "ぱ", romaji: "pa" },
        { kana: "ぴ", romaji: "pi" },
        { kana: "ぷ", romaji: "pu" },
        { kana: "ぺ", romaji: "pe" },
        { kana: "ぽ", romaji: "po" },
    ]);

    const kanaToRomaji = SYLLABLES.reduce((acc, entry) => {
        acc[entry.kana] = entry.romaji;
        return acc;
    }, {});

    const STORAGE_KEY = "typingGame.pages.localHighScores";
    const RANKING_KEY = "typingGame.pages.rankings";

    const dom = {};
    const state = {
        running: false,
        difficulty: document.body.dataset.defaultDifficulty || "easy",
        timeRemaining: 60,
        score: 0,
        successes: 0,
        attempts: 0,
        expectedRomaji: "",
        expectedRomajiNormalized: "",
        timerId: null,
        endTimestamp: 0,
        soundEnabled: true,
        bgmEnabled: true,
        highscores: loadHighScores(),
        rankings: loadRankings(),
    };

    const normalizeRomaji = (value) => {
        if (!value) {
            return "";
        }
        let result = value.trim().toLowerCase();
        if (typeof result.normalize === "function") {
            result = result.normalize("NFKC");
        }
        const latinOnly = result.replace(/[^a-z]/g, "");
        if (latinOnly) {
            return latinOnly;
        }
        let kanaResult = "";
        for (const char of result) {
            if (kanaToRomaji[char]) {
                kanaResult += kanaToRomaji[char];
            }
        }
        return kanaResult;
    };

    class SoundManager {
        constructor() {
            this.context = null;
            this.bgmGain = null;
            this.bgmPads = [];
            this.melodyTimeout = null;
            this.bgmStep = 0;
        }

        ensureContext() {
            if (!this.context) {
                const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextCtor) {
                    return null;
                }
                this.context = new AudioContextCtor();
            }
            return this.context;
        }

        playEffect(type) {
            if (!state.soundEnabled) {
                return;
            }
            const ctx = this.ensureContext();
            if (!ctx) {
                return;
            }
            if (ctx.state === "suspended") {
                ctx.resume();
            }
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const now = ctx.currentTime;
            const isSuccess = type === "success";

            osc.type = "triangle";
            osc.frequency.setValueAtTime(isSuccess ? 780 : 200, now);
            osc.frequency.linearRampToValueAtTime(isSuccess ? 520 : 120, now + 0.18);
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

            osc.connect(gain).connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        }

        startBgm() {
            if (!state.bgmEnabled) {
                return;
            }
            const ctx = this.ensureContext();
            if (!ctx) {
                return;
            }
            if (ctx.state === "suspended") {
                ctx.resume();
            }
            if (this.bgmGain) {
                return;
            }

            const masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(0, ctx.currentTime);
            masterGain.connect(ctx.destination);
            this.bgmGain = masterGain;

            const padFrequencies = [196, 247, 294];
            this.bgmPads = padFrequencies.map((frequency, index) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.value = frequency;
                gain.gain.value = 0;
                osc.connect(gain).connect(masterGain);
                osc.start();
                const now = ctx.currentTime;
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.05 + index * 0.01, now + 2);
                return { osc, gain };
            });

            masterGain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 2.4);

            const melody = [392, 440, 523.25, 494, 440, 392, 349.23, 329.63];
            const noteDurationMs = 1500;
            this.bgmStep = 0;

            const scheduleMelody = () => {
                if (!this.bgmGain) {
                    return;
                }
                const frequency = melody[this.bgmStep % melody.length];
                this.bgmStep += 1;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "triangle";
                osc.frequency.value = frequency;
                gain.gain.value = 0;
                osc.connect(gain).connect(masterGain);

                const now = ctx.currentTime;
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.1, now + 0.15);
                gain.gain.linearRampToValueAtTime(0, now + 1.3);
                osc.start(now);
                osc.stop(now + 1.4);

                this.melodyTimeout = window.setTimeout(scheduleMelody, noteDurationMs);
            };

            scheduleMelody();
        }

        stopBgm() {
            if (!this.bgmGain || !this.context) {
                return;
            }
            const ctx = this.context;
            const pads = this.bgmPads;
            const gain = this.bgmGain;
            const now = ctx.currentTime;

            if (this.melodyTimeout) {
                window.clearTimeout(this.melodyTimeout);
                this.melodyTimeout = null;
            }

            pads.forEach(({ osc, gain: padGain }) => {
                try {
                    padGain.gain.cancelScheduledValues(now);
                    padGain.gain.linearRampToValueAtTime(0.0001, now + 0.6);
                    osc.stop(now + 0.7);
                } catch (error) {
                    console.warn(error);
                }
            });

            gain.gain.cancelScheduledValues(now);
            gain.gain.linearRampToValueAtTime(0.0001, now + 0.6);

            window.setTimeout(() => {
                pads.forEach(({ osc, gain: padGain }) => {
                    try {
                        padGain.disconnect();
                        osc.disconnect();
                    } catch (error) {
                        console.warn(error);
                    }
                });
                try {
                    gain.disconnect();
                } catch (error) {
                    console.warn(error);
                }
            }, 750);

            this.bgmPads = [];
            this.bgmGain = null;
            this.bgmStep = 0;
        }
    }

    const sound = new SoundManager();

    function loadHighScores() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (error) {
            console.warn("Failed to parse high scores:", error);
            return {};
        }
    }

    function saveHighScores() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.highscores));
        } catch (error) {
            console.warn("Failed to save high scores:", error);
        }
    }

    function loadRankings() {
        try {
            const raw = localStorage.getItem(RANKING_KEY);
            if (!raw) {
                return { easy: [], normal: [], hard: [] };
            }
            const parsed = JSON.parse(raw);
            return {
                easy: Array.isArray(parsed.easy) ? parsed.easy : [],
                normal: Array.isArray(parsed.normal) ? parsed.normal : [],
                hard: Array.isArray(parsed.hard) ? parsed.hard : [],
            };
        } catch (error) {
            console.warn("Failed to parse rankings:", error);
            return { easy: [], normal: [], hard: [] };
        }
    }

    function saveRankings() {
        try {
            localStorage.setItem(RANKING_KEY, JSON.stringify(state.rankings));
        } catch (error) {
            console.warn("Failed to save rankings:", error);
        }
    }

    function getDifficultyLabel(key) {
        return difficulties[key]?.label ?? key;
    }

    function initDomReferences() {
        dom.difficulty = document.getElementById("difficulty");
        dom.soundToggle = document.getElementById("soundToggle");
        dom.bgmToggle = document.getElementById("bgmToggle");
        dom.timeRemaining = document.getElementById("timeRemaining");
        dom.score = document.getElementById("score");
        dom.successCount = document.getElementById("successCount");
        dom.accuracy = document.getElementById("accuracy");
        dom.personalBest = document.getElementById("personalBest");
        dom.prompt = document.getElementById("prompt");
        dom.answerInput = document.getElementById("answerInput");
        dom.startButton = document.getElementById("startButton");
        dom.feedback = document.getElementById("feedback");
        dom.finalScore = document.getElementById("finalScore");
        dom.finalSuccess = document.getElementById("finalSuccess");
        dom.finalAttempts = document.getElementById("finalAttempts");
        dom.finalAccuracy = document.getElementById("finalAccuracy");
        dom.highScoreMessage = document.getElementById("highScoreMessage");
        dom.rankingDescription = document.getElementById("rankingDescription");
        dom.rankingBody = document.getElementById("rankingBody");
        dom.rankingRowTemplate = document.getElementById("rankingRowTemplate");
    }

    function bindEvents() {
        dom.startButton.addEventListener("click", () => {
            if (state.running) {
                stopGame();
            } else {
                startGame();
            }
        });

        dom.answerInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                if (state.running) {
                    checkAnswer();
                }
            }
        });

        dom.difficulty.addEventListener("change", () => {
            state.difficulty = dom.difficulty.value;
            updatePersonalBestLabel();
            updateRankingDescription();
            updateRankingTable(state.rankings[state.difficulty]);
            if (!state.running) {
                dom.prompt.textContent = "スタートボタンを押してね";
            }
        });

        dom.soundToggle.addEventListener("change", () => {
            state.soundEnabled = dom.soundToggle.checked;
        });

        dom.bgmToggle.addEventListener("change", () => {
            state.bgmEnabled = dom.bgmToggle.checked;
            if (!state.bgmEnabled) {
                sound.stopBgm();
            } else if (state.running) {
                sound.startBgm();
            }
        });
    }

    function updateStatsDisplay() {
        dom.timeRemaining.textContent = state.timeRemaining.toFixed(1);
        dom.score.textContent = state.score;
        dom.successCount.textContent = state.successes;
        const accuracy = state.attempts === 0 ? 0 : Math.round((state.successes / state.attempts) * 100);
        dom.accuracy.textContent = `${accuracy}%`;
    }

    function updatePersonalBestLabel() {
        const best = state.highscores[state.difficulty];
        dom.personalBest.textContent = Number.isInteger(best) ? best : "--";
    }

    function updateStartButton() {
        dom.startButton.textContent = state.running ? "リセット" : "ゲームスタート";
    }

    function resetFeedback() {
        dom.feedback.textContent = "";
        dom.feedback.classList.remove("success", "error");
    }

    function setFeedback(message, type) {
        dom.feedback.textContent = message;
        dom.feedback.classList.toggle("success", type === "success");
        dom.feedback.classList.toggle("error", type === "error");
    }

    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function generatePrompt() {
        const config = difficulties[state.difficulty] ?? difficulties.easy;
        const length = randomInt(config.min, config.max);
        let kana = "";
        let romaji = "";
        for (let i = 0; i < length; i += 1) {
            const piece = SYLLABLES[Math.floor(Math.random() * SYLLABLES.length)];
            kana += piece.kana;
            romaji += piece.romaji;
        }
        state.expectedRomaji = romaji;
        state.expectedRomajiNormalized = normalizeRomaji(romaji);
        dom.prompt.textContent = kana;
    }

    function startGame() {
        state.running = true;
        state.timeRemaining = 60;
        state.score = 0;
        state.successes = 0;
        state.attempts = 0;
        state.endTimestamp = performance.now() + 60000;
        resetFeedback();
        updateStatsDisplay();
        dom.answerInput.value = "";
        dom.answerInput.disabled = false;
        dom.answerInput.focus();
        generatePrompt();
        updateStartButton();
        startTimer();
        if (state.bgmEnabled) {
            sound.startBgm();
        }
    }

    function stopGame() {
        if (!state.running) {
            return;
        }
        window.clearInterval(state.timerId);
        state.timerId = null;
        state.running = false;
        state.timeRemaining = Math.max(0, state.timeRemaining);
        dom.answerInput.disabled = true;
        updateStartButton();
        updateStatsDisplay();
        sound.stopBgm();
        summarizeResult();
    }

    function startTimer() {
        window.clearInterval(state.timerId);
        state.timerId = window.setInterval(() => {
            const remainingMs = state.endTimestamp - performance.now();
            state.timeRemaining = Math.max(0, remainingMs / 1000);
            updateStatsDisplay();
            if (state.timeRemaining <= 0) {
                stopGame();
            }
        }, 100);
    }

    function checkAnswer() {
        const rawInput = dom.answerInput.value;
        const normalizedInput = normalizeRomaji(rawInput);
        if (!normalizedInput) {
            return;
        }
        state.attempts += 1;
        const expected = state.expectedRomajiNormalized || normalizeRomaji(state.expectedRomaji);
        const isCorrect = normalizedInput === expected;
        if (isCorrect) {
            state.successes += 1;
            state.score += 100;
            setFeedback("正解！", "success");
            sound.playEffect("success");
        } else {
            state.score = Math.max(0, state.score - 10);
            setFeedback("ざんねん！", "error");
            sound.playEffect("error");
        }
        dom.answerInput.value = "";
        generatePrompt();
        updateStatsDisplay();
    }

    function summarizeResult() {
        dom.finalScore.textContent = state.score;
        dom.finalSuccess.textContent = state.successes;
        dom.finalAttempts.textContent = state.attempts;
        const accuracy = state.attempts === 0 ? 0 : Math.round((state.successes / state.attempts) * 100);
        dom.finalAccuracy.textContent = `${accuracy}%`;

        updateHighScores();
        updateLocalRanking();
        updateRankingTable(state.rankings[state.difficulty]);
        saveRankings();
    }

    function updateHighScores() {
        const best = state.highscores[state.difficulty] ?? 0;
        if (state.score > best) {
            state.highscores[state.difficulty] = state.score;
            saveHighScores();
            dom.personalBest.textContent = state.score;
            dom.highScoreMessage.textContent = "自己ベストを更新しました！";
        } else if (state.score === best && state.score !== 0) {
            dom.highScoreMessage.textContent = "自己ベストに並びました！";
        } else {
            dom.highScoreMessage.textContent = "";
        }
    }

    function updateLocalRanking() {
        if (state.attempts === 0) {
            return;
        }
        const bucket = state.rankings[state.difficulty] ?? [];
        bucket.push({
            score: state.score,
            created_at: new Date().toISOString(),
        });
        bucket.sort((a, b) => {
            if (b.score === a.score) {
                return new Date(a.created_at) - new Date(b.created_at);
            }
            return b.score - a.score;
        });
        state.rankings[state.difficulty] = bucket.slice(0, 10);
    }

    function updateRankingDescription() {
        const label = getDifficultyLabel(state.difficulty);
        dom.rankingDescription.textContent = `難易度: ${label} の最新 10 件`;
    }

    function updateRankingTable(scores = []) {
        if (!Array.isArray(scores) || scores.length === 0) {
            dom.rankingBody.innerHTML = '<tr><td colspan="3">まだスコアが登録されていません。</td></tr>';
            return;
        }
        const fragment = document.createDocumentFragment();
        scores.forEach((entry, index) => {
            const node = dom.rankingRowTemplate.content.firstElementChild.cloneNode(true);
            node.querySelector(".rank").textContent = index + 1;
            node.querySelector(".rank-score").textContent = entry.score;
            const date = entry.created_at ? new Date(entry.created_at) : null;
            node.querySelector(".rank-date").textContent = date ? date.toLocaleString("ja-JP") : "-";
            fragment.appendChild(node);
        });
        dom.rankingBody.innerHTML = "";
        dom.rankingBody.appendChild(fragment);
    }

    function initialise() {
        initDomReferences();
        bindEvents();
        updateStatsDisplay();
        updatePersonalBestLabel();
        updateStartButton();
        resetFeedback();
        updateRankingDescription();
        updateRankingTable(state.rankings[state.difficulty]);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialise);
    } else {
        initialise();
    }
})();
