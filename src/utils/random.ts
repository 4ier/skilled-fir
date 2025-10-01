const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

export function createInviteCode(length = 4): string {
  const array = new Uint32Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (value) => CHARSET[value % CHARSET.length]).join('')
}

const NAME_PREFIXES = ['技能校长', '综艺杠精', '脱口秀猛兽', '飞沙走石王', '爆梗猎手', '热搜预定', '节奏大师']
const NAME_SUFFIXES = ['·小龙虾', '·电动牙刷', '·回旋镖', '·迪斯科', '·表情包', '·滑板鞋', '·焰火机']

export function randomFunnyName(exclude?: string[]): string {
  const used = new Set(exclude ?? [])
  let prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)]
  let suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)]
  let candidate = `${prefix}${suffix}`
  let attempts = 0
  while (used.has(candidate) && attempts < 10) {
    prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)]
    suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)]
    candidate = `${prefix}${suffix}`
    attempts += 1
  }
  return candidate
}
