import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import Labubu from './Labubu.jsx'
import { talk, talkables } from './talk.js'

// Prof. Zaman: black hoodie with a BLACKPINK print, jeans, white kicks, glasses,
// and a pink Labubu swinging off his belt loop. Faces +z; his right hand is at -x.
// When you're chatting with him he turns to face you and talks with his hands.

const SKIN = '#c68a5e'
const HAIR = '#141010'
const HOODIE = '#121214'
const PINK = '#ff5fa8'
const JEANS = '#3d5f8f'

const mats = new Map()
const m = (color, o = {}) => {
  const k = color + JSON.stringify(o)
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o }))
  return mats.get(k)
}
const SPH = new THREE.SphereGeometry(1, 24, 16)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 24)
const BOX = new THREE.BoxGeometry(1, 1, 1)
const TORUS = new THREE.TorusGeometry(1, 0.12, 8, 28)
const PLANE = new THREE.PlaneGeometry(1, 1)

const B = ({ g = SPH, c, p, s, r = [0, 0, 0], o }) => <mesh geometry={g} material={m(c, o)} position={p} scale={s} rotation={r} />

function printTex() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 160
  const g = c.getContext('2d')
  g.fillStyle = HOODIE
  g.fillRect(0, 0, 512, 160)
  g.fillStyle = PINK
  g.font = '900 76px "Arial Black", Impact, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('BLACKPINK', 256, 70)
  g.font = 'bold 34px sans-serif'
  g.fillText('♡ BLINK ♡', 256, 132)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const angleLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k

