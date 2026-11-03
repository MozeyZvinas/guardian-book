-- UUID v7 primary keys (RFC 9562) on Postgres 16, which has no uuidv7() yet (that arrives in
-- Postgres 18). Takes a random v4 UUID, overwrites its first 48 bits with the millisecond
-- timestamp and sets the version nibble to 0111. Bits 52 and 53 of the 16-byte value are the
-- two low bits of the version nibble (the v4 nibble 0100 already has bit 54 set).
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send((floor(extract(epoch FROM clock_timestamp()) * 1000))::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$ LANGUAGE sql VOLATILE;
