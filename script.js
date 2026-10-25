let seconds = 0;
let timerId = null;
let elapsedBeforeStart = 0;
let startedAt = null;
const WORK_SECONDS =  25 * 60;
const BREAK_SECONDS = 5 * 60;

let pomodoroPhase = "work";
let pomodoroRemaining = WORK_SECONDS;
let pomodoroTimerId = null;
let pomodoroEndsAt = null;
let completedCycles = 0;
let accumulatedWorkSeconds = 0;
const INTERRUPTION_THRESHOLD_MS = 60 * 1000;
let lastPomodoroUpdateAt = null;

const timerDisplay = document.getElementById("timer");

function updateDisplay() {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    timerDisplay.textContent =
        String(hours).padStart(2, "0") + ":" +
        String(minutes).padStart(2, "0") + ":" +
        String(secs).padStart(2, "0");
}

function updateTimer() {
    if (startedAt === null) return;

    seconds = Math.floor(
        (elapsedBeforeStart + Date.now() - startedAt) / 1000
    );

    updateDisplay();
}

function pauseTimer() {
    if (startedAt === null) return;

    elapsedBeforeStart += Date.now() - startedAt;
    startedAt = null;

    clearInterval(timerId);
    timerId = null;

    seconds = Math.floor(elapsedBeforeStart / 1000);
    updateDisplay();
}

// スタート
document.getElementById("startBtn").addEventListener("click", function() {

    if (currentMode === "pomodoro") {
        startPomodoro();
        return;
    }

    if (startedAt !== null) return;

    startedAt = Date.now();
    updateTimer();
    timerId = setInterval(updateTimer, 200);
});

// 一時停止
document.getElementById("pauseBtn").addEventListener("click", function() {

    if (currentMode === "pomodoro") {
        pausePomodoro();
    } else {
        pauseTimer();
    }

});

// リセット
document.getElementById("resetBtn").addEventListener("click", function() {

    if (!confirm("計測時間をリセットしますか？")) return;

    if (currentMode === "pomodoro") {

        // ポモドーロのタイマーを停止
        clearInterval(pomodoroTimerId);
        pomodoroTimerId = null;
        pomodoroEndsAt = null;

        // すべての状態を初期化
        pomodoroPhase = "work";
        pomodoroRemaining = WORK_SECONDS;
        completedCycles = 0;
        accumulatedWorkSeconds = 0;

        displayPomodoro();

    } else {

        // 通常タイマーのリセット
        pauseTimer();

        elapsedBeforeStart = 0;
        seconds = 0;
        updateDisplay();
    }
});
// 保存済みの学習記録を読み込む
let studyRecords = JSON.parse(
    localStorage.getItem("studyRecords")
) || [];

// 過去の記録にもIDと書き出し状態を追加
studyRecords.forEach(function(record) {
    if (!record.id) {
        record.id = crypto.randomUUID();
    }

    if (typeof record.exported !== "boolean") {
        record.exported = false;
    }
});

localStorage.setItem(
    "studyRecords",
    JSON.stringify(studyRecords)
);

// 保存ボタンを押したときの処理
document.getElementById("saveBtn").addEventListener("click", function() {
    pauseTimer();
    // 入力されたカテゴリとメモを取得
    const category = document.getElementById("category").value;
    const memo = document.getElementById("memo").value;

    let durationSeconds;
    let cycles = 0;

    if (currentMode === "pomodoro") {
        durationSeconds = getPomodoroWorkSeconds();
        cycles = completedCycles;
    } else {
        durationSeconds = seconds;
}

    // 1回分の学習記録を作成
    const record = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        category: category,
        mode: currentMode,
        duration_seconds: durationSeconds,
        completed_cycles: cycles,
        memo: memo,
        exported: false
    };

    // 配列に追加
    studyRecords.push(record);

    // ブラウザに保存
    localStorage.setItem(
        "studyRecords",
        JSON.stringify(studyRecords)
    );



    displayRecords();
    alert("学習記録を保存しました！");

    if (currentMode === "pomodoro") {
        resetPomodoroState();
    } else {
        elapsedBeforeStart = 0;
        seconds = 0;
        updateDisplay();
    }

    // メモ欄を空にする
    document.getElementById("memo").value = "";
});

