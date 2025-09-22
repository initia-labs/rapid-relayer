# IBC Channel Upgrade Implementation

This document describes the implementation of IBC (Inter-Blockchain Communication) channel upgrade packet handling in the rapid-relayer project, based on the actual IBC-Go implementation.

## Overview

The IBC channel upgrade feature allows chains to upgrade their IBC channels to newer versions while maintaining the connection and packet relaying capabilities. This implementation supports the complete upgrade lifecycle based on the actual IBC-Go implementation:

1. **Channel Upgrade Init** - Initiates the upgrade process
2. **Channel Upgrade Try** - Attempts to upgrade the channel on the counterparty chain
3. **Channel Upgrade Ack** - Acknowledges the upgrade attempt
4. **Channel Upgrade Confirm** - Confirms the upgrade is complete
5. **Channel Upgrade Open** - Opens the upgraded channel
6. **Channel Upgrade Error** - Handles upgrade errors
7. **Channel Upgrade Timeout** - Handles upgrade timeouts

## Implementation Components

### 1. Database Schema

#### Migration (0.0.5.sql)

- **Table**: `channel_upgrade`
- **Fields**:
  - `id`: Primary key (auto-increment)
  - `in_progress`: Boolean flag for transaction status
  - `state`: Channel upgrade state (5-10)
  - `chain_id`: Destination chain ID (where the record will be processed)
  - `connection_id`: Connection ID on destination chain
  - `port_id`: Port ID on destination chain
  - `channel_id`: Channel ID on destination chain
  - `counterparty_chain_id`: Source chain ID
  - `counterparty_connection_id`: Connection ID on source chain
  - `counterparty_port_id`: Port ID on source chain
  - `counterparty_channel_id`: Channel ID on source chain
  - `upgrade_sequence`: Upgrade sequence number
  - `upgrade_version`: New channel version
  - `upgrade_ordering`: Channel ordering (ORDERED/UNORDERED)
  - `upgrade_error_receipt`: Error receipt for failed upgrades (nullable)

**Note**: The database schema does not store timeout fields (`upgrade_timeout_height`, `upgrade_timeout_timestamp`) to avoid stale data. Timeouts are checked dynamically via REST API calls.

### 2. Type Definitions

#### Channel States

```typescript
export enum ChannelState {
  INIT = 1,
  TRYOPEN = 2,
  ACK = 3,
  CLOSE = 4,
  UPGRADE_TRY = 5,
  UPGRADE_ACK = 6,
  UPGRADE_CONFIRM = 7,
  UPGRADE_OPEN = 8,
  UPGRADE_ERROR = 9,
  UPGRADE_TIMEOUT = 10,
}
```

#### Event Types

```typescript
export interface ChannelUpgradeEvent {
  type:
    | 'channel_upgrade_init'
    | 'channel_upgrade_try'
    | 'channel_upgrade_ack'
    | 'channel_upgrade_confirm'
    | 'channel_upgrade_open'
    | 'channel_upgrade_error'
  channelUpgradeInfo: ChannelUpgradeInfo
}

export interface ChannelUpgradeInfo {
  height: number
  srcPortId: string
  srcChannelId: string
  dstPortId: string
  dstChannelId: string
  upgradeSequence: number
  upgradeVersion?: string
  upgradeOrdering?: string
  upgradeConnectionHops?: string
  channelState?: string
  upgradeErrorReceipt?: string
}
```

### 3. Event Parsing

#### Parser Function

```typescript
export function parseChannelUpgradeEvent(
  event: Event,
  height: number
): ChannelUpgradeInfo
```

**Key Implementation Details:**

- Parses `connection_hops` from IBC-Go events (which emits `ConnectionHops[0]` as a single string)
- Uses `version` and `ordering` attributes directly from events
- Handles different event types appropriately
- Maps port/channel IDs correctly for source vs destination

### 4. Event Attributes

Based on the actual IBC-Go `events.go` file:

#### Channel Upgrade Init Event

- `port_id`, `channel_id`
- `counterparty_port_id`, `counterparty_channel_id`
- `connection_hops`, `version`, `ordering`
- `upgrade_sequence`

