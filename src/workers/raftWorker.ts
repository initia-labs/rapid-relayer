import { WorkerController } from './index'
import { RaftService, RaftNodeConfig, RaftMessage } from '../lib/raft'
import { Config } from '../lib/config'
import { info, warn, error } from '../lib/logger'
import { EventEmitter } from 'events'
import {
  PacketSendTable,
  PacketWriteAckTable,
  PacketTimeoutTable,
  ChannelOpenCloseTable,
} from '../types'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import {
  MsgUpdateClient,
  MsgRecvPacket,
  MsgAcknowledgement,
  MsgTimeout,
  MsgTimeoutOnClose,
  MsgChannelOpenTry,
  MsgChannelOpenAck,
  MsgChannelOpenConfirm,
  MsgChannelCloseConfirm,
} from '@initia/initia.js'
import { PacketFee } from '../lib/config'
import * as crypto from 'node:crypto'

export class RaftWorkerController extends EventEmitter {
  private workerController: WorkerController
  private raftService: RaftService | null = null
  private config: Config

  constructor(config: Config) {
    super()
    this.config = config
    this.workerController = new WorkerController()
  }

  public async init(): Promise<void> {
    // Initialize the underlying worker controller
    await this.workerController.init(this.config)

    // Initialize RAFT if enabled
    if (this.config.raft?.enabled) {
      await this.initRaft()
    } else {
      // If RAFT is not enabled, run as standalone
      info('Running in standalone mode (RAFT disabled)')
    }
  }

  private async initRaft(): Promise<void> {
    if (!this.config.raft || !this.config.raft.enabled) {
      throw new Error('RAFT configuration is required when RAFT is enabled')
    }

    const raftConfig: RaftNodeConfig = {
      id: this.config.raft.nodeId,
      host: this.config.raft.host,
      port: this.config.raft.port,
      peers: this.config.raft.peers,
      electionTimeout: this.config.raft.electionTimeout,
      heartbeatInterval: this.config.raft.heartbeatInterval,
      psk: this.config.raft.psk,
    }

    this.raftService = new RaftService(raftConfig)

    // Set up RAFT event handlers
    this.raftService.on('leaderElected', (nodeId: string) => {
      if (nodeId === this.config.raft!.nodeId) {
        this.becomeLeader()
      }
    })

    this.raftService.on('leaderLost', (nodeId: string) => {
      if (nodeId === this.config.raft!.nodeId) {
        this.becomeFollower()
      }
    })

    this.raftService.on('statusUpdate', (data: Record<string, unknown>) => {
      this.emit('statusUpdate', data)
    })

    this.raftService.on('command', (data: RaftMessage) => {
      this.handleCommand(data)
    })

    this.raftService.on('syncRequest', (data: RaftMessage) => {
      this.handleSyncRequest(data)
    })

    this.raftService.on('syncResponse', (data: Record<string, unknown>) => {
      this.handleSyncResponse(data)
    })

    this.raftService.on('error', (err: unknown) => {
      error(`RAFT error: ${String(err)}`)
      this.emit('raftError', err)
    })

    // Start the RAFT service
    await this.raftService.start()
    info(`RAFT node ${this.config.raft.nodeId} initialized`)
  }

  private becomeLeader(): void {
    if (this.isLeader()) {
      return
    }

    info(`Node ${this.config.raft!.nodeId} became leader - activating workers`)

    // Activate all workers
    this.activateWorkers()

    // Broadcast status update
    this.broadcastStatus()

    this.emit('leaderActivated', this.config.raft!.nodeId)
  }

  private becomeFollower(): void {
    if (!this.isLeader()) {
      return
    }

    warn(`Node ${this.config.raft!.nodeId} became follower`)

    // Do NOT deactivate workers here. Workers should always run unless the node is unhealthy.
    // this.deactivateWorkers()

    this.emit('leaderDeactivated', this.config.raft!.nodeId)
  }

  private activateWorkers(): void {
    if (!this.workerController.initiated) {
      void this.workerController.init(this.config)
      info('Workers activated (re-initialized)')
    } else {
      info('Workers are already active')
    }
  }

  private deactivateWorkers(): void {
    this.workerController.stopAllWorkers()
    info('All workers have been deactivated (stopped)')
  }

  private broadcastStatus(): void {
    if (!this.raftService || !this.raftService.isLeaderNode()) {
      return
    }

    const status = this.workerController.getStatus()
    this.raftService
      .broadcastMessage('status_update', status)
      .catch((err) => error(`Failed to broadcast status: ${err}`))
  }

  private handleCommand(data: RaftMessage): void {
    info(`Received command: ${JSON.stringify(data)}`)

    if (
      !data.data ||
      typeof data.data !== 'object' ||
      Array.isArray(data.data)
    ) {
      warn('Invalid command data structure')
      return
    }

    // Handle different command types
    const commandData = data.data as { command?: string }
    switch (commandData.command) {
      case 'sync_request':
        this.handleSyncRequest(data)
        break
      case 'restart_workers':
        this.restartWorkers()
        break
      default:
        warn(`Unknown command: ${commandData.command}`)
    }
  }

  private handleSyncRequest(data: RaftMessage): void {
    if (!this.raftService) {
      return
    }

    const status = this.workerController.getStatus()
    this.raftService
      .sendMessageToPeer(data.from, 'sync_response', status)
      .catch((err) => error(`Failed to send sync response: ${err}`))
  }

  private handleSyncResponse(data: Record<string, unknown>): void {
    info(
      `[SYNC RESPONSE] Received sync response from leader: ${JSON.stringify(data, null, 2)}`
    )

    // TODO: implementing state synchronization logic here
  }

