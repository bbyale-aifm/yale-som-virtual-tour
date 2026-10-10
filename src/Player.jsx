import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { MAX_STEP, SPAWN, cameraBlocked, collide, floorAt, locate } from './layout.js'
import Labubu from './Labubu.jsx'
import { TALK_RANGE, player, talk, talkables } from './talk.js'

// Third person: you're a Labubu, and the camera rides behind your right shoulder.
// PC: WASD walk (toward where the camera looks), mouse orbits the camera, Shift sprint,
// Space jump, C crouch. Touch comes in through touchRef: { active, move, look, jump }.
// Aim the crosshair at a professor and click to talk: onAim(id | null) and onTalk(id).

const HEIGHT = 1.0 // the Labubu is a meter tall
const JUMP_SPEED = 4.2
const GRAVITY = 12
const MOUSE_SPEED = 0.0022 // radians per mouse pixel
const LOOK_SPEED = 0.005 // radians per touch pixel
const CAM_DIST = 3.2 // meters behind the Labubu
const SHOULDER = 0.55 // camera sits this far to the right so the crosshair isn't on your head
const PITCH_MIN = -1.1 // looking down from above
const PITCH_MAX = 0.45 // looking up from low
const CENTER = new THREE.Vector2(0, 0)
const typing = (e) => /^(INPUT|TEXTAREA)$/.test(e.target?.tagName ?? '')
const angleLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k

// how far the camera can back away from the target (along -dir) before a wall gets in the way
function clearDistance(t, dx, dy, dz, want) {
  for (let d = 0.3; d <= want; d += 0.15) {
    if (cameraBlocked(t.x - dx * d, t.y - dy * d, t.z - dz * d)) return Math.max(0.6, d - 0.2)
  }
  return want
}