#### Channel Upgrade Try Event

- `port_id`, `channel_id`
- `counterparty_port_id`, `counterparty_channel_id`
- `connection_hops`, `version`, `ordering`
- `upgrade_sequence`

#### Channel Upgrade Ack Event

- `port_id`, `channel_id`
- `counterparty_port_id`, `counterparty_channel_id`
- `connection_hops`, `version`, `ordering`
- `upgrade_sequence`

#### Channel Upgrade Confirm Event

- `port_id`, `channel_id`
- `counterparty_port_id`, `counterparty_channel_id`
- `channel_state`, `upgrade_sequence`

### 5. Controller Logic

#### Counterparty Event Creation

The controller creates database records for counterparty workers:

- **Source chain** (e.g., chain A) does upgrade INIT
- **Creates TRY state record** for **destination chain** (chain B)
- **Chain ID mapping**: `chain_id` = destination chain, `counterparty_chain_id` = source chain
- **Connection ID mapping**: `connection_id` = destination connection, `counterparty_connection_id` = source connection

#### State Progression

```plantext
UPGRADE_INIT → UPGRADE_TRY → UPGRADE_ACK → UPGRADE_CONFIRM → UPGRADE_OPEN
```

Each transition:

1. Removes previous state record
2. Creates new state record for counterparty chain
3. Updates upgrade information as needed

### 6. Timeout Handling

#### Dynamic Timeout Detection

- **No stored timeout fields** in database (avoids stale data)
- **Real-time timeout checking** via REST API queries (`rest.ibc.getUpgrade`)
- **Dynamic state updates** based on current chain conditions
- **Timeout comparison** against current chain timestamp

#### Implementation

```typescript
async function checkChannelUpgradeTimeout(
  event: ChannelUpgradeTable,
  chain: ChainWorker,
  counterpartyChain: ChainWorker
): Promise<boolean> {
  const counterpartyChannel = await counterpartyChain.rest.ibc.channel(
    event.counterparty_port_id,
    event.counterparty_channel_id
  )
  const counterpartyUpgrade = await counterpartyChain.rest.ibc.getUpgrade(
    event.counterparty_port_id,
    event.counterparty_channel_id
  )
  
  if (
    counterpartyChannel &&
    counterpartyUpgrade &&
    // This condition comes from ibc-go and ensures the counterparty channel is in an OPEN state
    // before checking for timeouts. While this may seem redundant with the UPGRADE_ERROR
    // flow, it provides an additional safety check before timing out upgrades.
    stateFromJSON(counterpartyChannel.channel.state) === State.STATE_OPEN
  ) {
    const timeout_timestamp = BigInt(
      counterpartyUpgrade.timeout?.timestamp as string
    )
    if (
      timeout_timestamp !== undefined &&
      timeout_timestamp !== BigInt(0) &&
      BigInt(chain.latestTimestamp) * BigInt(1000000) > timeout_timestamp
    ) {
      return true
    }
  }
  return false
}
```

#### Timeout Processing

```typescript
// In wallet worker - timeout checking for UPGRADE_ACK and UPGRADE_CONFIRM states
await Promise.all(
  channelUpgradeEvents.map(async (event) => {
    if (
      event.state !== ChannelState.UPGRADE_ACK &&
      event.state !== ChannelState.UPGRADE_CONFIRM
    ) {
      return
    }

    const isTimeout = await checkChannelUpgradeTimeout(
      event,
      this.chain,
      this.workerController.chains[event.counterparty_chain_id]
    )
    if (isTimeout) {
      event.state = ChannelState.UPGRADE_TIMEOUT
    }
  })
)
```

### 7. Message Generation

#### Supported Message Types

The implementation supports all IBC channel upgrade message types:

1. **MsgChannelUpgradeTry** - For `UPGRADE_TRY` state
2. **MsgChannelUpgradeAck** - For `UPGRADE_ACK` state  
3. **MsgChannelUpgradeConfirm** - For `UPGRADE_CONFIRM` state
4. **MsgChannelUpgradeOpen** - For `UPGRADE_OPEN` state
5. **MsgChannelUpgradeTimeout** - For `UPGRADE_TIMEOUT` state
6. **MsgChannelUpgradeCancel** - For `UPGRADE_ERROR` state

