/**
 * PocketBase adapter for the CRM - implements the Puter.js API surface
 * that store.js expects: puter.kv, puter.auth, puter.ai, puter.fs
 */
class PocketBaseAdapter {
  constructor(baseUrl = '') {
    // Use relative path for browser (proxied through Vite), full URL for direct access
    this.baseUrl = baseUrl || (typeof window !== 'undefined' ? '' : 'http://127.0.0.1:8090')
    this.authToken = null
    this.user = null
    this.collections = {
          settings: 'crm_settings',
          companies: 'crm_companies',
          contacts: 'crm_contacts',
          deals: 'crm_deals',
          activities: 'crm_activities',
          tasks: 'crm_tasks',
          templates: 'crm_templates',
          attachments: 'crm_attachments',
          trash: 'crm_trash',
          backup: 'crm_backup',
          kv: 'crm_kv',
          comments: 'crm_comments',
        }
    this.kvKeyMap = {
      'crm:settings:v1': 'settings',
      'crm:companies:v1': 'companies',
      'crm:contacts:v1': 'contacts',
      'crm:deals:v1': 'deals',
      'crm:activities:v1': 'activities',
      'crm:tasks:v1': 'tasks',
      'crm:templates:v1': 'templates',
      'crm:attachments:v1': 'attachments',
      'crm:trash:v1': 'trash',
      'crm:backup:v1': 'backup',
      'crm:user:v1': 'user',
    }
  }

