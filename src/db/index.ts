import DatabaseConstructor, { Database } from 'better-sqlite3'
import { migrate } from './migration'
import * as fs from 'fs'
import * as path from 'path'
import { config } from 'src/lib/config'

export let DB: Database

export function initDBConnection() {
  const dbPath = config.dbPath ?? './'

  if (!fs.existsSync(path.join(dbPath, '.db'))) {
    fs.mkdirSync(path.join(dbPath, '.db'))
  }
  const db = new DatabaseConstructor(path.join(dbPath, '.db/main.db'))

  DB = migrate(db)

  process.on('SIGINT', () => {
    DB.close()
    process.exit(0)
  })
}
