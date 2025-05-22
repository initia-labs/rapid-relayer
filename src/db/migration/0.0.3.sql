-- update pk
ALTER TABLE packet_send DROP CONSTRAINT packet_send_pkey;

ALTER TABLE packet_send 
ADD PRIMARY KEY (dst_chain_id, dst_channel_id, src_chain_id, sequence);