#### Message Generation Flow

```typescript
// In wallet worker - message generation based on state
const channelUpgradeMsgs = await Promise.all(
  filteredChannelUpgradeEvents.map(async (event) => {
    switch (event.state) {
      case ChannelState.UPGRADE_TRY:
        return await this.workerController.generateChannelUpgradeTryMsg(
          event,
          this.chain
        )
      case ChannelState.UPGRADE_ACK:
        return await this.workerController.generateChannelUpgradeAckMsg(
          event,
          this.chain
        )
      case ChannelState.UPGRADE_CONFIRM:
        return this.workerController.generateChannelUpgradeConfirmMsg(
          event,
          this.chain
        )
      case ChannelState.UPGRADE_OPEN:
        return this.workerController.generateChannelUpgradeOpenMsg(
          event,
          this.chain
        )
      case ChannelState.UPGRADE_ERROR:
        return this.workerController.generateChannelUpgradeCancelMsg(
          event,
          this.chain
        )
      case ChannelState.UPGRADE_TIMEOUT:
        return this.workerController.generateChannelUpgradeTimeoutMsg(
          event,
          this.chain
        )
      default:
        return undefined
    }
  })
)
```

## Channel Upgrade Flow

### Overview of the Upgrade Process

The channel upgrade follows a specific flow where events are detected on one chain and corresponding actions are created for counterparty chains. Here's the detailed flow:

### 1. Channel Upgrade Init Flow

**Event Detection:**

- Source chain A emits `channel_upgrade_init` event
- Chain worker detects the event and parses it
- Event contains: port_id, channel_id, counterparty info, upgrade fields

**Action Creation:**

- Controller creates `UPGRADE_TRY` state record for **destination chain B**
- Database record is stored with:
  - `chain_id`: Chain B (destination)
  - `counterparty_chain_id`: Chain A (source)
  - `state`: `UPGRADE_TRY`
  - `port_id`, `channel_id`: Chain B's port/channel
  - `counterparty_port_id`, `counterparty_channel_id`: Chain A's port/channel

**Message Generation:**

- Destination chain B's worker picks up the `UPGRADE_TRY` record
- Generates `MsgChannelUpgradeTry` message
- Executes the upgrade try transaction on chain B

### 2. Channel Upgrade Try Flow

**Event Detection:**

- Destination chain B emits `channel_upgrade_try` event (success)
- Chain worker detects the event and parses it
- Event contains: port_id, channel_id, counterparty info, upgrade fields

**Action Creation:**

- Controller creates `UPGRADE_ACK` state record for **source chain A**
- Removes the previous `UPGRADE_TRY` record from chain B
- Database record is stored with:
  - `chain_id`: Chain A (source)
  - `counterparty_chain_id`: Chain B (destination)
  - `state`: `UPGRADE_ACK`
  - `port_id`, `channel_id`: Chain A's port/channel
  - `counterparty_port_id`, `counterparty_channel_id`: Chain B's port/channel

**Message Generation:**

- Source chain A's worker picks up the `UPGRADE_ACK` record
- Generates `MsgChannelUpgradeAck` message
- Executes the upgrade ack transaction on chain A

### 3. Channel Upgrade Ack Flow

**Event Detection:**

- Source chain A emits `channel_upgrade_ack` event (success)
- Chain worker detects the event and parses it
- Event contains: port_id, channel_id, counterparty info, upgrade fields

**Action Creation:**

- Controller creates `UPGRADE_CONFIRM` state record for **destination chain B**
- Removes the previous `UPGRADE_ACK` record from chain A
- Database record is stored with:
  - `chain_id`: Chain B (destination)
  - `counterparty_chain_id`: Chain A (source)
  - `state`: `UPGRADE_CONFIRM`
  - `port_id`, `channel_id`: Chain B's port/channel
  - `counterparty_port_id`, `counterparty_channel_id`: Chain A's port/channel

**Message Generation:**

