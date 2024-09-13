-- insert version
INSERT INTO version (id, version) VALUES (1, '0.0.1');

-- create sync info table
CREATE TABLE sync_info (
    chain_id TEXT PRIMARY KEY NOT NULL,
    start_height BIGINT PRIMARY KEY NOT NULL,
    end_height BIGINT,
    synced_height BIGINT
);

-- create client table
CREATE TABLE client (
    chain_id TEXT PRIMARY KEY NOT NULL,
    client_id TEXT PRIMARY KEY NOT NULL,
    counterparty_chain_id TEXT NOT NULL,
    counterparty_client_id TEXT NOT NULL
    trusting_period BIGINT NOT NULL,
    revision_height BIGINT NOT NULL,
    last_update_time BIGINT NOT NULL -- in second
);

-- create connection table
CREATE TABLE connection (
    chain_id TEXT PRIMARY KEY NOT NULL,
    connection_id TEXT PRIMARY KEY NOT NULL,
    client_id TEXT NOT NULL,
    counterparty_chain_id TEXT NOT NULL,
    counterparty_connection_id TEXT NOT NULL
    counterparty_client_id TEXT NOT NULL
);

-- create packet tables

-- create packet send table, table for execute packet_recv
-- store send_packet event
CREATE TABLE packet_send (
    -- pk
    dst_chain_id TEXT PRIMARY KEY NOT NULL,
    dst_connection_id TEXT PRIMARY KEY NOT NULL,
    dst_channel_id TEXT PRIMARY KEY NOT NULL,
    sequence BIGINT PRIMARY KEY NOT NULL,

    -- in progress
    in_progress BOOLEAN,

    -- packet data
    dst_port TEXT NOT NULL,
    src_chain_id TEXT NOT NULL, -- add this for filtering
    src_connection_id TEXT NOT NULL,
    src_port TEXT NOT NULL,
    src_channel_id TEXT NOT NULL,
    packet_data TEXT NOT NULL,
    timeout_height BIGINT NOT NULL,
    timeout_timestamp BIGINT NOT NULL,
    timeout_height_raw TEXT NOT NULL,
    timeout_timestamp_raw: TEXT NOT NULL
)

-- create packet timeout table, table for execute timeout
-- store send_packet event
CREATE TABLE packet_timeout (
    -- pk
    src_chain_id TEXT PRIMARY KEY NOT NULL,
    src_connection_id TEXT PRIMARY KEY NOT NULL,
    src_channel_id TEXT PRIMARY KEY NOT NULL,
    sequence BIGINT PRIMARY KEY NOT NULL,

    -- in progress
    in_progress BOOLEAN,

    -- packet data
    src_port TEXT NOT NULL,
    dst_chain_id TEXT NOT NULL, -- add this for filtering
    dst_connection_id TEXT NOT NULL,
    dst_port TEXT NOT NULL,
    dst_channel_id TEXT NOT NULL,
    packet_data TEXT NOT NULL,
    timeout_height BIGINT NOT NULL,
    timeout_timestamp BIGINT NOT NULL,
    timeout_height_raw TEXT NOT NULL,
    timeout_timestamp_raw: TEXT NOT NULL
)

-- create packet write ack table, table for execute ack
-- store write_acknowledgement event
CREATE TABLE packet_write_ack (
    -- pk
    src_chain_id TEXT PRIMARY KEY NOT NULL,
    src_connection_id TEXT PRIMARY KEY NOT NULL,
    src_channel_id TEXT PRIMARY KEY NOT NULL,
    sequence BIGINT PRIMARY KEY NOT NULL,

    -- in progress
    in_progress BOOLEAN,

    -- packet data
    src_port TEXT NOT NULL,
    dst_chain_id TEXT NOT NULL, -- add this for filtering
    dst_connection_id TEXT NOT NULL,
    dst_port TEXT NOT NULL,
    dst_channel_id TEXT NOT NULL,
    packet_data TEXT NOT NULL,
    ack TEXT NOT NULL,
    timeout_height BIGINT NOT NULL,
    timeout_timestamp BIGINT NOT NULL,
    timeout_height_raw TEXT NOT NULL,
    timeout_timestamp_raw: TEXT NOT NULL
)