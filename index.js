process.on("uncaughtException", err => console.log(err))
process.on("unhandledRejection", err => console.log(err))

const { Telegraf } = require("telegraf")
const axios = require("axios")
const fs = require("fs")
const express = require("express")

// ---------- CONFIG ----------

const BOT_TOKEN = "8795656071:AAH9VOfrOFrNe1-Z44mzFvT3Iz0a9odiU00"

const HISTORY_CHANNEL = "-1003756626165"
const PREDICTION_CHANNEL = "-1003829129679"

const HISTORY_FILE = "./history.json"

const bot = new Telegraf(BOT_TOKEN)

let history=[]
let lastPrediction=null
let lastMessageId=null

// ---------- LOAD HISTORY ----------

function loadHistory(){

if(fs.existsSync(HISTORY_FILE)){
history = JSON.parse(fs.readFileSync(HISTORY_FILE))
console.log("History Loaded:",history.length)
}

}

// ---------- SAVE HISTORY ----------

function saveHistory(){
fs.writeFileSync(HISTORY_FILE,JSON.stringify(history))
}

// ---------- COLOR RULE ----------

function getColor(n){

if([0,2,4,6,8].includes(n)) return "RED"
return "GREEN"

}

// ---------- AI ENGINE (L4 → L1) ----------

function getPrediction(){

const numbers = history.map(x=>x.number)

for(let level=4; level>=1; level--){

const pattern = numbers.slice(0,level)

let matchNumbers=[]

for(let i=1;i<numbers.length-level;i++){

const win = numbers.slice(i,i+level)

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

let prediction=""

if(red.length>green.length){
prediction="RED"
}
else if(green.length>red.length){
prediction="GREEN"
}
else{

if(big.length>small.length){
prediction="BIG"
}
else if(small.length>big.length){
prediction="SMALL"
}
else{
prediction = matchNumbers[0]>=5?"BIG":"SMALL"
}

}

return{
prediction,
matchNumbers,
big,
small,
red,
green,
level
}

}

}

return{
prediction:"BIG",
matchNumbers:[],
level:0
}

}

// ---------- SEND PREDICTION ----------

async function sendPrediction(issue){

const ai = getPrediction()

const msg = `
🎯 AI PREDICTION
━━━━━━━━━━━━━━
🌟PERIOD : ${issue}

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

const m = await bot.telegram.sendMessage(PREDICTION_CHANNEL,msg)

lastPrediction = ai.prediction
lastMessageId = m.message_id

}

// ---------- RESULT CHECK ----------

async function checkResult(number){

if(!lastPrediction) return

let result = number>=5?"BIG":"SMALL"
let color = getColor(number)

let win=false

if(lastPrediction==result) win=true
if(lastPrediction==color) win=true

const msg=`
RESULT UPDATE
━━━━━━━━━━━━━━
NUMBER : ${number}

PREDICTION : ${lastPrediction}

RESULT : ${win?"WIN ✅":"LOSS ❌"}
`

await bot.telegram.sendMessage(PREDICTION_CHANNEL,msg)

if(lastMessageId){

try{
await bot.telegram.deleteMessage(PREDICTION_CHANNEL,lastMessageId)
}catch(e){}

}

}

// ---------- HISTORY FILE LOAD ----------

bot.command("load", async (ctx)=>{

if(!ctx.message.reply_to_message || !ctx.message.reply_to_message.document){
return ctx.reply("Reply history file with /load")
}

const file = ctx.message.reply_to_message.document
const link = await ctx.telegram.getFileLink(file.file_id)

const res = await axios.get(link.href)

const lines = res.data.split("\n")

let count=0

for(const line of lines){

const parts = line.trim().split(" ")

if(parts.length<2) continue

const issue = parts[0]
const number = parseInt(parts[1])

if(history.find(h=>h.issue==issue)) continue

history.unshift({issue,number})

if(history.length>50000) history.pop()

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

count++

}

saveHistory()

ctx.reply(`✅ ${count} history added`)

})

// ---------- DOWNLOAD HISTORY ----------

bot.command("history", async(ctx)=>{

let data=""

history.forEach(h=>{
data+=`${h.issue} ${h.number}\n`
})

fs.writeFileSync("history.txt",data)

await ctx.replyWithDocument({source:"history.txt"})

fs.unlinkSync("history.txt")

})

// ---------- START COMMAND ----------

bot.start(ctx=>{

ctx.reply(`
🤖 AI Prediction Bot Running

Commands:

/history → download history
/load → upload history file
`)

})

// ---------- MAIN LOOP ----------

async function loop(){

try{

const res = await axios.get(
"https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json?pageSize=10"
)

const list = res.data?.data?.list

if(!list) return

const latest = list[0]

const issue = latest.issueNumber
const number = parseInt(latest.number)

if(history.find(h=>h.issue==issue)) return

history.unshift({issue,number})

if(history.length>50000) history.pop()

saveHistory()

// send history

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

// check previous prediction

await checkResult(number)

// next prediction

const nextIssue = (BigInt(issue)+1n).toString()

await sendPrediction(nextIssue)

}catch(e){

console.log("Loop Error")

}

}

// ---------- SERVER ----------

const app = express()

app.get("/",(req,res)=>{
res.send("Bot Running 24 Hours 🚀")
})

app.listen(process.env.PORT || 3000)

// ---------- START BOT ----------

loadHistory()

bot.launch()

setInterval(loop,15000)
