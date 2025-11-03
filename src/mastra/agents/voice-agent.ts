import { Agent } from "@mastra/core/agent"
import { getMicrophoneStream, playAudio } from "@mastra/node-audio"
import { OpenAIRealtimeVoice } from "@mastra/voice-openai-realtime"
import {  Readable } from "stream"
import * as readline from "readline"

export const agent = new Agent({
  name: "Voice Agent, Viki",
  instructions: `You are Viki, calling from the hospital to confirm an appointment. You're warm, caring, and genuinely helpful.

CLIENT INFORMATION:
- Name: Alex
- Date: October 30, 2025
- Time: 2:00 PM
- Location: Main Clinic, Room 203
- Appointment Type: General Checkup

Opening (warm and friendly):
"Hi Alex! This is Viki from the clinic. How are you doing today?"

(Wait for response, then continue)

"I'm calling to confirm your appointment. You're scheduled for a general checkup tomorrow, October 30th at 2 PM in our Main Clinic, Room 203. Does that still work for you?"

Then confirm:
1. "Great! And just to confirm - you can make it at 2 PM, correct?"
2. "Perfect! Do you know how to get to Room 203, or would you like directions?"
3. "Wonderful! Do you have any questions before your checkup tomorrow?"

Closing:
"Excellent! We'll see you tomorrow at 2 PM. Take care, Alex!"

Keep responses SHORT, warm, and conversational. Wait for their response before moving forward.
If they need to reschedule, say: "No problem! Let me help you find a better time."`,

  model: {
    id: "openai/gpt-4o",
    apiKey: "",
  },
  voice: new OpenAIRealtimeVoice({
    apiKey: "",
    model: "gpt-4o-realtime-preview-2024-10-01",
    speaker: "sage",
  }),
})

let isTalking = false

const startAgent = async () => {
  await agent.voice.connect()

  agent.voice.on("speaker", (audioStream) => {
    playAudio(audioStream)
  })

  agent.voice.on("writing", ({ text, role }) => {
    if (text.trim()) {
      console.log(`${role}: ${text}`)
    }
  })

  agent.voice.on("response.done", () => {
    console.log("\nViki finished. Press SPACE to talk, ENTER to submit\n")
  })

  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }

  let micBuffer: Buffer[] = []
  const rawMicStream = getMicrophoneStream()

  rawMicStream.on("data", (chunk) => {
    if (isTalking) {
      micBuffer.push(chunk)
    }
  })

  process.stdin.on("keypress", async (str, key) => {
    if (key.name === "space") {
      if (!isTalking) {
        isTalking = true
        micBuffer = []
        console.log("\nRECORDING... (Press ENTER when done)")
      }
    } else if (key.name === "return") {
      if (isTalking && micBuffer.length > 0) {
        isTalking = false
        console.log("Sending audio to Viki...")

        const audioStream = new Readable({
          read() {
            for (const chunk of micBuffer) {
              this.push(chunk)
            }
            this.push(null)
          }
        })

        await agent.voice.send(audioStream)

        micBuffer = []
      }
    } else if (key.ctrl && key.name === "c") {
      process.exit()
    }
  })

  console.log("HOLD SPACE to record")
  console.log("PRESS ENTER to send")

  process.stdin.resume()
}

void startAgent()