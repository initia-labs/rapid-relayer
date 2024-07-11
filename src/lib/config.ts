import * as fs from 'fs'
import { ConfigPair } from './chainPair'

export const config: Config = JSON.parse(
  fs.readFileSync('./config.json').toString()
) as Config // TODO: get path of config

export interface Config {
  port: number
  metricPort: number
  logLevel: string
  pairs: ConfigPair[]
}