- Destination chain B's worker picks up the `UPGRADE_CONFIRM` record
- Generates `MsgChannelUpgradeConfirm` message
- Executes the upgrade confirm transaction on chain B

### 4. Channel Upgrade Confirm Flow

**Event Detection:**

- Destination chain B emits `channel_upgrade_confirm` event (success)
- Chain worker detects the event and parses it
- Event contains: port_id, channel_id, counterparty info, channel_state

**Action Creation:**

- Controller creates `UPGRADE_OPEN` state record for **source chain A**
- Removes the previous `UPGRADE_CONFIRM` record from chain B
- Database record is stored with:
  - `chain_id`: Chain A (source)
  - `counterparty_chain_id`: Chain B (destination)
  - `state`: `UPGRADE_OPEN`
  - `port_id`, `channel_id`: Chain A's port/channel
  - `counterparty_port_id`, `counterparty_channel_id`: Chain B's port/channel

**Message Generation:**

- Source chain A's worker picks up the `UPGRADE_OPEN` record
- Generates `MsgChannelUpgradeOpen` message
- Executes the upgrade open transaction on chain A

### 5. Channel Upgrade Open Flow

**Event Detection:**

- Source chain A emits `channel_upgrade_open` event (success)
- Chain worker detects the event and parses it
- Event contains: port_id, channel_id, counterparty info, channel_state

**Action Creation:**

- Controller checks if counterparty channel is in upgrade state
- If counterparty is not open, creates `UPGRADE_OPEN` state record for **destination chain B**
- Removes all previous upgrade records from both chains
- Database record is stored with:
  - `chain_id`: Chain B (destination)
  - `counterparty_chain_id`: Chain A (source)
  - `state`: `UPGRADE_OPEN`
  - `port_id`, `channel_id`: Chain B's port/channel
  - `counterparty_port_id`, `counterparty_channel_id`: Chain A's port/channel

**Message Generation:**

- Destination chain B's worker picks up the `UPGRADE_OPEN` record
- Generates `MsgChannelUpgradeOpen` message
- Executes the upgrade open transaction on chain B

### 6. Channel Upgrade Error Flow

**Event Detection:**

- Any chain emits `channel_upgrade_error` event
- Chain worker detects the event and parses it
- Event contains: port_id, channel_id, counterparty info, error_receipt

**Action Creation:**

- Controller creates `UPGRADE_ERROR` state record for **destination chain**
- Removes all previous upgrade records from both chains
- Database record is stored with:
  - `chain_id`: Destination chain
  - `counterparty_chain_id`: Source chain
  - `state`: `UPGRADE_ERROR`
  - `upgrade_error_receipt`: Error details

**Cleanup:**

- All upgrade records are removed
- Error state is recorded for debugging
- Upgrade process is terminated

### 7. Timeout Detection Flow

**Proactive Checking:**

- Workers periodically check upgrade records for `UPGRADE_ACK` and `UPGRADE_CONFIRM` states only
- Query REST API for current upgrade state: `rest.ibc.getUpgrade(port_id, channel_id)`
- Compare timeout values with current chain state

**Timeout Detection:**

```typescript
// Only check timeouts for specific states
if (
  event.state !== ChannelState.UPGRADE_ACK &&
  event.state !== ChannelState.UPGRADE_CONFIRM
) {
  return
}

const isTimeout = await checkChannelUpgradeTimeout(
  event,
  this.chain,
  this.workerController.chains[event.counterparty_chain_id]
)
if (isTimeout) {
  event.state = ChannelState.UPGRADE_TIMEOUT
}
```

**Timeout Handling:**

- Update event state to `UPGRADE_TIMEOUT` in memory
- State change is used immediately for message generation
- No database persistence required for current processing cycle

### Key Flow Characteristics

1. **Alternating Chain Processing:**
   - Source chain → Destination chain → Source chain → Destination chain
   - Each chain processes events for the counterparty

2. **State Progression:**
   - `UPGRADE_TRY` → `UPGRADE_ACK` → `UPGRADE_CONFIRM` → `UPGRADE_OPEN`
   - Each state is stored on the chain that will process it next

