// implementation of the RAFT consensus algorithm for leader election.
// Other features of RAFT, such as log replication and membership changes, are not implemented.
import { info, warn, error } from './logger'
import { EventEmitter } from 'events'
import * as net from 'net'
import * as crypto from 'crypto'

export interface RaftNodeConfig {
  id: string
  host: string
  port: number
  peers: { id: string; host: string; port: number }[]
  electionTimeout?: number
  heartbeatInterval?: number
}

export interface RaftMessage {
  type: 'vote_request' | 'vote_response' | 'heartbeat' | 'heartbeat_ack' | 'status_update' | 'command' | 'sync_request' | 'sync_response'
  data: Record<string, unknown>
  timestamp: number
  from: string
  to?: string
  term: number
  messageId: string
}

export class RaftService extends EventEmitter {
  private config: RaftNodeConfig
  private isLeader = false
  private isInitialized = false
  private currentTerm = 0
  private votedFor: string | null = null
  private lastHeartbeat = 0
  private electionTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private messageQueue: RaftMessage[] = []

  // Network components
  private server: net.Server | null = null
  private connections = new Map<string, net.Socket>()
  private pendingVotes = new Map<string, boolean>()
  private voteCount = 0

  // State tracking
  private state: 'follower' | 'candidate' | 'leader' = 'follower'

  // Add leaderId field
  private leaderId: string | null = null;

  // Track retry counts for peers
  private peerRetryCounts = new Map<string, number>();
  private peerRetryTimeouts = new Map<string, NodeJS.Timeout>();

  // Buffer for partial TCP messages per peer
  private messageBuffer = new Map<string, Uint8Array>();

  constructor(raftConfig: RaftNodeConfig) {
    super()
    this.config = raftConfig
  }

  public async start(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('RAFT service already initialized')
    }

    this.isInitialized = true
    this.currentTerm = 0
    this.votedFor = null
    this.isLeader = false
    this.state = 'follower'

    // Start TCP server
    await this.startServer()

    // Connect to peers
    this.connectToPeers()

    // Start election timer
    this.startElectionTimer()

