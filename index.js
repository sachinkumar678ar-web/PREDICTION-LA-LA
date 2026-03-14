const { Telegraf } = require("telegraf")
const axios = require("axios")
const fs = require("fs")
const express = require("express")

//================ CONFIG ================

const BOT_TOKEN = "8795656071:AAH9VOfrOFrNe1-Z44mzFvT3Iz0a9odiU00"

const HISTORY_CHANNEL = "-1003756626165"
const PREDICTION_CHANNEL = "-1003829129679"

const API_URL =
"https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=20"

const HISTORY_FILE = "./history.json"

const bot = new Telegraf(BOT_TOKEN)

//================ DATA ================

let history = []
let lastIssue = null

let lastPrediction = ""
let lastPredictionMsg = null
let lastPredictionPeriod = null

//================ LOAD HISTORY ================

function loadHistory(){

if(fs.existsSync(HISTORY_FILE)){
history = JSON.parse(fs.readFileSync(HISTORY_FILE))
console.log("History Loaded:",history.length)
}

}

//================ SAVE HISTORY ================

function saveHistory(){
fs.writeFileSync(HISTORY_FILE,JSON.stringify(history))
}

//================ COLOR RULE ================

function getColor(n){

if([0,2,4,6,8].includes(n)) return "RED"
return "GREEN"

}

//================ PREDICTION ENGINE ================

function getPrediction(){

const numbers = history.map(x=>x.number)

for(let len=4; len>=1; len--){

const pattern = numbers.slice(0,len)

let matchNumbers=[]

for(let i=1;i<numbers.length-len;i++){

const win = numbers.slice(i,i+len)

if(pattern.every((v,k)=>v===win[k])){

const next = numbers[i-1]
matchNumbers.push(next)

}

}

if(matchNumbers.length>0){

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

// ===== WEIGHT SYSTEM =====

const bigScore = big.length * 0.6
const smallScore = small.length * 0.6

const redScore = red.length * 0.4
const greenScore = green.length * 0.4

const bigTotal = bigScore + greenScore
const smallTotal = smallScore + redScore

let prediction=""

if(bigTotal > smallTotal){
prediction="BIG"
}
else if(smallTotal > bigTotal){
prediction="SMALL"
}
else{

// TIE CASE

prediction = matchNumbers[0] >= 5 ? "BIG" : "SMALL"

}

return{
prediction,
matchNumbers,
big,
small,
red,
green,
level:len
}

}

}

return{
prediction:"BIG",
matchNumbers:[],
level:0
}

}

//================ RESULT CHECK ================

async function checkResult(number){

if(!lastPredictionMsg) return

let result = number>=5?"BIG":"SMALL"

let win = result==lastPrediction

let text = win ? "WIN ✅" : "LOSS ❌"

await bot.telegram.editMessageText(

PREDICTION_CHANNEL,
lastPredictionMsg,
null,

`🎯 RESULT UPDATE
━━━━━━━━━━━━━━
PERIOD : ${lastPredictionPeriod}

PREDICTION : ${lastPrediction}

RESULT : ${result}

${text}`
)

}

//================ SEND PREDICTION ================

async function sendPrediction(period){

const ai = getPrediction()

const msg=`
🎯 AI PREDICTION
━━━━━━━━━━━━━━
🌟PERIOD : ${period}

🌟MATCH NUMBERS
${ai.matchNumbers.join(" ")}

🔼BIG   : ${ai.big.join(",")}
🔽SMALL : ${ai.small.join(",")}

🔴RED   : ${ai.red.join(",")}
🟢GREEN : ${ai.green.join(",")}

🌟FINAL PREDICTION : ${ai.prediction}

🌟MATCH NUMBER : ${ai.matchNumbers.join(",")}

🧠 MACHINE LEVEL : L-${ai.level}
`

const message = await bot.telegram.sendMessage(PREDICTION_CHANNEL,msg)

lastPrediction = ai.prediction
lastPredictionMsg = message.message_id
lastPredictionPeriod = period

}

//================ API CHECK ================

async function checkAPI(){

try{

const res = await axios.get(API_URL)

const list = res.data.data.list

const issue = list[0].issueNumber
const number = list[0].number

if(issue==lastIssue) return

lastIssue = issue

if(history.find(h=>h.issue==issue)) return

checkResult(number)

history.unshift({issue,number})

saveHistory()

const result = number>=5?"BIG":"SMALL"

const msg=`
📜 WIN GO HISTORY
━━━━━━━━━━━━━━
PERIOD : ${issue}

NUMBER : ${number}

RESULT : ${result}
━━━━━━━━━━━━━━
`

await bot.telegram.sendMessage(HISTORY_CHANNEL,msg)

sendPrediction(issue)

}catch(e){

console.log("API ERROR")

}

}

//================ COMMANDS ================

bot.start((ctx)=>{

ctx.reply("🤖 AI Prediction Bot Running")

})

//================ EXPRESS SERVER ================

const app = express()

app.get("/",(req,res)=>{

res.send("Bot Running 24 Hours")

})

app.listen(process.env.PORT || 3000)

//================ START ================

loadHistory()

bot.launch()

setInterval(checkAPI,15000)
