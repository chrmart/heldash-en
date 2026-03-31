import { FastifyInstance, FastifyReply } from 'fastify'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { getDb } from '../db/database'

interface UserRow {
  id: string
  username: string
  password_hash: string | null
  role: string
  email: string | null
  first_name: string | null
  last_name: string | null
  user_group_id: string | null
  is_active: number
  last_login: string | null
  created_at: string
}

interface SetupBody {
  username: string
  password: string
  first_name: string
  last_name: string
  email?: string
}

interface LoginBody {
  username: string
  password: string
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 86400, // 1 day
} as const

function setAuthCookie(app: FastifyInstance, reply: FastifyReply, user: UserRow) {
  const token = app.jwt.sign(
    { sub: user.id, username: user.username, role: user.role, groupId: user.user_group_id },
    { expiresIn: '1d' }
  )
  reply.setCookie('auth_token', token, {
    ...COOKIE_OPTS,
    secure: process.env.SECURE_COOKIES === 'true',
  })
  return token
}

export async function authRoutes(app: FastifyInstance) {
  const db = getDb()

  // GET /api/auth/status — public; tells frontend whether setup is needed and who is logged in
  app.get('/api/auth/status', async (req) => {
    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt
    const needsSetup = userCount === 0

    let user = null
    try {
      await req.jwtVerify()
      user = req.user
    } catch {
      // not authenticated – that's fine
    }

    return { needsSetup, user }
  })

  // POST /api/auth/setup — creates the first admin user (only if no users exist)
  app.post<{ Body: SetupBody }>('/api/auth/setup', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt
    if (userCount > 0) {
      return reply.status(409).send({ error: 'Setup already completed' })
    }

    const { username, password, first_name, last_name, email } = req.body
    if (!username?.trim()) return reply.status(400).send({ error: 'username is required' })
    if (!password || password.length < 8) return reply.status(400).send({ error: 'password must be at least 8 characters' })
    if (!first_name?.trim()) return reply.status(400).send({ error: 'first_name is required' })
    if (!last_name?.trim()) return reply.status(400).send({ error: 'last_name is required' })

    const password_hash = await bcrypt.hash(password, 12)
    const id = nanoid()

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, email, first_name, last_name, user_group_id, is_active)
      VALUES (?, ?, ?, 'admin', ?, ?, ?, 'grp_admin', 1)
    `).run(id, username.trim(), password_hash, email?.trim() ?? null, first_name.trim(), last_name.trim())

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow
    setAuthCookie(app, reply, user)

    app.log.info({ username: user.username }, 'Initial admin account created')

    return reply.status(201).send({
      sub: user.id,
      username: user.username,
      role: user.role,
      groupId: user.user_group_id,
    })
  })

  // POST /api/auth/login
  app.post<{ Body: LoginBody }>('/api/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { username, password } = req.body
    if (!username || !password) return reply.status(400).send({ error: 'username and password required' })

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined
    if (!user || !user.password_hash) {
      app.log.warn({ username }, 'Login failed: user not found')
      return reply.status(401).send({ error: 'Invalid credentials' })
    }
    if (!user.is_active) {
      app.log.warn({ username }, 'Login attempt on disabled account')
      return reply.status(403).send({ error: 'Account disabled' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      app.log.warn({ username }, 'Login failed: invalid password')
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    db.prepare("UPDATE users SET last_login = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(user.id)
    setAuthCookie(app, reply, user)

    app.log.info({ username, groupId: user.user_group_id }, 'User logged in')

    return {
      sub: user.id,
      username: user.username,
      role: user.role,
      groupId: user.user_group_id,
    }
  })

  // POST /api/auth/logout
  app.post('/api/auth/logout', async (req, reply) => {
    let username = 'unknown'
    try {
      await req.jwtVerify()
      username = req.user.username
    } catch { /* token missing or invalid — still allow logout */ }
    reply.clearCookie('auth_token', { path: '/' })
    app.log.info({ username }, 'User logged out')
    return { ok: true }
  })

  // GET /api/auth/me — requires auth
  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (req) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub) as UserRow | undefined
    if (!user) return { error: 'User not found' }
    return {
      sub: user.id,
      username: user.username,
      role: user.role,
      groupId: user.user_group_id,
    }
  })
}