function displayRecords() {

    const recordList = document.getElementById("recordList");

    recordList.innerHTML = "";

    studyRecords.forEach(function(record) {

        const li = document.createElement("li");

        const date = new Date(record.date).toLocaleString("ja-JP");

        const status = record.exported
            ? "保存済み"
            : "未出力";

        li.textContent =
            date + " | " +
            record.category + " | " +
            Math.floor(record.duration_seconds / 60) + "分 | " +
            record.memo + " | " +
            status;

        recordList.appendChild(li);
    });

    updateDashboard();
}

// ページを開いたときに履歴を表示
displayRecords();

document.getElementById("exportBtn").addEventListener("click", async function() {

    if (outputFolder === null) {
        alert("先に保存先フォルダを選択してください。");
        return;
    }

    const permission = await outputFolder.requestPermission({
        mode: "readwrite"
    });
    
    if (permission !== "granted") {
        alert("保存先フォルダへのアクセスが許可されていません。");
        return;
    }

    // 未出力の学習記録だけを取得
    const pendingRecords = studyRecords.filter(
        record => record.exported === false
    );

    if (pendingRecords.length === 0) {
        alert("未出力の学習記録はありません。");
        return;
    }

    const exportBtn = document.getElementById("exportBtn");
    exportBtn.disabled = true;

    let successCount = 0;

    try {
        for (const record of pendingRecords) {

            // カテゴリ名から不正なファイル名文字を除去
            const category = record.category.replace(
                /[\\/:*?"<>|]/g, "_"
            );

            // カテゴリフォルダを取得・作成
            const categoryFolder =
                await outputFolder.getDirectoryHandle(
                    category,
                    { create: true }
                );

            // 各学習記録を固有のファイル名で保存
            const fileHandle =
                await categoryFolder.getFileHandle(
                    record.id + ".json",
                    { create: true }
                );

            const writable = await fileHandle.createWritable();

            await writable.write(
                JSON.stringify(record, null, 2)
            );

            await writable.close();

            // 保存が成功した記録だけ状態を更新
            record.exported = true;

            localStorage.setItem(
                "studyRecords",
                JSON.stringify(studyRecords)
            );

            successCount++;
        }

        displayRecords();

        alert(successCount + "件の記録を書き出しました！");

    } catch (error) {
        console.error("JSON書き出しエラー:", error);

        displayRecords();

        alert(
            successCount + "件の保存が完了しました。" +
            "残りの記録は未出力のまま保持しています。"
        );

    } finally {
        exportBtn.disabled = false;
    }
});
// JSON保存先フォルダ
let outputFolder = null;

// フォルダ選択ボタン
document.getElementById("folderBtn").addEventListener("click", async function() {

    if (!window.showDirectoryPicker) {
        alert("ChromeまたはEdgeで開いてください。");
        return;
    }

    try {
        outputFolder = await window.showDirectoryPicker({
            mode: "readwrite"
        });

        // 選択したフォルダを記憶
        await rememberFolder(outputFolder);

        document.getElementById("folderStatus").textContent =
            "保存先：" + outputFolder.name;

    } catch (error) {
        if (error.name !== "AbortError") {
            console.error(error);
            alert("フォルダの設定に失敗しました。");
        }
    }
});



function openFolderDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("StudyLoggerDB", 1);

        request.onupgradeneeded = function() {
            request.result.createObjectStore("settings");
        };

        request.onsuccess = function() {
            resolve(request.result);
        };

        request.onerror = function() {
            reject(request.error);
        };
    });
}

// フォルダの参照情報を保存
async function rememberFolder(folderHandle) {
    const db = await openFolderDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction("settings", "readwrite");

        tx.objectStore("settings").put(folderHandle, "outputFolder");

        tx.oncomplete = () => {
            db.close();
            resolve();
        };

        tx.onerror = () => {
            db.close();
            reject(tx.error);
        };
    });
}

// 前回のフォルダを取得
async function restoreFolder() {
    const db = await openFolderDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction("settings", "readonly");
        const request = tx.objectStore("settings").get("outputFolder");

        request.onsuccess = () => {
            db.close();
            resolve(request.result || null);
        };

        request.onerror = () => {
            db.close();
            reject(request.error);
        };
    });
}

async function initializeFolder() {
    try {
        outputFolder = await restoreFolder();

        if (outputFolder === null) return;

        const permission = await outputFolder.queryPermission({
            mode: "readwrite"
        });

        const status = document.getElementById("folderStatus");

        if (permission === "granted") {
            status.textContent = "保存先：" + outputFolder.name + "（使用可能）";
        } else {
            status.textContent = "保存先：" + outputFolder.name + "（書き込み時に再許可が必要）";
        }

    } catch (error) {
        console.error("保存先の復元に失敗:", error);
    }
}

