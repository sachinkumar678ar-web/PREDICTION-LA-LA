const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express');
const fs = require('fs');

// --- 1. Configuration ---
const BOT_TOKEN = '8768679295:AAF396AtrjFmJFcGS5jWSQk5B_gZ2imsuXE';
const RENDER_EXTERNAL_URL = "https://prediction-la-la.onrender.com";
const HISTORY_FILE = './unlimited_history.json'; // Render Free disk fix: write to current dir or /tmp

const CHANNELS = [
    '-1003759388181',
    '-1003821829797'
];

const bot = new Telegraf(BOT_TOKEN);
let localHistory = [];
let isLoopRunning = false;
let channelStates = {};

// Initialize states for each channel
CHANNELS.forEach(id => {
    channelStates[id] = { 
        lastProcessedId: "0", 
        predictionData: null, 
        msgId: null 
    };
});

// --- 2. Persistence Logic ---
function saveHistory() {
    try {
        // Keep max 150-200 for memory efficiency as per 10-gap rules
        const dataToSave = localHistory.slice(0, 500); 
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(dataToSave));
    } catch (e) { console.log("Save Error:", e.message); }
}

function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            localHistory = JSON.parse(fs.readFileSync(HISTORY_FILE));
            console.log("📂 History Loaded:", localHistory.length);
        }
    } catch (e) { console.log("Starting Fresh..."); }
}

// --- 3. 10-GAP AI ENGINE (The New Rules) ---
function get10GapPrediction() {
    if (localHistory.length < 100) return null;

    const latest = localHistory[0];
    const latestId = BigInt(latest.issueNumber);
    const sample = [];

    // GAP ANALYSIS: Get 9 periods (-10, -20, ... -90)
    for (let i = 1; i <= 9; i++) {
        const targetId = (latestId - BigInt(i * 10)).toString();
        const record = localHistory.find(h => h.issueNumber === targetId);
        if (record) sample.push(record);
    }

    if (sample.length === 0) return null;

    // MAJORITY LOGIC
    const counts = { BIG: 0, SMALL: 0, RED: 0, GREEN: 0 };
    const pairCounts = { 'RED-BIG': 0, 'RED-SMALL': 0, 'GREEN-BIG': 0, 'GREEN-SMALL': 0 };

    sample.forEach(s => {
        const size = s.number >= 5 ? 'BIG' : 'SMALL';
        const color = [0, 2, 4, 6, 8].includes(s.number) ? 'RED' : 'GREEN';
        
        counts[size]++;
        counts[color]++;
        pairCounts[`${color}-${size}`]++;
    });

    // Determine Winner or Random if tied
    let finalSize = "RANDOM";
    if (counts.BIG > counts.SMALL) finalSize = "BIG";
    else if (counts.SMALL > counts.BIG) finalSize = "SMALL";

    let finalColor = "RANDOM";
    if (counts.RED > counts.GREEN) finalColor = "RED";
    else if (counts.GREEN > counts.RED) finalColor = "GREEN";

    // BEST PAIR Analysis
    const bestPair = Object.keys(pairCounts).reduce((a, b) => pairCounts[a] >= pairCounts[b] ? a : b);

    // LUCKY NUMBER SYSTEM
    const luckies = {
        'RED-BIG': [6, 8],
        'RED-SMALL': [0, 2, 4],
        'GREEN-BIG': [5, 7, 9],
        'GREEN-SMALL': [1, 3]
    }[bestPair] || [5];

    return { 
        size: finalSize, 
        color: finalColor, 
        lucky: luckies, 
        stats: counts,
        pair: bestPair
    };
}

// --- 4. Main Processing Loop ---
async function loop() {
    if (isLoopRunning) return;
    isLoopRunning = true;

    try {
        const res = await axios.get("https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=20", { timeout: 8000 });
        const list = res.data?.data?.list || [];
        
        let hasNewData = false;
        for (let item of list) {
            const id = item.issueNumber.toString();
            if (!localHistory.find(h => h.issueNumber === id)) {
                localHistory.unshift({ issueNumber: id, number: parseInt(item.number) });
                hasNewData = true;
            }
        }

        if (hasNewData) {
            localHistory.sort((a, b) => (BigInt(b.issueNumber) > BigInt(a.issueNumber) ? 1 : -1));
            saveHistory();
        }

        const current = localHistory[0];
        if (!current) throw new Error("No Data");

        for (const chanId of CHANNELS) {
            let state = channelStates[chanId];
            const nextId = (BigInt(current.issueNumber) + 1n).toString();

            // STEP 1: Process Result of previous prediction
            if (state.predictionData && state.lastProcessedId !== current.issueNumber) {
                const actualSize = current.number >= 5 ? "BIG" : "SMALL";
                const actualColor = [0, 2, 4, 6, 8].includes(current.number) ? "RED" : "GREEN";
                
                const winSize = state.predictionData.size === actualSize;
                const winColor = state.predictionData.color === actualColor;
                const winLucky = state.predictionData.lucky.includes(current.number);

                const resultText = 
                    `🏁 *RESULT UPDATE* \`#${current.issueNumber.slice(-4)}\`\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `🎲 *NUMBER:* \`${current.number}\` (${actualColor})\n` +
                    `📊 *STATUS:* ${ (winSize || winColor) ? "✅ WIN" : "❌ LOSS"}\n` +
                    `${ winLucky ? "🤩 *JACKPOT MATCHED!*" : ""}\n` +
                    `━━━━━━━━━━━━━━`;

                // Optionally delete old prediction and send result
                if (state.msgId) await bot.telegram.deleteMessage(chanId, state.msgId).catch(() => {});
                await bot.telegram.sendMessage(chanId, resultText, { parse_mode: 'Markdown' });
                
                state.lastProcessedId = current.issueNumber;
                state.predictionData = null; 
            }

            // STEP 2: Send New Prediction
            if (!state.predictionData && state.lastProcessedId === current.issueNumber) {
                const ai = get10GapPrediction();
                if (!ai) continue;

                const predMsg = 
                    `🎯 *10-GAP AI PREDICTION*\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `🆔 *PERIOD:* \`#${nextId.slice(-4)}\`\n` +
                    `🔼 *SIZE:* \`${ai.size}\`\n` +
                    `🔴 *COLOR:* \`${ai.color}\`\n` +
                    `💰 *LUCKY:* \`${ai.lucky.join(", ")}\`\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `📈 *GAP STATS:* B:${ai.stats.BIG} S:${ai.stats.SMALL} | R:${ai.stats.RED} G:${ai.stats.GREEN}\n` +
                    `🤝 *BEST PAIR:* ${ai.pair}`;

                const s = await bot.telegram.sendMessage(chanId, predMsg, { parse_mode: 'Markdown' });
                state.predictionData = ai;
                state.msgId = s.message_id;
            }
        }
    } catch (err) {
        console.log("Monitoring API...");
    }
    isLoopRunning = false;
}

// --- 5. Server & Start ---
const app = express();
app.get('/', (req, res) => res.send('AI Gap Bot is Running'));
app.listen(process.env.PORT || 3000);

// Keep Render alive
setInterval(() => axios.get(RENDER_EXTERNAL_URL).catch(() => {}), 120000);
// Logic loop
setInterval(loop, 12000);

loadHistory();
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
