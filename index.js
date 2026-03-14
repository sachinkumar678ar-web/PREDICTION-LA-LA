const { Telegraf } = require("telegraf")
const { TelegramClient } = require("telegram")
const { StringSession } = require("telegram/sessions")
const input = require("input")
const axios = require("axios")
const fs = require("fs")
const express = require("express")

// ---------------- CONFIG ----------------

const BOT_TOKEN = "8795656071:AAH9VOfrOFrNe1-Z44mzFvT3Iz0a9odiU00"

const API_ID = "35535716"
const API_HASH = "943a2a0be45350eed9b3c320f657e296"

const SOURCE_CHANNEL = "-1003857402557"

const HISTORY_CHANNEL = "-1003756626165"
const PREDICTION_CHANNEL = "-1003829129679"

const stringSession = new StringSession("")

const HISTORY_FILE = "./history.json"

const bot = new Telegraf(BOT_TOKEN)

let history=[]
let lastPrediction=""
let lastMsgId=null
let lastLevel=""

// ---------------- LOAD HISTORY ----------------

function loadHistory(){

if(fs.existsSync(HISTORY_FILE)){
history = JSON.parse(fs.readFileSync(HISTORY_FILE))
console.log("History Loaded:",history.length)
}

}

// ---------------- SAVE HISTORY ----------------

function saveHistory(){

fs.writeFileSync(HISTORY_FILE,JSON.stringify(history))

}

// ---------------- COLOR RULE ----------------

function getColor(n){

if([2,4,6,8,0].includes(n)) return "RED"
return "GREEN"

}

// ---------------- AI ENGINE ----------------

function getPrediction(){

const numbers = history.map(x=>x.number)

for(let len=3; len>=1; len--){

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

// ---------------- READ CHANNEL HISTORY ----------------

async function readHistory(){

const client = new TelegramClient(stringSession, API_ID, API_HASH,{
connectionRetries:5
})

await client.start({
phoneNumber: async()=>await input.text("Phone: "),
phoneCode: async()=>await input.text("Code: "),
password: async()=>await input.text("Password: "),
onError:(err)=>console.log(err)
})

console.log("Reader Started")

const messages = await client.getMessages(SOURCE_CHANNEL,{limit:500})

messages.forEach(msg=>{

if(!msg.text) return

const period = msg.text.match(/PERIOD\s*:\s*(\d+)/i)
const number = msg.text.match(/NUMBER\s*:\s*(\d+)/i)

if(period && number){

const issue = period[1]
const num = parseInt(number[1])

if(!history.find(h=>h.issue==issue)){
history.unshift({issue:number})
}

}

})

saveHistory()

}

// ---------------- FILE HISTORY LOADER ----------------

bot.command("load", async (ctx)=>{

if(!ctx.message.reply_to_message || !ctx.message.reply_to_message.document){
return ctx.reply("Reply file with /load")
}

const file = ctx.message.reply_to_message.document

const link = await ctx.telegram.getFileLink(file.file_id)

const res = await axios.get(link.href)

const lines = res.data.split("\n")

let newCount=0

for(const line of lines){

const parts = line.trim().split(/[\s:,-]+/)

if(parts.length<2) continue

const issue = parts[0]
const number = parseInt(parts[1])

if(history.find(h=>h.issue==issue)) continue

history.unshift({issue,number})

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

newCount++

}

saveHistory()

ctx.reply(✅ ${newCount} history added)

})

// ---------------- SEND PREDICTION ----------------

async function sendPrediction(){

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

const message = await bot.telegram.sendMessage(PREDICTION_CHANNEL,msg)

lastPrediction = ai.prediction
lastMsgId = message.message_id
lastLevel = ai.level

}

// ---------------- BOT COMMANDS ----------------

bot.start((ctx)=>{

ctx.reply(`
🤖 AI Prediction Bot Running

Commands

/history → download history
/load → upload history file
`)

})

bot.command("history",async(ctx)=>{

let data=""

history.forEach(h=>{
data+=${h.issue} ${h.number}\n
})

fs.writeFileSync("history.txt",data)

await ctx.replyWithDocument({source:"history.txt"})

fs.unlinkSync("history.txt")

})

// ---------------- SERVER ----------------

const app = express()

app.get("/",(req,res)=>res.send("Bot Running"))

app.listen(process.env.PORT||3000)

// ---------------- START ----------------

loadHistory()

readHistory()

bot.launch()

setInterval(sendPrediction,60000)
