import DatabaseConstructor, { Database } from 'better-sqlite3'
import { DB_PATH } from './constants'
import { migrate } from './migration'
import * as fs from 'fs'

if (!fs.existsSync('./.db')) {
  fs.mkdirSync('./.db')
}
const db = new DatabaseConstructor(DB_PATH)
export const DB: Database = migrate(db)

process.on('SIGINT', () => {
  DB.close()
  process.exit(0)
})
