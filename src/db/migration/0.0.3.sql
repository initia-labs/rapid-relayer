-- Update pk

-- Create the new table with updated primary key
CREATE TABLE packet_send_new (
    dst_chain_id TEXT NOT NULL,
    dst_channel_id TEXT NOT NULL,
    sequence BIGINT NOT NULL,
    in_progress BOOLEAN,
    is_ordered BOOLEAN,
    height BIGINT NOT NULL,
    dst_connection_id TEXT NOT NULL,
    dst_port TEXT NOT NULL,
    src_chain_id TEXT NOT NULL,
    src_connection_id TEXT NOT NULL,
    src_port TEXT NOT NULL,
    src_channel_id TEXT NOT NULL,
    packet_data TEXT NOT NULL,
    timeout_height BIGINT NOT NULL,
    timeout_timestamp BIGINT NOT NULL,
    timeout_height_raw TEXT NOT NULL,
    timeout_timestamp_raw TEXT NOT NULL,

    PRIMARY KEY (dst_chain_id, dst_channel_id, src_channel_id, sequence)
);

-- Copy data from old table
INSERT INTO packet_send_new
SELECT * FROM packet_send;

-- Drop the old table
DROP TABLE packet_send;

-- Rename new table to original name
ALTER TABLE packet_send_new RENAME TO packet_send;