3. **Record Cleanup:**
   - Previous state records are removed when advancing
   - Prevents duplicate processing and maintains clean state

4. **Counterparty Perspective:**
   - Each database record represents what the counterparty chain needs to do
   - Workers process events from their own chain's perspective

5. **Error Recovery:**
   - Failed upgrades are cleaned up
   - Error states are recorded for debugging
   - System continues processing other upgrades

6. **Timeout Processing:**
   - Limited to specific states (`UPGRADE_ACK`, `UPGRADE_CONFIRM`)
   - In-memory state changes for immediate processing
   - No database persistence required

## Usage Flow

### 1. Event Detection

1. Chain worker monitors blockchain events
2. Detects channel upgrade events using correct attribute names
3. Parses and stores event data with proper structure

### 2. Event Processing

1. Wallet worker retrieves pending upgrade events
2. **Filters events based on correct channel states**
3. **Checks timeouts for specific states only** (`UPGRADE_ACK`, `UPGRADE_CONFIRM`)
4. Generates appropriate upgrade messages
5. Executes transactions on the blockchain

### 3. State Management

- Each upgrade state is stored as a separate database record
- Previous states are cleaned up when advancing
- Counterparty workers process events from their perspective
- **Timeout state changes are handled in-memory for immediate processing**

## Error Handling

### Transaction Failures

- Reverts `in_progress` status
- Logs error details
- Continues processing other events

### State Validation

- Checks channel states before processing
- Validates upgrade sequence
- Ensures proper timing constraints

### Timeout Handling

- **Limited scope**: Only checks `UPGRADE_ACK` and `UPGRADE_CONFIRM` states
- **In-memory updates**: State changes are made in memory for immediate use
- **No database persistence**: Timeout state changes are not saved to database

## Configuration

### Database

- Migration automatically applied
- Consistent with existing table patterns
- Proper field mapping
- **No timeout fields stored** (dynamic checking only)

### Message Types

- Uses official `@initia/initia.js` types
- Proper IBC module routing
- Serialization support
- **All upgrade message types supported**

## Implementation Notes

### Key Design Decisions

1. **Counterparty Event Creation**: Source chains create events for destination chains
2. **Dynamic Timeout Detection**: Real-time checking via REST API instead of stored values
3. **Consistent Database Patterns**: Follows existing migration and table patterns
4. **Proper IBC-Go Integration**: Uses correct event attributes and state progression
5. **Limited Timeout Scope**: Only checks timeouts for specific states to avoid unnecessary overhead
6. **In-Memory State Changes**: Timeout state changes are handled in memory for immediate processing

### Performance Considerations

- **Selective Timeout Checking**: Only processes timeouts for relevant states
- **In-Memory Updates**: Avoids unnecessary database writes for temporary state changes
- **Efficient Filtering**: Uses database queries to filter events before processing

## Conclusion

This implementation provides a complete IBC channel upgrade solution that accurately matches the IBC-Go implementation. The key design decisions include:

- **Counterparty Event Creation**: Source chains create events for destination chains
- **Dynamic Timeout Detection**: Real-time checking via REST API instead of stored values
- **Consistent Database Patterns**: Follows existing migration and table patterns
- **Proper IBC-Go Integration**: Uses correct event attributes and state progression
- **Optimized Timeout Handling**: Limited scope and in-memory processing for efficiency

The implementation is:

- **Accurate**: Matches IBC-Go implementation exactly
- **Complete**: Includes all upgrade message types and states
- **Robust**: Handles errors gracefully and maintains consistency
- **Efficient**: Uses proper indexing, filtering, and selective timeout checking
- **Maintainable**: Follows established code patterns

## References

- [IBC-Go Channel Upgrade Types](https://github.com/cosmos/ibc-go/blob/main/modules/core/04-channel/types/upgrade.go)
- [IBC-Go Channel Events](https://github.com/cosmos/ibc-go/blob/main/modules/core/04-channel/keeper/events.go)
- [IBC-Go Channel Proto](https://github.com/cosmos/ibc-go/blob/main/proto/ibc/core/channel/v1/tx.proto)