export default function Player({ lockRef, mapRef, touchRef, onLock, onWhere, onAim, onTalk }) {
  const { camera, gl } = useThree()
  const controls = useMemo(() => new PointerLockControls(camera, gl.domElement), [camera, gl])
  const keys = useRef({})
  const where = useRef('')
  const pos = useRef({ x: SPAWN.x, z: SPAWN.z })
  const yaw = useRef(0) // camera heading (0 = looking north / -z)
  const pitch = useRef(-0.28)
  const facing = useRef(Math.PI) // the Labubu's own heading (starts facing away from the camera)
  const floorY = useRef(0)
  const jumpY = useRef(0)
  const vy = useRef(0)
  const crouch = useRef(1)
  const camDist = useRef(CAM_DIST)
  const body = useRef()
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  const profPos = useMemo(() => new THREE.Vector3(), [])
  const aimed = useRef(null)
  const [gait, setGait] = useState('idle')
  const gaitRef = useRef('idle')

  useEffect(() => {
    lockRef.current = () => controls.lock()
    const on = () => onLock(true)
    const off = () => {
      keys.current = {} // keys held during Esc never get a keyup
      onLock(false)
    }
    controls.addEventListener('lock', on)
    controls.addEventListener('unlock', off)
    const move = (e) => {
      if (!controls.isLocked || talk.with) return
      yaw.current -= e.movementX * MOUSE_SPEED
      pitch.current = THREE.MathUtils.clamp(pitch.current - e.movementY * MOUSE_SPEED, PITCH_MIN, PITCH_MAX)
    }
    const down = (e) => {
      if (typing(e)) return // chatting: don't walk or jump while typing
      keys.current[e.code] = true
      if (e.code === 'Space') e.preventDefault()
    }
    const up = (e) => (keys.current[e.code] = false)
    const blur = () => (keys.current = {})
    const click = () => {
      if (!controls.isLocked || !aimed.current) return
      const id = aimed.current
      keys.current = {}
      controls.unlock()
      onTalk?.(id)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mousedown', click)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      controls.removeEventListener('lock', on)
      controls.removeEventListener('unlock', off)
      controls.dispose()
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mousedown', click)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [controls, lockRef, onLock, onTalk])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    // dev only: teleport for screenshots by setting <body data-go="[x, z, yawDeg, pitch]">
    if (import.meta.env.DEV && document.body.dataset.go) {
      const [x, z, yawDeg = 0, p = -0.28] = JSON.parse(document.body.dataset.go)
      delete document.body.dataset.go
      pos.current = { x, z }
      yaw.current = (yawDeg * Math.PI) / 180
      facing.current = yaw.current + Math.PI
      pitch.current = p
      floorY.current = floorAt(x, z)
    }
    const touch = touchRef.current
    const active = (controls.isLocked || touch.active) && !talk.with

    // touch look: drag on the right side of the screen orbits the camera
    if (touch.active && !talk.with && (touch.look[0] || touch.look[1])) {
      yaw.current -= touch.look[0] * LOOK_SPEED
      pitch.current = THREE.MathUtils.clamp(pitch.current - touch.look[1] * LOOK_SPEED, PITCH_MIN, PITCH_MAX)
    }
    touch.look[0] = 0
    touch.look[1] = 0

    // walk relative to where the camera looks
    const fx = -Math.sin(yaw.current)
    const fz = -Math.cos(yaw.current)
    const k = keys.current
    let f = 0
    let s = 0
    let sprint = false
    if (active) {
      f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0)
      s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0)
      sprint = k.ShiftLeft || k.ShiftRight
    }
    if (touch.active && !talk.with && (touch.move[0] || touch.move[1])) {
      f = -touch.move[1]
      s = touch.move[0]
      sprint = Math.hypot(f, s) > 0.95 // push the stick all the way to hurry
    }
    let mx = fx * f - fz * s
    let mz = fz * f + fx * s
    const l = Math.hypot(mx, mz)
    const crouching = active && k.KeyC
    let nextGait = 'idle'
    if (l > 0.05) {
      if (l > 1) {
        mx /= l
        mz /= l
      }
      const speed = crouching ? 2.4 : sprint ? 9.5 : 5.5 // m/s
      const p = pos.current
      const next = { x: p.x + mx * speed * dt, z: p.z + mz * speed * dt }
      collide(next)
      // risers: walk up one step at a time; anything taller acts like a wall
      const cur = floorAt(p.x, p.z)
      if (floorAt(next.x, next.z) - cur <= MAX_STEP) {
        p.x = next.x
        p.z = next.z
      } else if (floorAt(next.x, p.z) - cur <= MAX_STEP) {
        p.x = next.x // slide along the edge
      } else if (floorAt(p.x, next.z) - cur <= MAX_STEP) {
        p.z = next.z
      }
      facing.current = angleLerp(facing.current, Math.atan2(mx, mz), Math.min(1, dt * 12))
      nextGait = sprint && !crouching ? 'run' : 'walk'
    }

    // chatting: turn to face the professor
    if (talk.with) {
      for (const o of talkables) {
        if (o.userData.talkId !== talk.with) continue
        o.getWorldPosition(profPos)
        facing.current = angleLerp(facing.current, Math.atan2(profPos.x - pos.current.x, profPos.z - pos.current.z), Math.min(1, dt * 6))
      }
    }
    if (nextGait !== gaitRef.current) {
      gaitRef.current = nextGait
      setGait(nextGait)
    }

    // jump + crouch
    const wantJump = (active && k.Space) || touch.jump
    touch.jump = false
    if (active && wantJump && jumpY.current === 0) vy.current = JUMP_SPEED
    vy.current -= GRAVITY * dt
    jumpY.current = Math.max(0, jumpY.current + vy.current * dt)
    if (jumpY.current === 0) vy.current = 0
    crouch.current += ((crouching ? 0.72 : 1) - crouch.current) * Math.min(1, dt * 12)
    const fy = floorAt(pos.current.x, pos.current.z)
    floorY.current += (fy - floorY.current) * Math.min(1, dt * 14) // smooth step up/down
    const y = floorY.current + jumpY.current

    // place the Labubu
    const b = body.current
    b.position.set(pos.current.x, y, pos.current.z)
    b.rotation.y = facing.current
    b.scale.set(1, crouch.current, 1)
    player.x = pos.current.x
    player.y = y
    player.z = pos.current.z

    // camera: behind and above, over the right shoulder, pulled in if a wall is behind us
    const cp = Math.cos(pitch.current)
    const dirX = fx * cp
    const dirY = Math.sin(pitch.current)
    const dirZ = fz * cp
    const rx = Math.cos(yaw.current)
    const rz = -Math.sin(yaw.current)
    target.set(pos.current.x + rx * SHOULDER, y + HEIGHT * 0.85 * crouch.current, pos.current.z + rz * SHOULDER)
    const want = clearDistance(target, dirX, dirY, dirZ, CAM_DIST)
    camDist.current = want < camDist.current ? want : camDist.current + (want - camDist.current) * Math.min(1, dt * 4)
    // pushed in by a wall? rise up and look over the Labubu's head instead of into it
    const lift = THREE.MathUtils.clamp((CAM_DIST - camDist.current) / CAM_DIST, 0, 1) * 1.1
    camera.position.set(target.x - dirX * camDist.current, target.y - dirY * camDist.current + lift, target.z - dirZ * camDist.current)
    // stay above desk height (stadium rows behind you are higher than your floor)
    camera.position.y = Math.max(camera.position.y, floorAt(camera.position.x, camera.position.z) + 1.2)
    look.set(target.x + dirX, target.y + dirY + lift * 0.85, target.z + dirZ)
    camera.lookAt(look)

    // what's under the crosshair? (only professors are tested, so this is cheap)
    let hit = null
    if (active && talkables.size) {
      ray.setFromCamera(CENTER, camera)
      ray.far = camDist.current + TALK_RANGE
      const found = ray.intersectObjects([...talkables], true)[0]
      if (found && Math.hypot(found.point.x - pos.current.x, found.point.z - pos.current.z) <= TALK_RANGE) {
        let o = found.object
        while (o && !o.userData.talkId) o = o.parent
        hit = o?.userData.talkId ?? null
      }
    }
    if (hit !== aimed.current) {
      aimed.current = hit
      onAim?.(hit)
    }

    if (import.meta.env.DEV) document.body.dataset.pos = `${pos.current.x.toFixed(2)},${pos.current.z.toFixed(2)},${fx.toFixed(2)},${fz.toFixed(2)}|${touch.move.map((v) => v.toFixed(2))}`
    mapRef.current?.(pos.current.x, pos.current.z, fx, fz)
    const w = locate(pos.current.x, pos.current.z)
    if (w !== where.current) {
      where.current = w
      onWhere(w)
    }
  })

  return (
    <group ref={body} position={[SPAWN.x, 0, SPAWN.z]}>
      <Labubu fur="#ff8fc7" expression="grin" shirt="yale" height={HEIGHT} anim={gait} />
    </group>
  )
}
