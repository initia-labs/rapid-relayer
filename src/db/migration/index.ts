import { Database } from 'better-sqlite3'
import fs from 'fs'
import { VersionTable } from 'src/types'

export function migrate(db: Database): Database {
  // create version table
  db.exec(`
    CREATE TABLE IF NOT EXISTS version (
      id INT PRIMARY KEY NOT NULL,
      version TEXT NOT NULL
    );`)

  // get version
  const versions = db
    .prepare(`SELECT * FROM version WHERE id = 1`)
    .all() as VersionTable[]
  const version = versions.length === 0 ? '0.0.0' : versions[0].version

  // get migrations
  const migrations = fs
    .readdirSync('./src/db/migration')
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace('.sql', ''))

  // get unapplied versions
  const numberizedVersion = numberize(version)

  const unappliedVersions = migrations
    .map(numberize)
    .sort()
    .filter((v) => v > numberizedVersion)
    .map(versionize)

  // apply versions
  for (const version of unappliedVersions) {
    const sql = fs.readFileSync(`./src/db/migration/${version}.sql`).toString()
    db.transaction(() => {
      db.exec(sql)
    })()
  }
  return db
}

function numberize(version: string): number {
  const ns = version.split('.').map((n) => parseInt(n)) // '1.2.3' => [1,2,3]
  if (ns.length !== 3) {
    throw Error('invalid version')
  }
  return ns.reduce((p, c) => {
    if (c > 255) {
      throw Error('version numbering is too big')
    }

    return (p << 8) + c
  })
}

function versionize(num: number): string {
  if (num > 16777215) {
    throw Error('invalid numberized version')
  }

  const ns = []
  for (let i = 0; i < 3; i++) {
    ns.push(num % 256)
    num = num >> 8
  }

  return ns.reverse().join('.')
}
