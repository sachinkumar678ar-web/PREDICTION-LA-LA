const { Telegraf } = require("telegraf")
const axios = require("axios")
const fs = require("fs")
const express = require("express")

// ===== CONFIG =====

const BOT_TOKEN = "8795656071:AAH9VOfrOFrNe1-Z44mzFvT3Iz0a9odiU00"
const HISTORY_CHANNEL = "-1003756626165"
const PREDICTION_CHANNEL = "-1003829129679"

const HISTORY_FILE = "./history.json"

const bot = new Telegraf(BOT_TOKEN)

let history=[]
let lastIssue=""
let lastPrediction=""
let lastMsgId=null
let lastMatch=""

// ===== LOAD HISTORY =====

function loadHistory(){
if(fs.existsSync(HISTORY_FILE)){
history=JSON.parse(fs.readFileSync(HISTORY_FILE))
console.log("History Loaded:",history.length)
}
}

// ===== SAVE HISTORY =====

function saveHistory(){
fs.writeFileSync(HISTORY_FILE,JSON.stringify(history))
}

// ===== COLOR =====

function getColor(n){
if([0,2,4,6,8].includes(n)) return "RED"
return "GREEN"
}

// ===== AI ENGINE =====

function getPrediction(){

let matchNumbers=[]

// ---------- PATTERN 3 ----------

if(history.length>=4){

let p=[history[0].number,history[1].number,history[2].number]

for(let i=3;i<history.length-2;i++){

if(
history[i].number===p[0] &&
history[i+1].number===p[1] &&
history[i+2].number===p[2]
){
matchNumbers.push(history[i-1].number)
}

}

}

// ---------- PATTERN 2 ----------

if(matchNumbers.length===0 && history.length>=3){

let p=[history[0].number,history[1].number]

for(let i=2;i<history.length-1;i++){

if(
history[i].number===p[0] &&
history[i+1].number===p[1]
){
matchNumbers.push(history[i-1].number)
}

}

}

// ---------- PATTERN 1 ----------

if(matchNumbers.length===0 && history.length>=2){

let p=history[0].number

for(let i=1;i<history.length;i++){

if(history[i].number===p){
matchNumbers.push(history[i-1].number)
}

}

}

// ---------- FALLBACK 50 HISTORY ----------

if(matchNumbers.length===0){

let last50=history.slice(0,50).map(x=>x.number)

let count={}

last50.forEach(n=>{
count[n]=(count[n]||0)+1
})

let maxNum=last50[0]
let maxCount=0

for(let n in count){
if(count[n]>maxCount){
maxCount=count[n]
maxNum=n
}
}

matchNumbers=[parseInt(maxNum)]

}

// ===== COUNT =====

let big=[]
let small=[]
let red=[]
let green=[]

matchNumbers.forEach(n=>{

if(n>=5) big.push(n)
else small.push(n)

if(getColor(n)=="RED") red.push(n)
else green.push(n)

})

// ===== DECISION =====

let prediction=""

let maxColor=Math.max(red.length,green.length)
let maxBS=Math.max(big.length,small.length)

if(maxColor>maxBS){

prediction = red.length>green.length ? "RED":"GREEN"

}
else if(maxBS>maxColor){

prediction = big.length>small.length ? "BIG":"SMALL"

}
else{

prediction = big.length>=small.length ? "BIG":"SMALL"

}

// all tie

if(
big.length===small.length &&
red.length===green.length
){

let first=matchNumbers[0]
prediction = first>=5 ? "BIG":"SMALL"

}

return{

prediction,
matchNumbers,
big,
small,
red,
green,
first:matchNumbers[0]

}

}

// ===== BOT COMMAND =====

bot.start((ctx)=>{
ctx.reply("🤖 WIN GO AI BOT RUNNING")
})

// ===== LOOP =====

async function loop(){

try{

const res=await axios.get(
"https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=20",
{timeout:10000}
)

const list=res.data?.data?.list
if(!list) return

const latest=list[0]

const issue=latest.issueNumber
const number=parseInt(latest.number)

if(issue===lastIssue) return

lastIssue=issue

const resultBS=number>=5 ? "BIG":"SMALL"
const resultColor=getColor(number)

// ===== RESULT CHECK =====

if(lastPrediction){

let win=false

if(lastPrediction=="BIG" && resultBS=="BIG") win=true
if(lastPrediction=="SMALL" && resultBS=="SMALL") win=true
if(lastPrediction=="RED" && resultColor=="RED") win=true
if(lastPrediction=="GREEN" && resultColor=="GREEN") win=true

try{
await bot.telegram.deleteMessage(PREDICTION_CHANNEL,lastMsgId)
}catch(e){}

const resultMsg=`
📊 RESULT UPDATE
━━━━━━━━━━━━━━
PERIOD : ${issue}

NUMBER : ${number}

RESULT : ${resultBS}

MATCH NUMBER : ${lastMatch}

${win ? "🏆 WIN":"❌ LOSS"}
`

await bot.telegram.sendMessage(PREDICTION_CHANNEL,resultMsg)

}

// ===== SAVE HISTORY =====

history.unshift({issue,number})

if(history.length>5000) history.pop()

saveHistory()

// ===== HISTORY MESSAGE =====

const historyMsg=`
📜 WIN GO HISTORY
━━━━━━━━━━━━━━
PERIOD : ${issue}

NUMBER : ${number}

RESULT : ${resultBS}
━━━━━━━━━━━━━━
`

await bot.telegram.sendMessage(HISTORY_CHANNEL,historyMsg)

// ===== PREDICTION =====

const ai=getPrediction()

const nextIssue=(BigInt(issue)+1n).toString()

const predMsg=`
🎯 AI PREDICTION
━━━━━━━━━━━━━━
PERIOD : ${nextIssue}

MATCH NUMBERS
${ai.matchNumbers.join(" ")}

BIG   : ${ai.big.join(",")}
SMALL : ${ai.small.join(",")}

RED   : ${ai.red.join(",")}
GREEN : ${ai.green.join(",")}

FINAL PREDICTION : ${ai.prediction}

MATCH NUMBER : ${ai.first}
`

const msg=await bot.telegram.sendMessage(
PREDICTION_CHANNEL,
predMsg
)

lastPrediction=ai.prediction
lastMsgId=msg.message_id
lastMatch=ai.first

}catch(e){

console.log("ERROR:",e.message)

}

}

// ===== EXPRESS SERVER =====

const app=express()

app.get("/",(req,res)=>{
res.send("Bot Running 24/7 🚀")
})

app.listen(process.env.PORT || 3000)

// ===== ANTI SLEEP =====

const URL="https://prediction-la-la.onrender.com"

setInterval(()=>{
axios.get(URL).catch(()=>{})
},120000)

// ===== START =====

loadHistory()

setInterval(loop,20000)

bot.launch()
