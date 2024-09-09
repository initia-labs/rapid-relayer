import * as fs from 'fs'
import { ConfigPair } from './chainPair'
import { env } from 'node:process'

export const config: Config = JSON.parse(
  fs.readFileSync(env.CONFIGFILE || './config.json').toString()
) as Config // TODO: get path of config

export interface Config {
  port: number
  metricPort: number
  logLevel: string
  pairs: ConfigPair[]
}

export const syncInfoFile = env.SYNC_INFO || './.syncInfo'