  async _request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers }
    if (this.authToken) headers.Authorization = `Bearer ${this.authToken}`

    const res = await fetch(`${this.baseUrl}/api${path}`, { ...options, headers })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }))
      throw new Error(err.message || `HTTP ${res.status}`)
    }
    return res.json()
  }

  async _requestBlob(path, options = {}) {
    const headers = { ...options.headers }
    if (this.authToken) headers.Authorization = `Bearer ${this.authToken}`
    const res = await fetch(`${this.baseUrl}/api${path}`, { ...options, headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.blob()
  }

  // ----- Auth -----
  async signIn(email, password) {
    const data = await this._request('/collections/users/auth-with-password', {
      method: 'POST',
      body: JSON.stringify({ identity: email, password }),
    })
    this.authToken = data.token
    this.user = data.record
    localStorage.setItem('pb_auth_token', data.token)
    return true
  }

  async signUp(email, password, passwordConfirm) {
    await this._request('/collections/users/records', {
      method: 'POST',
      body: JSON.stringify({ email, password, passwordConfirm, username: email.split('@')[0] }),
    })
    return this.signIn(email, password)
  }

  async signOut() {
    this.authToken = null
    this.user = null
    localStorage.removeItem('pb_auth_token')
  }

  async isSignedIn() {
    if (!this.authToken) return false
    try {
      await this._request('/collections/users/auth-refresh', { method: 'POST' })
      return true
    } catch {
      this.authToken = null
      this.user = null
      localStorage.removeItem('pb_auth_token')
      return false
    }
  }

  async getUser() {
    if (!this.authToken) throw new Error('Not signed in')
    if (this.user) return { username: this.user.username || this.user.email, uuid: this.user.id }
    const data = await this._request('/collections/users/auth-refresh', { method: 'POST' })
    this.user = data.record
    return { username: this.user.username || this.user.email, uuid: this.user.id }
  }

  // ----- KV -----
  _mapKey(key) {
    return this.kvKeyMap[key] || key
  }

  _getCollection(key) {
    const mapped = this._mapKey(key)
    return this.collections[mapped] || this.collections.kv
  }

  async kvGet(key) {
    const collection = this._getCollection(key)
    const mappedKey = this._mapKey(key)

    // For typed collections, return the full list as array
    if (collection !== this.collections.kv) {
      const data = await this._request(`/collections/${collection}/records?perPage=5000`)
      return data.items
    }

    // For generic KV, look up by key field
    try {
      const data = await this._request(`/collections/${this.collections.kv}/records?filter=key="${mappedKey}"&perPage=1`)
      return data.items[0]?.value ?? null
    } catch {
      return null
    }
  }

  async kvSet(key, value) {
    const collection = this._getCollection(key)
    const mappedKey = this._mapKey(key)

    if (collection !== this.collections.kv) {
      // For typed collections, we expect value to be the full array
      // This is a full-collection replace (as Puter KV does)
      // First, delete all existing records
      const existing = await this._request(`/collections/${collection}/records?perPage=5000`)
      for (const record of existing.items) {
        await this._request(`/collections/${collection}/records/${record.id}`, { method: 'DELETE' })
      }
      // Then create new ones
      if (Array.isArray(value)) {
        for (const item of value) {
          await this._request(`/collections/${collection}/records`, {
            method: 'POST',
            body: JSON.stringify(item),
          })
        }
      }
      return true
    }

    // Generic KV: upsert by key
    try {
      const existing = await this._request(`/collections/${this.collections.kv}/records?filter=key="${mappedKey}"&perPage=1`)
      if (existing.items.length) {
        await this._request(`/collections/${this.collections.kv}/records/${existing.items[0].id}`, {
          method: 'PATCH',
          body: JSON.stringify({ value }),
        })
      } else {
        await this._request(`/collections/${this.collections.kv}/records`, {
          method: 'POST',
          body: JSON.stringify({ key: mappedKey, value }),
        })
      }
      return true
    } catch (e) {
      console.error('kvSet error:', e)
      return false
    }
  }

  async kvDel(key) {
    const collection = this._getCollection(key)
    const mappedKey = this._mapKey(key)

    if (collection !== this.collections.kv) {
      // Delete all records in collection
      const existing = await this._request(`/collections/${collection}/records?perPage=5000`)
      for (const record of existing.items) {
        await this._request(`/collections/${collection}/records/${record.id}`, { method: 'DELETE' })
      }
      return true
    }

    try {
      const existing = await this._request(`/collections/${this.collections.kv}/records?filter=key="${mappedKey}"&perPage=1`)
      if (existing.items.length) {
        await this._request(`/collections/${this.collections.kv}/records/${existing.items[0].id}`, { method: 'DELETE' })
        return true
      }
      return false
    } catch {
      return false
    }
  }

  // ----- AI -----
  async aiChat(prompt, options = {}) {
    // For now, return a mock response - can be wired to a real LLM later
    await new Promise(r => setTimeout(r, 700))
    if (/one JSON object/i.test(prompt)) {
      const from = (re) => (prompt.match(re) || [])[1] || ''
      return {
        message: {
          content: JSON.stringify(/website/i.test(prompt)
            ? { name: from(/^([A-Z][\w&' ]+)$/m) || 'Northwind Robotics', industry: 'Manufacturing', website: from(/([\w-]+\.(?:com|example|io|co))/) || 'northwind.example' }
            : { name: from(/^([A-Z][a-z]+ [A-Z][a-z]+)$/m) || 'Mei Tanaka', title: from(/^((?:VP|Head|Director|Chief)[^\n]*)$/m) || 'VP Operations', email: from(/([\w.+-]+@[\w.-]+\.\w+)/), phone: from(/(\+?[\d][\d\s().-]{7,}\d)/), company: from(/([\w&' ]+(?:Robotics|Health|Freight|Supply|Analytics|Co))/) }),
        },
      }
    }
    if (/Sum up where this stands/i.test(prompt)) {
      return { message: { content: 'You have had three conversations and the last one moved it forward. The security review is the open question and nobody has answered it. Next: get the checklist back from engineering and send it on.' } }
    }
    return { message: { content: 'Thanks again for the time yesterday - the notes are below.\n\nHappy to pick this up whenever suits you.' } }
  }

  // ----- FS -----
  async fsWrite(path, data, options = {}) {
    const blob = data instanceof Blob ? data : new Blob([data ?? ''])
    const arrayBuffer = await blob.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    const name = path.split('/').pop()

    const record = await this._request(`/collections/${this.collections.attachments}/records`, {
      method: 'POST',
      body: JSON.stringify({ name, path, size: blob.size, type: blob.type, uploadedAt: Date.now(), data: base64 }),
    })
    return { path: record.id, name, size: blob.size }
  }

  async fsRead(path) {
    const record = await this._request(`/collections/${this.collections.attachments}/records/${path}`)
    const base64 = record.data
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: record.type })
  }

  async fsDelete(path) {
    await this._request(`/collections/${this.collections.attachments}/records/${path}`, { method: 'DELETE' })
  }

  async fsReaddir(dir) {
    const prefix = dir.replace(/\/$/, '')
    const data = await this._request(`/collections/${this.collections.attachments}/records?filter=path~"${prefix}/"&perPage=500`)
    return data.items.map(p => ({ path: p.id, name: p.name, size: p.size }))
  }

  async fsMkdir() { return {} }
}

// Initialize and expose as window.puter
const adapter = new PocketBaseAdapter()
window.puter = {
  env: 'web',
  auth: {
    isSignedIn: () => adapter.isSignedIn(),
    signIn: (email, password) => adapter.signIn(email, password),
    signUp: (email, password, confirm) => adapter.signUp(email, password, confirm),
    signOut: () => adapter.signOut(),
    getUser: () => adapter.getUser(),
  },
  kv: {
    get: (key) => adapter.kvGet(key),
    set: (key, value) => adapter.kvSet(key, value),
    del: (key) => adapter.kvDel(key),
  },
  ai: {
    chat: (prompt, options) => adapter.aiChat(prompt, options),
  },
  fs: {
    write: (path, data, options) => adapter.fsWrite(path, data, options),
    read: (path) => adapter.fsRead(path),
    delete: (path) => adapter.fsDelete(path),
    readdir: (dir) => adapter.fsReaddir(dir),
    mkdir: () => adapter.fsMkdir(),
  },
}

// Auto-sign in if token in localStorage
;(async () => {
  const token = localStorage.getItem('pb_auth_token')
  if (token) {
    adapter.authToken = token
    try {
      await adapter.getUser()
    } catch {
      localStorage.removeItem('pb_auth_token')
    }
  }
})()

// Listen for auth changes
window.addEventListener('storage', (e) => {
  if (e.key === 'pb_auth_token') {
    if (e.newValue) adapter.authToken = e.newValue
    else adapter.signOut()
  }
})

// Export for modules
export default adapter