export default function Zaman({ position = [0, 0, 0], rotation = 0 }) {
  const root = useRef()
  const head = useRef()
  const mouth = useRef()
  const armR = useRef()
  const armL = useRef()
  const charm = useRef()
  const me = useMemo(() => new THREE.Vector3(), [])
  const print = useMemo(() => new THREE.MeshBasicMaterial({ map: printTex() }), [])

  useEffect(() => {
    const obj = root.current
    obj.userData.talkId = 'zaman'
    talkables.add(obj)
    return () => talkables.delete(obj)
  }, [])

  useFrame(({ clock, camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const chatting = talk.with === 'zaman'
    const speaking = chatting && performance.now() < talk.speakingUntil
    const r = root.current
    r.getWorldPosition(me)
    const dx = camera.position.x - me.x
    const dz = camera.position.z - me.z

    // body: turn toward you while chatting, otherwise scan the room
    const yaw = chatting ? Math.atan2(dx, dz) : rotation + Math.sin(t * 0.4) * 0.35
    r.rotation.y = angleLerp(r.rotation.y, yaw, Math.min(1, dt * (chatting ? 5 : 2)))
    r.position.y = position[1] + Math.abs(Math.sin(t * 2.2)) * 0.012 // little bounce, he's hyped

    // head: look up/down at your eyes when chatting, nod along while talking
    const pitch = chatting ? -Math.atan2(camera.position.y - (me.y + 1.63), Math.hypot(dx, dz)) : 0
    const nod = speaking ? Math.sin(t * 7) * 0.06 : 0
    head.current.rotation.x += (THREE.MathUtils.clamp(pitch, -0.5, 0.5) + nod - head.current.rotation.x) * Math.min(1, dt * 6)
    head.current.rotation.z = speaking ? Math.sin(t * 3.1) * 0.05 : 0

    // mouth flaps while he's "talking"
    mouth.current.scale.y = speaking ? 0.006 + Math.abs(Math.sin(t * 16)) * 0.02 : 0.007

    // hands: gesture while explaining, relaxed otherwise
    const g = speaking ? 1 : 0
    armR.current.rotation.x = -0.15 - g * (0.9 + Math.sin(t * 5) * 0.35)
    armR.current.rotation.z = -0.1 - g * 0.1
    armL.current.rotation.x = -0.1 - g * (0.5 + Math.sin(t * 4 + 1) * 0.3)
    armL.current.rotation.z = 0.1 + g * 0.08

    // Labubu charm swings as he moves
    charm.current.rotation.z = Math.sin(t * 2.6) * 0.25
    charm.current.rotation.x = Math.sin(t * 1.9 + 0.7) * 0.12
  })

  return (
    <group ref={root} position={position} rotation={[0, rotation, 0]}>
      {/* sneakers */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <B g={BOX} c="#f4f4f6" p={[0.1 * sx, 0.055, 0.03]} s={[0.12, 0.09, 0.28]} />
          <B g={BOX} c={PINK} p={[0.1 * sx, 0.015, 0.03]} s={[0.125, 0.03, 0.285]} />
          <B g={BOX} c="#111" p={[0.1 * sx + 0.061 * sx, 0.06, 0.03]} s={[0.004, 0.025, 0.12]} />
        </group>
      ))}
      {/* jeans */}
      {[-1, 1].map((sx) => (
        <B key={sx} g={CYL} c={JEANS} p={[0.1 * sx, 0.49, 0]} s={[0.075, 0.8, 0.08]} />
      ))}
      <B g={BOX} c={JEANS} p={[0, 0.88, 0]} s={[0.34, 0.14, 0.2]} />
      <B g={BOX} c="#1a1a1a" p={[0, 0.94, 0]} s={[0.35, 0.035, 0.205]} />
      <B g={BOX} c="#c8c8cc" o={{ metalness: 0.9, roughness: 0.25 }} p={[0, 0.94, 0.104]} s={[0.05, 0.03, 0.006]} />

      {/* Labubu clipped to his right belt loop */}
      <group position={[-0.16, 0.93, 0.07]}>
        <B g={TORUS} c="#d8d8de" o={{ metalness: 0.9, roughness: 0.2 }} r={[0, Math.PI / 2, 0]} s={[0.018, 0.018, 0.018]} />
        <group ref={charm}>
          <B g={CYL} c="#d8d8de" o={{ metalness: 0.9, roughness: 0.2 }} p={[0, -0.04, 0]} s={[0.003, 0.07, 0.003]} />
          <Labubu fur="#ff8fc4" expression="mischief" shirt="#111111" height={0.2} position={[0, -0.28, 0]} rotation={Math.PI * 0.1} phase={1.3} />
        </group>
      </group>

      {/* hoodie */}
      <B g={CYL} c="#0b0b0d" p={[0, 0.93, 0]} s={[0.205, 0.06, 0.145]} />
      <B g={CYL} c={HOODIE} p={[0, 1.18, 0]} s={[0.2, 0.46, 0.14]} />
      <B c={HOODIE} p={[0, 1.4, 0]} s={[0.25, 0.09, 0.15]} />
      <mesh geometry={PLANE} material={print} position={[0, 1.23, 0.141]} scale={[0.27, 0.085, 1]} />
      <B g={BOX} c="#1c1c20" p={[0, 1.03, 0.139]} s={[0.24, 0.11, 0.008]} />
      {/* drawstrings */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <B g={CYL} c={PINK} p={[0.035 * sx, 1.36, 0.145]} s={[0.006, 0.13, 0.006]} />
          <B g={CYL} c="#f4f4f6" p={[0.035 * sx, 1.29, 0.145]} s={[0.008, 0.02, 0.008]} />
        </group>
      ))}
      {/* hood bunched behind the neck */}
      <B g={TORUS} c={HOODIE} p={[0, 1.46, -0.01]} r={[Math.PI / 2, 0, 0]} s={[0.1, 0.1, 0.25]} />
      <B c="#1a1a1e" p={[0, 1.4, -0.135]} r={[-0.25, 0, 0]} s={[0.17, 0.12, 0.05]} />

      {/* arms in hoodie sleeves; shoulder pivots */}
      <group ref={armL} position={[0.25, 1.4, 0]}>
        <B g={CYL} c={HOODIE} p={[0, -0.24, 0]} s={[0.06, 0.46, 0.06]} />
        <B g={CYL} c="#0b0b0d" p={[0, -0.48, 0]} s={[0.055, 0.04, 0.055]} />
        <B c={SKIN} p={[0, -0.54, 0.01]} s={[0.042, 0.055, 0.035]} />
      </group>
      <group ref={armR} position={[-0.25, 1.4, 0]}>
        <B g={CYL} c={HOODIE} p={[0, -0.24, 0]} s={[0.06, 0.46, 0.06]} />
        <B g={CYL} c="#0b0b0d" p={[0, -0.48, 0]} s={[0.055, 0.04, 0.055]} />
        <B c={SKIN} p={[0, -0.54, 0.01]} s={[0.042, 0.055, 0.035]} />
      </group>

      {/* neck + head (pivot at the neck so nods look natural) */}
      <B g={CYL} c={SKIN} p={[0, 1.5, 0]} s={[0.048, 0.08, 0.048]} />
      <group ref={head} position={[0, 1.52, 0]}>
        <group position={[0, -1.52, 0]}>
          <B c={SKIN} p={[0, 1.63, 0]} s={[0.105, 0.125, 0.112]} />
          {[-1, 1].map((sx) => (
            <B key={sx} c={SKIN} p={[0.106 * sx, 1.63, 0]} s={[0.018, 0.032, 0.02]} />
          ))}
          {/* hair: short black with volume up top */}
          <B c={HAIR} p={[0, 1.7, -0.01]} s={[0.112, 0.075, 0.118]} />
          <B c={HAIR} p={[0, 1.735, 0.03]} r={[0.35, 0, 0]} s={[0.09, 0.045, 0.085]} />
          <B c={HAIR} p={[0, 1.66, -0.06]} s={[0.108, 0.075, 0.075]} />
          {[-1, 1].map((sx) => (
            <B key={sx} c={HAIR} p={[0.095 * sx, 1.67, -0.01]} s={[0.025, 0.05, 0.08]} />
          ))}
          {/* eyes, brows, nose */}
          {[-1, 1].map((sx) => (
            <group key={sx}>
              <B c="#ffffff" p={[0.04 * sx, 1.645, 0.1]} s={[0.018, 0.014, 0.01]} />
              <B c="#1d1410" p={[0.04 * sx, 1.645, 0.108]} s={[0.009, 0.01, 0.006]} />
              <B g={BOX} c={HAIR} p={[0.042 * sx, 1.675, 0.103]} r={[0, 0, -0.12 * sx]} s={[0.04, 0.009, 0.01]} />
            </group>
          ))}
          <B c="#b97a50" p={[0, 1.615, 0.112]} s={[0.018, 0.025, 0.02]} />
          {/* nerd glasses */}
          {[-1, 1].map((sx) => (
            <group key={sx}>
              <B g={TORUS} c="#0e0e10" p={[0.042 * sx, 1.645, 0.112]} s={[0.03, 0.026, 0.03]} />
              <B c="#cfe6ff" o={{ transparent: true, opacity: 0.18, roughness: 0.05 }} p={[0.042 * sx, 1.645, 0.11]} s={[0.028, 0.024, 0.004]} />
              <B g={BOX} c="#0e0e10" p={[0.088 * sx, 1.65, 0.06]} s={[0.004, 0.006, 0.1]} />
            </group>
          ))}
          <B g={BOX} c="#0e0e10" p={[0, 1.648, 0.116]} s={[0.026, 0.005, 0.005]} />
          {/* grin */}
          <mesh ref={mouth} geometry={BOX} material={m('#5a2420')} position={[0, 1.585, 0.105]} scale={[0.045, 0.007, 0.01]} />
          <B g={BOX} c="#ffffff" p={[0, 1.589, 0.106]} s={[0.034, 0.004, 0.008]} />
        </group>
      </group>
    </group>
  )
}
