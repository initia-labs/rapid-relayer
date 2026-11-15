-- update version
UPDATE version set version = '0.0.5' WHERE id == 1;

-- The wallet loop selects timeout packets by (src_chain_id, dst_chain_id,
-- in_progress). The primary key starts with (src_chain_id, src_channel_id),
-- so without this index every loop scans all rows of the chain
CREATE INDEX IF NOT EXISTS idx_pt_src_dst ON packet_timeout(src_chain_id, dst_chain_id, in_progress);