  private restartWorkers(): void {
    if (!this.isLeader()) {
      return
    }

    info('Restarting workers...')
    this.deactivateWorkers()
    setTimeout(() => {
      this.activateWorkers()
    }, 1000)
  }

  // Public methods that delegate to the underlying worker controller
  public getStatus(): Record<string, unknown> {
    const status = this.workerController.getStatus()

    // Add RAFT information to status
    if (this.raftService) {
      return {
        ...status,
        raft: {
          ...this.raftService.getClusterStatus(),
          isActive: this.isLeader(),
        },
      }
    }

    return {
      ...status,
      raft: {
        enabled: false,
        isActive: this.isLeader(),
      },
    }
  }

  public getFeeFilters(): { chainId: string; feeFilter: PacketFee }[] {
    return this.workerController.getFeeFilters()
  }

  public async generateMsgUpdateClient(
    chainId: string,
    clientId: string,
    executorAddress: string
  ): Promise<{ msg: MsgUpdateClient; height: Height }> {
    return this.workerController.generateMsgUpdateClient(
      chainId,
      clientId,
      executorAddress
    )
  }

  public async generateRecvPacketMsg(
    packet: PacketSendTable,
    height: Height,
    executorAddress: string
  ): Promise<MsgRecvPacket> {
    return this.workerController.generateRecvPacketMsg(
      packet,
      height,
      executorAddress
    )
  }

  public async generateAckMsg(
    packet: PacketWriteAckTable,
    height: Height,
    executorAddress: string
  ): Promise<MsgAcknowledgement> {
    return this.workerController.generateAckMsg(packet, height, executorAddress)
  }

  public async generateTimeoutMsg(
    packet: PacketTimeoutTable,
    height: Height,
    executorAddress: string
  ): Promise<MsgTimeout | MsgTimeoutOnClose> {
    return this.workerController.generateTimeoutMsg(
      packet,
      height,
      executorAddress
    )
  }

  public async generateChannelOpenTryMsg(
    event: ChannelOpenCloseTable,
    height: Height,
    executorAddress: string
  ): Promise<MsgChannelOpenTry> {
    return this.workerController.generateChannelOpenTryMsg(
      event,
      height,
      executorAddress
    )
  }

  public async generateChannelOpenAckMsg(
    event: ChannelOpenCloseTable,
    height: Height,
    executorAddress: string
  ): Promise<MsgChannelOpenAck> {
    return this.workerController.generateChannelOpenAckMsg(
      event,
      height,
      executorAddress
    )
  }

  public async generateChannelOpenConfirmMsg(
    event: ChannelOpenCloseTable,
    height: Height,
    executorAddress: string
  ): Promise<MsgChannelOpenConfirm> {
    return this.workerController.generateChannelOpenConfirmMsg(
      event,
      height,
      executorAddress
    )
  }

  public async generateChannelCloseConfirmMsg(
    event: ChannelOpenCloseTable,
    height: Height,
    executorAddress: string
  ): Promise<MsgChannelCloseConfirm> {
    return this.workerController.generateChannelCloseConfirmMsg(
      event,
      height,
      executorAddress
    )
  }

  // RAFT-specific methods
  public async sendCommandToLeader(
    command: string,
    data: Record<string, unknown>
  ): Promise<void> {
    if (!this.raftService) {
      throw new Error('RAFT service not initialized')
    }

    // If current node is the leader, handle command locally
    if (this.isLeader()) {
      this.handleCommand({
        type: 'command',
        data: { command, ...data },
        timestamp: Date.now(),
        from: this.config.raft!.nodeId,
        term: 0,
        messageId: crypto.randomUUID(),
      })
      return
    }

    // Find the leader node using leaderId
    const clusterStatus = this.raftService.getClusterStatus()
    const leaderId = clusterStatus.leaderId

    if (!leaderId) {
      throw new Error('Leader is unknown, cannot send command')
    }
    if (leaderId === this.config.raft!.nodeId) {
      // Should not happen, but fallback to local
      this.handleCommand({
        type: 'command',
        data: { command, ...data },
        timestamp: Date.now(),
        from: this.config.raft!.nodeId,
        term: 0,
        messageId: crypto.randomUUID(),
      })
      return
    }

    const leaderPeer = clusterStatus.peers.find((peer) => peer.id === leaderId)
    if (leaderPeer) {
      await this.raftService.sendMessageToPeer(leaderPeer.id, 'command', {
        command,
        data,
        from: this.config.raft!.nodeId,
      })
    } else {
      throw new Error('Leader peer not found in peer list')
    }
  }

  public async requestSyncFromLeader(): Promise<void> {
    if (!this.raftService) {
      throw new Error('RAFT service not initialized')
    }

    const clusterStatus = this.raftService.getClusterStatus()
    const leaderId = clusterStatus.leaderId

    if (!leaderId) {
      throw new Error('Leader is unknown, cannot request sync')
    }
    if (leaderId === this.config.raft!.nodeId) {
      return
    }

    const leaderPeer = clusterStatus.peers.find((peer) => peer.id === leaderId)
    if (leaderPeer) {
      await this.raftService.sendMessageToPeer(leaderPeer.id, 'sync_request', {
        from: this.config.raft!.nodeId,
      })
    } else {
      throw new Error('Leader peer not found in peer list')
    }
  }

  public isLeader(): boolean {
    return this.raftService ? this.raftService.isLeaderNode() : false
  }

  public isActiveNode(): boolean {
    return this.isLeader()
  }

  public stop(): void {
    if (this.raftService) {
      this.raftService.stop()
    }

    this.deactivateWorkers()
  }
}
