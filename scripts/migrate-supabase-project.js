const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
function readEnv() {
  const values = {};
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {}
  return values;
}
function writeEnv(values, remove = []) {
  let lines = [];
  try { lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/); } catch {}
  for (const key of remove) lines = lines.filter(line => !new RegExp(`^\\s*${key}\\s*=`).test(line));
  for (const [key, value] of Object.entries(values)) {
    const encoded = `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const index = lines.findIndex(line => new RegExp(`^\\s*${key}\\s*=`).test(line));
    if (index < 0) lines.push(`${key}=${encoded}`); else lines[index] = `${key}=${encoded}`;
  }
  fs.writeFileSync(envPath, lines.join('\n').replace(/\n+$/, '') + '\n', { mode: 0o600 });
}
const env = readEnv();
const sourceUrl = env.SOURCE_DATABASE_URL;
const targetUrl = env.DIRECT_URL || env.DATABASE_URL;
if (!sourceUrl || !targetUrl) throw new Error('Configure SOURCE_DATABASE_URL e DIRECT_URL no .env para migrar o estado.');
if (new URL(sourceUrl).hostname === new URL(targetUrl).hostname) throw new Error('A origem e o destino precisam ser projetos diferentes.');
const key = env.BACKUP_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
if (!env.BACKUP_ENCRYPTION_KEY) writeEnv({ BACKUP_ENCRYPTION_KEY: key });
function poolFor(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  const ca = fs.readFileSync(path.join(root, 'supabase', 'prod-ca-2021.crt'), 'utf8');
  return new Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 8000, ssl: { ca, rejectUnauthorized: true } });
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function writeEncryptedBackup(contents) {
  const directory = path.join(root, 'backups');
  fs.mkdirSync(directory, { recursive: true });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(contents)), cipher.final()]);
  const payload = { algorithm: 'aes-256-gcm', iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: encrypted.toString('base64') };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(directory, `database-switch-${stamp}.json.enc`), JSON.stringify(payload), { mode: 0o600, flag: 'wx' });
}

(async () => {
  const source = poolFor(sourceUrl);
  const target = poolFor(targetUrl);
  try {
    const sourceResult = await source.query('select state from equipe_digital_private.app_state where id = 1');
    if (!sourceResult.rowCount) throw new Error('O banco de origem não contém estado inicializado.');
    const oldState = sourceResult.rows[0].state;
    let avatars = [];
    try { avatars = (await source.query('select path, content from equipe_digital_private.avatars')).rows; } catch {}
    writeEncryptedBackup({ application: 'Império Digital', createdAt: new Date().toISOString(), state: oldState, avatars: avatars.map(row => ({ path: row.path, content: Buffer.from(row.content).toString('base64') })) });

    const targetResult = await target.query('select id from equipe_digital_private.app_state where id = 1');
    if (targetResult.rowCount) throw new Error('O banco de destino já possui dados. A migração foi interrompida para não sobrescrevê-los.');
    const state = { ...oldState, sessions: [], accessHistory: Array.isArray(oldState.accessHistory) ? oldState.accessHistory : [] };
    state.links = (Array.isArray(state.links) ? state.links : []).map(link => ({ category: 'Outros', bmLimit: '', ...link }));
    const admin = (state.users || []).find(user => user.role === 'admin');
    if (admin) Object.assign(admin, { name: env.ADMIN_NAME || admin.name, username: (env.ADMIN_USERNAME || admin.username).toLowerCase(), email: (env.ADMIN_EMAIL || admin.email || '').toLowerCase(), active: true, ...hashPassword(env.ADMIN_PASSWORD || '') });

    await target.query('begin');
    try {
      await target.query('insert into equipe_digital_private.app_state (id, state) values (1, $1::jsonb)', [JSON.stringify(state)]);
      for (const avatar of avatars) await target.query('insert into equipe_digital_private.avatars (path, content) values ($1, $2) on conflict (path) do nothing', [avatar.path, avatar.content]);
      await target.query('commit');
    } catch (error) {
      await target.query('rollback');
      throw error;
    }
    writeEnv({}, ['SOURCE_DATABASE_URL', 'SOURCE_DIRECT_URL']);
    console.log(`Migração concluída: ${(state.users || []).length} contas, ${(state.links || []).length} links e ${avatars.length} fotos. Backup criptografado salvo na pasta backups.`);
  } catch (error) {
    console.error(`Migração interrompida (${error.code || 'erro'}): ${error.message}`);
    process.exitCode = 1;
  } finally {
    await Promise.all([source.end(), target.end()]);
  }
})();
