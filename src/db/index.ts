import DatabaseConstructor, { Database } from 'better-sqlite3'
import { DB_PATH } from './constants'
import { migrate } from './migration'

const db = new DatabaseConstructor(DB_PATH)
export const DB: Database = migrate(db)