initializeFolder();

function updateDashboard() {

    const today = new Date().toLocaleDateString("ja-JP");

    let todaySeconds = 0;
    let totalSeconds = 0;

    const categoryTotals = {};

    studyRecords.forEach(function(record) {

        const duration = Number(record.duration_seconds) || 0;
        totalSeconds += duration;

        // 今日の学習時間
        const recordDate =
            new Date(record.date).toLocaleDateString("ja-JP");

        if (recordDate === today) {
            todaySeconds += duration;
        }

        // カテゴリ別の学習時間
        if (!categoryTotals[record.category]) {
            categoryTotals[record.category] = 0;
        }

        categoryTotals[record.category] += duration;
    });

    // ダッシュボードに表示
    document.getElementById("todayTime").textContent =
        formatStudyTime(todaySeconds);

    document.getElementById("totalTime").textContent =
        formatStudyTime(totalSeconds);

    document.getElementById("recordCount").textContent =
        studyRecords.length + "件";

    displayCategoryChart(categoryTotals);
}

// 秒を「○時間○分」に変換
function formatStudyTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return hours + "時間" + minutes + "分";
}

// カテゴリ別の棒グラフを作成
function displayCategoryChart(categoryTotals) {

    const chart = document.getElementById("categoryChart");
    chart.innerHTML = "";

    const entries = Object.entries(categoryTotals);

    if (entries.length === 0) {
        chart.textContent = "まだ学習記録がありません。";
        return;
    }

    const maxSeconds = Math.max(...Object.values(categoryTotals));

    entries.sort((a, b) => b[1] - a[1]);

    entries.forEach(function([category, seconds]) {

        const row = document.createElement("div");
        row.className = "chart-row";

        const label = document.createElement("div");
        label.className = "chart-label";

        const name = document.createElement("span");
        name.textContent = category;

        const time = document.createElement("span");
        time.textContent = formatStudyTime(seconds);

        label.appendChild(name);
        label.appendChild(time);

        const track = document.createElement("div");
        track.className = "chart-track";

        const bar = document.createElement("div");
        bar.className = "chart-bar";
        bar.style.width = (seconds / maxSeconds * 100) + "%";

        track.appendChild(bar);
        row.appendChild(label);
        row.appendChild(track);
        chart.appendChild(row);
    });
}

updateDashboard();

let currentMode = "normal";

const normalModeBtn = document.getElementById("normalModeBtn");
const pomodoroModeBtn = document.getElementById("pomodoroModeBtn");
const modeDescription = document.getElementById("modeDescription");

function switchMode(mode) {

    // 通常タイマーまたはポモドーロが進行中なら切り替え禁止
    if (
        startedAt !== null ||
        seconds > 0 ||
        pomodoroTimerId !== null ||
        completedCycles > 0 ||
        pomodoroRemaining !== WORK_SECONDS
    ) {
        alert("進行中のセッションがあるため切り替えできません。");
        return;
    }

    currentMode = mode;

    if (mode === "normal") {

        modeDescription.textContent =
            "通常タイマー：経過時間を計測します";

        timerDisplay.textContent = "00:00:00";

    } else {

        // ポモドーロの初期状態を設定
        pomodoroPhase = "work";
        pomodoroRemaining = WORK_SECONDS;

        // ポモドーロ用の表示に更新
        displayPomodoro();
    }
}


normalModeBtn.addEventListener("click", function() {
    switchMode("normal");
});

pomodoroModeBtn.addEventListener("click", function() {
    switchMode("pomodoro");
});

function formatPomodoroTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return (
        String(minutes).padStart(2, "0") + ":" +
        String(secs).padStart(2, "0")
    );
}

function displayPomodoro() {
    timerDisplay.textContent =
        formatPomodoroTime(pomodoroRemaining);

    modeDescription.textContent =
        pomodoroPhase === "work"
            ? "集中時間：" + completedCycles + "セット完了"
            : "休憩時間：" + completedCycles + "セット完了";
}

function startPomodoro() {
    if (pomodoroTimerId !== null) return;
    lastPomodoroUpdateAt = Date.now();

    pomodoroEndsAt = Date.now() + pomodoroRemaining * 1000;

    pomodoroTimerId = setInterval(updatePomodoro, 200);

    displayPomodoro();

    saveActiveSession(); 
}

