// Shared state for talking to professors (read inside useFrame, so plain mutable objects).
//   talkables: three.js objects you can click on, each with userData.talkId
//   talk.with:  id of the professor you're chatting with (null when not chatting)
//   talk.speakingUntil: clock time (ms) until which the professor's mouth moves

export const talkables = new Set()

export const talk = {
  with: null,
  speakingUntil: 0,
}

export const TALK_RANGE = 7 // meters: close enough to start a conversation

export const API_BASE = import.meta.env.VITE_API_BASE ?? ''
