import { Database } from 'better-sqlite3'
import {
  PacketSendTable,
  PacketTimeoutTable,
  PacketWriteAckTable,
} from 'src/types'
import { Height, Packet } from '@initia/initia.js'

export function toBE(bigint: bigint, len = 8): Uint8Array {
  const result = []
  while (bigint > 0) {
    result.push(Number(bigint % BigInt(256)))
    bigint = bigint / BigInt(256)
  }

  // fill 0
  while (result.length < len) {
    result.push(0)
  }

  if (result.length !== len) {
    throw Error('Number is too big to convert')
  }

  return new Uint8Array(result.reverse())
}

export function fromBE(bytes: number[] | Buffer): bigint {
  bytes = [...bytes]
  let result = 0n
  bytes = bytes.reverse()
  while (bytes.length > 0) {
    result = result * 256n + BigInt(bytes.pop() as number)
  }
  return result
}

// type convert
export function packetTableToPacket(
  packetTable: PacketSendTable | PacketWriteAckTable | PacketTimeoutTable
): Packet {
  const height = new Height(
    Number(packetTable.timeout_height_raw.split('-')[0]),
    Number(packetTable.timeout_height_raw.split('-')[1])
  )
  return new Packet(
    packetTable.sequence,
    packetTable.src_port,
    packetTable.src_channel_id,
    packetTable.dst_port,
    packetTable.dst_channel_id,
    packetTable.packet_data,
    height,
    packetTable.timeout_timestamp_raw
  )
}

// sql helper

export function insert<T>(db: Database, tableName: string, obj: T) {
  const keys = Object.keys(obj as object)
  const placeHolder = keys.map((key) => `$${key}`).join(',')
  const prepare = db.prepare(
    `INSERT INTO ${tableName} (${keys.join(',')}) VALUES (${placeHolder})`
  )

  prepare.run(obj)
}

export function select<T>(
  db: Database,
  tableName: string,
  wheres?: WhereOptions<T>[],
  orders?: Order<T>,
  limit?: number
): T[] {
  let sql = `SELECT * FROM ${tableName}`
  const params: ParamType[] = []

  if (wheres) {
    const [whereSql, whereParams] = where(wheres)
    sql += whereSql
    params.push(...whereParams)
  }

  if (orders) {
    sql += order(orders)
  }

  if (limit) {
    sql += ' limit ?'
    params.push(limit)
  }

  return db.prepare<unknown[], T>(sql).all(params)
}

export function count<T>(
  db: Database,
  tableName: string,
  wheres?: WhereOptions<T>[]
): number {
  let sql = `SELECT COUNT(*) as count FROM ${tableName}`
  const params: ParamType[] = []

  if (wheres) {
    const [whereSql, whereParams] = where(wheres)
    sql += whereSql
    params.push(...whereParams)
  }

  return db.prepare<unknown[], { count: number }>(sql).all(params)[0].count
}

export function selectOne<T>(
  db: Database,
  tableName: string,
  wheres?: WhereOptions<T>[],
  orders?: Order<T>
): T | undefined {
  const res = select(db, tableName, wheres, orders, 1)
  if (res.length === 0) return undefined

  return res[0]
}

export function del<T>(
  db: Database,
  tableName: string,
  wheres?: WhereOptions<T>[]
) {
  let sql = `DELETE from ${tableName}`
  const params: ParamType[] = []
  if (wheres) {
    const [whereSql, whereParams] = where(wheres)
    sql += whereSql
    params.push(...whereParams)
  }

  db.prepare<unknown[], T>(sql).run(params)
}

export function update<T>(
  db: Database,
  tableName: string,
  set: Partial<T>,
  wheres?: WhereOptions<T>[]
) {
  let sql = `UPDATE ${tableName} SET`
  const params = []
  const keys = Object.keys(set as object)
  const placeHolder = keys.map((key) => ` ${key} = $${key}`).join(',')
  sql += placeHolder

  if (wheres) {
    const [whereSql, whereParams] = where(wheres)
    sql += whereSql
    params.push(...whereParams)
  }

  db.prepare<unknown[], T>(sql).run(params, set)
}

function where<T>(wheres: WhereOptions<T>[]): [string, ParamType[]] {
  let sql = ''

  const conditions = []
  const params: ParamType[] = []

  for (const where of wheres) {
    const condition = []
    const keys = Object.keys(where) as (keyof T)[]
    for (const key of keys) {
      const value = where[key]
      if (typeof value === 'object' && value !== null) {
        if ('in' in value) {
          const vals = value.in as unknown[]
          const placeHolder = vals.map(() => '?').join(',')
          condition.push(`${String(key)} IN(${placeHolder})`)
          params.push(...vals.map(toParamType))
        } else {
          const rangeConditions: string[] = []

          // if both gt and gte are given, use gt
          if ('gte' in value && !('gt' in value)) {
            rangeConditions.push(`${String(key)} >= ?`)
            params.push(toParamType(value.gte))
          }
          if ('gt' in value) {
            rangeConditions.push(`${String(key)} > ?`)
            params.push(toParamType(value.gt))
          }

          // if both lt and lte are given, use lt
          if ('lte' in value && !('lt' in value)) {
            rangeConditions.push(`${String(key)} <= ?`)
            params.push(toParamType(value.lte))
          }
          if ('lt' in value) {
            rangeConditions.push(`${String(key)} < ?`)
            params.push(toParamType(value.lt))
          }

          condition.push(`(${rangeConditions.join(' AND ')})`)
        }
      } else if (key === 'custom') {
        condition.push(value)
      } else if (typeof value === 'undefined') {
        // do nothing
      } else {
        condition.push(`${String(key)} = ?`)
        params.push(toParamType(value))
      }
    }
    if (condition.length !== 0) {
      conditions.push(`(${condition.join(' AND ')})`)
    }
  }

  if (conditions.length !== 0) {
    sql += ` WHERE ${conditions.join(' OR ')}`
  }

  return [sql, params]
}

function order<T>(order: Order<T>): string {
  let sql = ''

  const orders: string[] = []
  const keys = Object.keys(where) as (keyof T)[]
  for (const key of keys) {
    orders.push(`${String(key)} ${order[key]}`)
  }

  if (orders.length !== 0) {
    sql = ` ORDER BY ${orders.join(', ')} `
  }

  return sql
}

export type WhereOptions<T> = {
  [P in keyof T]?: T[P] | Range<T[P]> | In<T[P]>
} & { custom?: string }

export type Order<T> = {
  [P in keyof T]?: 'ASC' | 'DESC'
}

interface Range<V> {
  gt?: V
  gte?: V
  lt?: V
  lte?: V
}

interface In<V> {
  in: V[]
}

export function In<T>(array: T[]): In<T> {
  return { in: array }
}

type ParamType = number | string | bigint | Buffer | null

function toParamType<T>(p: T): ParamType {
  if (
    typeof p === 'number' ||
    typeof p === 'string' ||
    typeof p === 'bigint' ||
    p === null ||
    Buffer.isBuffer(p)
  ) {
    return p as number | string | bigint | Buffer | null
  }

  return String(p)
}