function updatePomodoro() {
    if (pomodoroEndsAt === null) return;

    pomodoroRemaining = Math.max(
        0,
        Math.ceil((pomodoroEndsAt - Date.now()) / 1000)
    );

    if (pomodoroRemaining === 0) {

        if (pomodoroPhase === "work") {
            completedCycles++;
            accumulatedWorkSeconds += WORK_SECONDS;

            pomodoroPhase = "break";
            pomodoroRemaining = BREAK_SECONDS;
        } else {
            pomodoroPhase = "work";
            pomodoroRemaining = WORK_SECONDS;
        }

        pomodoroEndsAt =
            Date.now() + pomodoroRemaining * 1000;
    }

    displayPomodoro();

    saveActiveSession();
}

function pausePomodoro() {
    if (pomodoroTimerId === null) return;

    updatePomodoro();

    // 中断検知によって既に停止していた場合
    if (pomodoroTimerId === null) return;

    clearInterval(pomodoroTimerId);
    pomodoroTimerId = null;
    pomodoroEndsAt = null;
    lastPomodoroUpdateAt = null;

    saveActiveSession();
}

function getPomodoroWorkSeconds() {
    let total = accumulatedWorkSeconds;

    if (pomodoroPhase === "work") {
        let remaining = pomodoroRemaining;

        // 計測中なら現在時刻から正確な残り時間を求める
        if (pomodoroEndsAt !== null) {
            remaining = Math.max(
                0,
                (pomodoroEndsAt - Date.now()) / 1000
            );
        }

        total += Math.max(0, WORK_SECONDS - remaining);
    }

    return Math.floor(total);
}

function resetPomodoroState() {
    clearInterval(pomodoroTimerId);

    pomodoroTimerId = null;
    pomodoroEndsAt = null;
    pomodoroPhase = "work";
    pomodoroRemaining = WORK_SECONDS;
    completedCycles = 0;
    accumulatedWorkSeconds = 0;
    lastPomodoroUpdateAt = null;

    // 保存されていた進行中のセッションを削除
    localStorage.removeItem(ACTIVE_SESSION_KEY);

    displayPomodoro();
}

const ACTIVE_SESSION_KEY = "activeSession";

function saveActiveSession() {
    if (currentMode !== "pomodoro") return;

    const session = {
        mode: "pomodoro",
        phase: pomodoroPhase,
        remaining: pomodoroRemaining,
        endsAt: pomodoroEndsAt,
        completedCycles: completedCycles,
        accumulatedWorkSeconds: accumulatedWorkSeconds,
        running: pomodoroTimerId !== null,
        savedAt: Date.now()
    };

    localStorage.setItem(
        ACTIVE_SESSION_KEY,
        JSON.stringify(session)
    );
}

function restoreActiveSession() {
    const saved = localStorage.getItem(ACTIVE_SESSION_KEY);

    if (!saved) return;

    try {
        const session = JSON.parse(saved);

        if (session.mode !== "pomodoro") return;

        currentMode = "pomodoro";
        pomodoroPhase = session.phase;
        pomodoroRemaining = session.remaining;
        completedCycles = session.completedCycles;
        accumulatedWorkSeconds = session.accumulatedWorkSeconds;

        // ページ更新後は、安全のため一時停止状態で復元
        pomodoroEndsAt = null;
        pomodoroTimerId = null;

        displayPomodoro();

        modeDescription.textContent +=
            "（前回のセッションを復元しました）";

    } catch (error) {
        console.error("セッション復元エラー:", error);
    }
}

restoreActiveSession();

function checkPomodoroInterruption() {
    if (lastPomodoroUpdateAt === null ||
        pomodoroEndsAt === null) {
        return false;
    }

    const gap = Date.now() - lastPomodoroUpdateAt;

    if (gap < INTERRUPTION_THRESHOLD_MS) {
        return false;
    }

    // 最後に更新できた時点の残り時間を取得
    pomodoroRemaining = Math.max(
        0,
        Math.ceil(
            (pomodoroEndsAt - lastPomodoroUpdateAt) / 1000
        )
    );

    clearInterval(pomodoroTimerId);

    pomodoroTimerId = null;
    pomodoroEndsAt = null;
    lastPomodoroUpdateAt = null;

    displayPomodoro();
    saveActiveSession();

    modeDescription.textContent +=
        "（長時間中断のため一時停止しました）";

    return true;
}