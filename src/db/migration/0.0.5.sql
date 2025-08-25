-- update version
UPDATE version set version = '0.0.5' WHERE id == 1;

-- Channel upgrade table for tracking channel upgrade handshakes
CREATE TABLE IF NOT EXISTS channel_upgrade (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  in_progress BOOLEAN,
  state INTEGER NOT NULL, -- State enum: UPGRADE_TRY=5, UPGRADE_ACK=6, UPGRADE_CONFIRM=7, UPGRADE_OPEN=8, UPGRADE_ERROR=9
  
  chain_id TEXT NOT NULL,
  port_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,

  counterparty_chain_id TEXT NOT NULL,
  counterparty_port_id TEXT NOT NULL,
  counterparty_channel_id TEXT NOT NULL,
  counterparty_connection_id TEXT NOT NULL,

  upgrade_sequence BIGINT,
  upgrade_version TEXT,
  upgrade_ordering TEXT,
  upgrade_timeout_height BIGINT, -- Nullable, only available after ACK/TRY/CONFIRM
  upgrade_timeout_timestamp BIGINT, -- Nullable, only available after ACK/TRY/CONFIRM
  upgrade_error_receipt TEXT -- Nullable, only available after ERROR
);