    info(`Network RAFT node ${this.config.id} started on ${this.config.host}:${this.config.port}`)
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleIncomingConnection(socket)
      })

      this.server.listen(this.config.port, this.config.host, () => {
        info(`RAFT server listening on ${this.config.host}:${this.config.port}`)
        resolve()
      })

      this.server.on('error', (err) => {
        error(`Server error: ${err}`)
        reject(err)
      })
    })
  }

  private connectToPeers(): void {
    for (const peer of this.config.peers) {
      if (peer.id !== this.config.id) {
        this.connectToPeer(peer)
      }
    }
  }

  private connectToPeer(peer: { id: string; host: string; port: number }): void {
    const socket = new net.Socket()

    socket.connect(peer.port, peer.host, () => {
      info(`[CONNECTION] Node ${this.config.id} connected to peer ${peer.id} at ${peer.host}:${peer.port}`)
      this.connections.set(peer.id, socket)
      this.peerRetryCounts.set(peer.id, 0) // Reset retry count on success
      if (this.peerRetryTimeouts.has(peer.id)) {
        clearTimeout(this.peerRetryTimeouts.get(peer.id));
        this.peerRetryTimeouts.delete(peer.id);
      }
      info(`[CONNECTION STATUS] Node ${this.config.id} now has connections to: ${Array.from(this.connections.keys()).join(', ')}`)
    })

    socket.on('data', (data) => {
      try {
        const messages = this.parseMessages(socket, data, peer.id)
        messages.forEach(msg => this.handleMessage(msg))
      } catch (err) {
        error(`Error parsing message from ${peer.id}: ${err}`)
      }
    })

    const scheduleReconnect = () => {
      const retryCount = (this.peerRetryCounts.get(peer.id) || 0) + 1
      this.peerRetryCounts.set(peer.id, retryCount)
      if (retryCount > 5) {
        warn(`[RECONNECT] Node ${this.config.id} has failed to connect to peer ${peer.id} more than 5 times. Will pause reconnection attempts for 5 minutes.`)
        const timeout = setTimeout(() => {
          this.peerRetryCounts.set(peer.id, 0)
          this.connectToPeer(peer)
        }, 5 * 60 * 1000) // 5 minutes
        this.peerRetryTimeouts.set(peer.id, timeout)
        return
      }
      const backoff = Math.min(60000, 5000 * Math.pow(2, retryCount - 1)) // up to 1 minute
      info(`[RECONNECT] Node ${this.config.id} will retry connection to peer ${peer.id} in ${backoff / 1000}s (attempt ${retryCount})`)
      const timeout = setTimeout(() => this.connectToPeer(peer), backoff)
      this.peerRetryTimeouts.set(peer.id, timeout)
    }

    socket.on('error', (err) => {
      warn(`Connection error to ${peer.id}: ${err}`)
      this.connections.delete(peer.id)
      info(`[CONNECTION STATUS] Node ${this.config.id} now has connections to: ${Array.from(this.connections.keys()).join(', ')}`)
      scheduleReconnect()
    })

    socket.on('close', () => {
      info(`[CONNECTION CLOSED] Node ${this.config.id} lost connection to ${peer.id}`)
      this.connections.delete(peer.id)
      info(`[CONNECTION STATUS] Node ${this.config.id} now has connections to: ${Array.from(this.connections.keys()).join(', ')}`)
      scheduleReconnect()
    })
  }

  private handleIncomingConnection(socket: net.Socket): void {
    const peerId = `${socket.remoteAddress}:${socket.remotePort}`;
    socket.on('data', (data) => {
      try {
        const messages = this.parseMessages(socket, data, peerId)
        messages.forEach(msg => this.handleMessage(msg))
      } catch (err) {
        error(`Error parsing incoming message: ${err}`)
      }
    })

    socket.on('error', (err) => {
      error(`Incoming connection error: ${err}`)
    })
  }

  // Length-prefixed message framing
  private parseMessages(socket: net.Socket, data: Buffer, peerId: string): RaftMessage[] {
    let buffer = this.messageBuffer.get(peerId) || new Uint8Array();
    // Concatenate Uint8Arrays
    const combined = new Uint8Array(buffer.length + data.length);
    combined.set(buffer, 0);
    combined.set(data, buffer.length);
    buffer = combined;

    const messages: RaftMessage[] = [];
    let offset = 0;

    while (offset + 4 <= buffer.length) {
      // Read 4-byte big-endian length
      const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
      const messageLength = view.getUint32(0);
      if (offset + 4 + messageLength > buffer.length) break;

      const messageData = buffer.slice(offset + 4, offset + 4 + messageLength);
      try {
        const message = JSON.parse(new TextDecoder().decode(messageData)) as RaftMessage;
        info(`[PARSE MESSAGE] Node ${this.config.id} parsed message: ${JSON.stringify(message)}`);
        messages.push(message);
      } catch (err) {
        error(`Failed to parse message: ${err}`);
      }
      offset += 4 + messageLength;
    }

    this.messageBuffer.set(peerId, buffer.slice(offset));
    return messages;
  }

  private sendMessage(socket: net.Socket, message: RaftMessage): void {
    try {
      const messageStr = JSON.stringify(message);
      const messageBuffer = new TextEncoder().encode(messageStr);
      const lengthBuffer = new Uint8Array(4);
      new DataView(lengthBuffer.buffer).setUint32(0, messageBuffer.length);
      const fullBuffer = new Uint8Array(lengthBuffer.length + messageBuffer.length);
      fullBuffer.set(lengthBuffer, 0);
      fullBuffer.set(messageBuffer, lengthBuffer.length);
      info(`[SEND MESSAGE] Node ${this.config.id} sending ${message.type} to ${socket.remoteAddress}:${socket.remotePort}`);
      socket.write(fullBuffer);
    } catch (err) {
      error(`Failed to send message: ${err}`);
    }
  }

  private startElectionTimer(): void {
    if (this.electionTimer) {
      clearTimeout(this.electionTimer)
    }

    const timeout = this.config.electionTimeout || 8000
    const randomTimeout = timeout + Math.random() * 1000 // Add randomness to prevent split votes

    this.electionTimer = setTimeout(() => {
      // Only start election if we haven't received a heartbeat recently
      if (Date.now() - this.lastHeartbeat >= timeout) {
        this.startElection()
      } else {
        info(`[ELECTION TIMER] Node ${this.config.id} received recent heartbeat, skipping election and resetting timer`)
        this.startElectionTimer()
      }
    }, randomTimeout)
  }

  private startElection(): void {
    if (this.state === 'leader') {
      return
    }

    this.state = 'candidate'
    this.currentTerm++
    this.votedFor = this.config.id
    this.voteCount = 1 // Vote for self

    info(`[ELECTION START] Node ${this.config.id} starting election for term ${this.currentTerm} (connected peers: ${Array.from(this.connections.keys()).join(', ')})`)

    // Clear pending votes
    this.pendingVotes.clear()

    // Request votes from all peers
    this.broadcastMessage('vote_request', {
      term: this.currentTerm,
      candidateId: this.config.id,
      lastLogIndex: 0,
      lastLogTerm: 0
    }).catch(err => error(`Failed to broadcast vote request: ${String(err)}`))

    // Set timeout for election
    setTimeout(() => {
      this.checkElectionResult()
    }, this.config.electionTimeout || 5000)
  }

  private checkElectionResult(): void {
    if (this.state !== 'candidate') {
      info(`[ELECTION RESULT] Node ${this.config.id} is no longer candidate (state: ${this.state}), skipping leader transition.`);
      return;
    }

    // Calculate majority based on actual connected nodes + self
    // const connectedNodes = this.connections.size + 1 // +1 for self
    // const majority = Math.floor(connectedNodes / 2) + 1

    // Calculate majority based on total cluster size for proper quorum
    const totalNodes = this.config.peers.length + 1 // +1 for self
    const majority = Math.floor(totalNodes / 2) + 1

    info(`[ELECTION RESULT] Node ${this.config.id} has ${this.voteCount} votes, needs ${majority} for majority (${totalNodes} total connected nodes)`)

    if (this.voteCount >= majority) {
      this.becomeLeader()
    } else {
      // Election failed, become follower and restart timer
      info(`[ELECTION FAILED] Node ${this.config.id} failed to reach majority, becoming follower`)
      this.state = 'follower'
      this.startElectionTimer()
    }
  }

  private handleMessage(message: RaftMessage): void {
    // Ignore messages from older terms
    if (message.term < this.currentTerm) {
      info(`[TERM IGNORED] Node ${this.config.id} (term: ${this.currentTerm}) ignoring message from ${message.from} (term: ${message.term})`)
      return
    }

    // If we receive a message with higher term, become follower
    if (message.term > this.currentTerm) {
      info(`[TERM UPDATE] Node ${this.config.id} updating term from ${this.currentTerm} to ${message.term} and becoming follower`)
      this.currentTerm = message.term
      this.votedFor = null
      this.isLeader = false
      this.state = 'follower'
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer)
      }
      this.startElectionTimer()
    }

    info(`[RECEIVED MESSAGE] Node ${this.config.id} (state: ${this.state}, term: ${this.currentTerm}) received ${message.type} from ${message.from} (term ${message.term})`)

    switch (message.type) {
      case 'vote_request':
        this.handleVoteRequest(message)
        break
      case 'vote_response':
        this.handleVoteResponse(message)
        break
      case 'heartbeat':
        this.handleHeartbeat(message)
        break
      case 'heartbeat_ack':
        this.handleHeartbeatAck(message)
        break
      case 'status_update':
        this.emit('statusUpdate', message.data)
        break
      case 'command':
        this.emit('command', message.data)
        break
      case 'sync_request':
        this.handleSyncRequest(message)
        break
      case 'sync_response':
        this.emit('syncResponse', message.data)
        break
      default:
        warn(`Unknown message type: ${String(message.type)}`)
    }
  }

  private handleVoteRequest(message: RaftMessage): void {
    const { candidateId } = message.data

    info(`[VOTE REQUEST] Node ${this.config.id} (term ${this.currentTerm}, votedFor: ${String(this.votedFor)}) received vote request from ${String(candidateId)} (msg.term: ${message.term})`)

    // Grant vote if we haven't voted for anyone else in this term
    if (this.votedFor === null || this.votedFor === candidateId) {
      this.votedFor = candidateId as string
      info(`[VOTE GRANTED] Node ${this.config.id} grants vote to ${String(candidateId)} for term ${this.currentTerm}`)
      this.sendMessageToPeer(message.from, 'vote_response', {
        term: this.currentTerm,
        voteGranted: true
      }).catch(err => error(`Failed to send vote response: ${String(err)}`))
      this.startElectionTimer()
    } else {
      info(`[VOTE DENIED] Node ${this.config.id} denies vote to ${String(candidateId)} (already voted for ${String(this.votedFor)}) for term ${this.currentTerm}`)
      this.sendMessageToPeer(message.from, 'vote_response', {
        term: this.currentTerm,
        voteGranted: false
      }).catch(err => error(`Failed to send vote response: ${String(err)}`))
    }
  }

  private handleVoteResponse(message: RaftMessage): void {
    if (this.state !== 'candidate' || message.data.term !== this.currentTerm) {
      info(`[VOTE RESPONSE IGNORED] Node ${this.config.id} (state: ${this.state}, term: ${this.currentTerm}) got vote response from ${message.from} for term ${String(message.data.term)}`)
      return
    }

    if (message.data.voteGranted) {
      this.voteCount++
      info(`[VOTE RECEIVED] Node ${this.config.id} received vote from ${message.from}, total votes: ${this.voteCount} (term ${this.currentTerm})`)
    
      // Calculate majority based on actual connected nodes + self
      const connectedNodes = this.connections.size + 1 // +1 for self
      const majority = Math.floor(connectedNodes / 2) + 1
      
      info(`[MAJORITY CHECK] Node ${this.config.id} has ${this.voteCount} votes, needs ${majority} for majority (${connectedNodes} total connected nodes)`)
    
      if (this.voteCount >= majority) {
        this.becomeLeader()
      }
    }
  }

  private handleHeartbeat(message: RaftMessage): void {
    // If the message's term is equal and I'm leader, demote to follower
    if (message.term === this.currentTerm && this.state === 'leader' && message.from !== this.config.id) {
      info(`[SPLIT-BRAIN] Node ${this.config.id} (was leader) received heartbeat from another leader ${message.from} in same term ${message.term}. Stepping down to follower.`)
      this.state = 'follower'
      this.isLeader = false
      this.leaderId = message.from; // Track new leader
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer)
      }
      info(`[STATE TRANSITION] Node ${this.config.id} is now follower (term: ${this.currentTerm})`)
      this.startElectionTimer(); // Ensure election timer is started after stepping down
    }

    this.lastHeartbeat = Date.now()
    info(`[HEARTBEAT RECEIVED] Follower ${this.config.id} received heartbeat from ${message.from} (term ${message.term}) at ${new Date().toISOString()}, resetting election timer`)
    this.startElectionTimer() // Reset election timer

    // Only send ACK if the sender is the leader (i.e., message has leaderId)
    if (message.data && typeof message.data.leaderId === 'string') {
      this.leaderId = message.data.leaderId; // Track leader from heartbeat
      info(`[HEARTBEAT ACK] Follower ${this.config.id} sending heartbeat ACK to ${message.from}`)
      this.sendMessageToPeer(message.from, 'heartbeat_ack', {
        term: this.currentTerm,
        success: true
      }).catch(err => error(`Failed to send heartbeat ACK: ${String(err)}`))
    }
  }

  private handleHeartbeatAck(message: RaftMessage): void {
    // Only leaders should receive heartbeat ACKs
    if (this.state !== 'leader') {
      info(`[HEARTBEAT ACK IGNORED] Node ${this.config.id} (state: ${this.state}) received heartbeat ACK from ${message.from}, ignoring`)
      return
    }

    // In a full RAFT implementation, we might track which followers have acknowledged
    // For now, we just log the ACK
    info(`[HEARTBEAT ACK RECEIVED] Leader ${this.config.id} received heartbeat ACK from ${message.from} (term ${message.term})`)
  }

  private handleSyncRequest(message: RaftMessage): void {
    this.emit('syncRequest', message.data)
  }

  public broadcastMessage(type: RaftMessage['type'], data: Record<string, unknown>): Promise<void> {
  // Allow all roles to broadcast messages (especially vote_request)
  const message: RaftMessage = {
    type,
    data,
    timestamp: Date.now(),
    from: this.config.id,
    term: this.currentTerm,
    messageId: crypto.randomUUID()
  };

  try {
    this.connections.forEach((socket) => {
      this.sendMessage(socket, message);
    });

    info(`Broadcasted message: ${type}`);
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

  public sendMessageToPeer(peerId: string, type: RaftMessage['type'], data: Record<string, unknown>): Promise<void> {
    const message: RaftMessage = {
      type,
      data,
      timestamp: Date.now(),
      from: this.config.id,
      to: peerId,
      term: this.currentTerm,
      messageId: crypto.randomUUID()
    }

    try {
      const socket = this.connections.get(peerId)
      if (socket) {
        this.sendMessage(socket, message)
        info(`Sent message to peer ${peerId}: ${type}`)
        return Promise.resolve()
      } else {
        return Promise.reject(new Error(`No connection to peer ${peerId}`))
      }
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }

  public queueMessage(type: RaftMessage['type'], data: Record<string, unknown>): void {
    const message: RaftMessage = {
      type,
      data,
      timestamp: Date.now(),
      from: this.config.id,
      term: this.currentTerm,
      messageId: crypto.randomUUID()
    }

    this.messageQueue.push(message)
    info(`Queued message: ${type}`)
  }

  private processMessageQueue(): void {
    if (!this.isLeader || this.messageQueue.length === 0) {
      return
    }

    info(`Processing ${this.messageQueue.length} queued messages`)

    const messages = [...this.messageQueue]
    this.messageQueue = []

    messages.forEach((message) => {
      this.broadcastMessage(message.type, message.data)
        .then(() => {
          info(`Processed queued message: ${message.type}`)
        })
        .catch((err: unknown) => {
          error(`Failed to process queued message: ${String(err)}`)
          this.messageQueue.push(message)
        })
    })
  }

  public stop(): void {
    if (!this.isInitialized) {
      return
    }

    if (this.electionTimer) {
      clearTimeout(this.electionTimer)
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    // Close all connections
    this.connections.forEach((socket) => {
      socket.destroy()
    })
    this.connections.clear()

    // Close server
    if (this.server) {
      this.server.close()
    }

    this.isInitialized = false
    info(`RAFT node ${this.config.id} stopped`)
  }

  public isLeaderNode(): boolean {
    return this.isLeader
  }

  public getNodeId(): string {
    return this.config.id
  }

  public getClusterStatus(): {
    nodeId: string
    isLeader: boolean
    isInitialized: boolean
    peers: { id: string; host: string; port: number }[]
    currentTerm: number
    state: string
    connections: number
    leaderId?: string
  } {
    return {
      nodeId: this.config.id,
      isLeader: this.isLeader,
      isInitialized: this.isInitialized,
      peers: this.config.peers,
      currentTerm: this.currentTerm,
      state: this.state,
      connections: this.connections.size,
      leaderId: this.leaderId ?? undefined
    }
  }

  private becomeLeader(): void {
    if (this.state === 'leader') {
      return
    }

    this.state = 'leader'
    this.isLeader = true
    this.votedFor = null
    this.leaderId = this.config.id; // Track self as leader
    info(`[LEADER ELECTED] Node ${this.config.id} became LEADER for term ${this.currentTerm} (voteCount: ${this.voteCount})`)
    info(`[STATE TRANSITION] Node ${this.config.id} is now leader (term: ${this.currentTerm})`)
    this.emit('leaderElected', this.config.id)
    this.processMessageQueue()
    info(`[LEADER] Node ${this.config.id} about to start heartbeat timer`)
    // Send a heartbeat immediately
    info(`[HEARTBEAT SENT] Leader ${this.config.id} (term ${this.currentTerm}) sending immediate heartbeat at ${new Date().toISOString()}`)
    this.broadcastMessage('heartbeat', {
      term: this.currentTerm,
      leaderId: this.config.id,
      prevLogIndex: 0,
      prevLogTerm: 0,
      entries: [],
      leaderCommit: 0
    }).catch(err => error(`Failed to broadcast heartbeat: ${String(err)}`))
    this.startHeartbeat()
    info(`[LEADER] Node ${this.config.id} started heartbeat timer`)
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    const interval = this.config.heartbeatInterval || 1000
    info(`[HEARTBEAT TIMER] Node ${this.config.id} setting heartbeat interval to ${interval}ms`)
    this.heartbeatTimer = setInterval(() => {
      if (this.state !== 'leader') {
        // Only leaders send heartbeats
        return
      }
      info(`[HEARTBEAT DEBUG] Node ${this.config.id} connections: ${Array.from(this.connections.keys()).join(', ')}`)
      info(`[HEARTBEAT SENT] Leader ${this.config.id} (term ${this.currentTerm}) sending heartbeat at ${new Date().toISOString()}`)
      this.broadcastMessage('heartbeat', {
        term: this.currentTerm,
        leaderId: this.config.id,
        prevLogIndex: 0,
        prevLogTerm: 0,
        entries: [],
        leaderCommit: 0
      }).catch(err => error(`Failed to broadcast heartbeat: ${String(err)}`))
    }, interval)
    info(`[HEARTBEAT TIMER] Node ${this.config.id} heartbeat interval set`)
  }
} 
