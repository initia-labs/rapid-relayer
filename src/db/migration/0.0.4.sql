-- update version
UPDATE version set version = '0.0.4' WHERE id == 1;

-- Update pk

-- Create the new table with updated primary key

-- packet timeout
CREATE TABLE packet_timeout_new (
    src_chain_id TEXT NOT NULL,
    src_channel_id TEXT NOT NULL,
    sequence BIGINT NOT NULL,
    in_progress BOOLEAN,
    is_ordered BOOLEAN,
    src_connection_id TEXT NOT NULL,
    src_port TEXT NOT NULL,
    dst_chain_id TEXT NOT NULL,
    dst_connection_id TEXT NOT NULL,
    dst_port TEXT NOT NULL,
    dst_channel_id TEXT NOT NULL,
    packet_data TEXT NOT NULL,
    timeout_height BIGINT NOT NULL,
    timeout_timestamp BIGINT NOT NULL,
    timeout_height_raw TEXT NOT NULL,
    timeout_timestamp_raw TEXT NOT NULL,

    PRIMARY KEY (src_chain_id, src_channel_id, dst_channel_id, sequence)
);

-- Copy data from old table
INSERT INTO packet_timeout_new
SELECT * FROM packet_timeout;

-- Drop the old table
DROP TABLE packet_timeout;

-- Rename new table to original name
ALTER TABLE packet_timeout_new RENAME TO packet_timeout;

-- ack
CREATE TABLE packet_write_ack_new (
    src_chain_id TEXT NOT NULL,
    src_channel_id TEXT NOT NULL,
    sequence BIGINT NOT NULL,
    in_progress BOOLEAN,
    is_ordered BOOLEAN,
    height BIGINT NOT NULL,
    src_connection_id TEXT NOT NULL,
    src_port TEXT NOT NULL,
    dst_chain_id TEXT NOT NULL,
    dst_connection_id TEXT NOT NULL,
    dst_port TEXT NOT NULL,
    dst_channel_id TEXT NOT NULL,
    packet_data TEXT NOT NULL,
    ack TEXT NOT NULL,
    timeout_height BIGINT NOT NULL,
    timeout_timestamp BIGINT NOT NULL,
    timeout_height_raw TEXT NOT NULL,
    timeout_timestamp_raw TEXT NOT NULL,

    PRIMARY KEY (src_chain_id, src_channel_id, dst_channel_id, sequence)
);

-- Copy data from old table
INSERT INTO packet_write_ack_new
SELECT * FROM packet_write_ack;

-- Drop the old table
DROP TABLE packet_write_ack;

-- Rename new table to original name
ALTER TABLE packet_write_ack_new RENAME TO packet_write_ack;