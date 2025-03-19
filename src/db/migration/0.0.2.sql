-- update version
UPDATE version set version = '0.0.2' WHERE id == 1;

-- create channel_connection table
CREATE TABLE channel_connection (
    chain_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    PRIMARY KEY (chain_id, channel_id)
);