const { Telegraf } = require("telegraf")
const axios = require("axios")
const fs = require("fs")
const express = require("express")

// ---------------- CONFIG ----------------

const BOT_TOKEN = "8795656071:AAH9VOfrOFrNe1-Z44mzFvT3Iz0a9odiU00"

const HISTORY_CHANNEL = "-1003756626165"
const PREDICTION_CHANNEL = "-1003829129679"

const HISTORY_FILE = "./history.json"

const bot = new Telegraf(BOT_TOKEN)

let history = []

// ---------------- LOAD HISTORY ----------------

function loadHistory(){

if(fs.existsSync(HISTORY_FILE)){

history = JSON.parse(fs.readFileSync(HISTORY_FILE))

console.log("History Loaded:",history.length)

}

}

// ---------------- SAVE HISTORY ----------------

function saveHistory(){

fs.writeFileSync(HISTORY_FILE,JSON.stringify(history,null,2))

}

// ---------------- COLOR RULE ----------------

function getColor(n){

if([0,2,4,6,8].includes(n)) return "RED"
return "GREEN"

}

// ---------------- AI ENGINE ----------------

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

let prediction=""

if(red.length>green.length) prediction="RED"
else if(green.length>red.length) prediction="GREEN"
else{

if(big.length>small.length) prediction="BIG"
else if(small.length>big.length) prediction="SMALL"
else prediction = matchNumbers[0]>=5?"BIG":"SMALL"

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

return{prediction:"BIG",matchNumbers:[],level:0}

}

// ---------------- FILE HISTORY LOAD ----------------

bot.command("load", async (ctx)=>{

if(!ctx.message.reply_to_message){

return ctx.reply("Reply file with /load")

}

const doc = ctx.message.reply_to_message.document

if(!doc){

return ctx.reply("File nahi mili")

}

try{

const link = await ctx.telegram.getFileLink(doc.file_id)

const res = await axios.get(link.href)

const lines = res.data.split("\n")

let added=0

// bottom first
for(let i=lines.length-1;i>=0;i--){

const line = lines[i].trim()

if(!line) continue

const parts = line.split(":")

if(parts.length<2) continue

const issue = parts[0].trim()

const number = parseInt(parts[1].trim())

if(isNaN(number)) continue

// duplicate check
if(history.find(h=>h.issue==issue)) continue

// save top
history.unshift({issue,number})

const result = number>=5?"BIG":"SMALL"

const msg = `
📜 WIN GO HISTORY
━━━━━━━━━━━━━━
🆔 PERIOD : ${issue}
🎲 NUMBER : ${number}
📊 RESULT : ${result}
━━━━━━━━━━━━━━
`

await bot.telegram.sendMessage(HISTORY_CHANNEL,msg)

added++

}

saveHistory()

ctx.reply(`✅ ${added} History Added`)

}catch(e){

console.log(e)

ctx.reply("Load Failed")

}

})

// ---------------- HISTORY DOWNLOAD ----------------

bot.command("history",async(ctx)=>{

let data=""

history.forEach(h=>{

data+=`${h.issue} : ${h.number}\n`

})

fs.writeFileSync("history.txt",data)

await ctx.replyWithDocument({source:"history.txt"})

fs.unlinkSync("history.txt")

})

// ---------------- PREDICTION ----------------

async function sendPrediction(){

if(history.length<10) return

const ai = getPrediction()

const msg=`
🎯 AI PREDICTION
━━━━━━━━━━━━━━

MATCH NUMBERS
${ai.matchNumbers.join(" ")}

🔼BIG   : ${ai.big.join(",")}
🔽SMALL : ${ai.small.join(",")}

🔴RED   : ${ai.red.join(",")}
🟢GREEN : ${ai.green.join(",")}

FINAL PREDICTION : ${ai.prediction}

MATCH NUMBER : ${ai.matchNumbers.join(",")}

🧠 MACHINE LEVEL : L-${ai.level}
`

await bot.telegram.sendMessage(PREDICTION_CHANNEL,msg)

}

// ---------------- START COMMAND ----------------

bot.start((ctx)=>{

ctx.reply(`
🤖 AI Prediction Bot Running

Commands

/history  → Download history
/load     → Upload history file
`)

})

// ---------------- SERVER ----------------

const app = express()

app.get("/",(req,res)=>res.send("Bot Running"))

app.listen(process.env.PORT||3000)

// ---------------- START BOT ----------------

loadHistory()

bot.launch()

setInterval(sendPrediction,60000)
