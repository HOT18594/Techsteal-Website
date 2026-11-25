// Zero-dependency Minecraft Java Edition binary NBT parser.
// Supports Gzip-compressed (.dat), Zlib-compressed, and raw uncompressed NBT,
// plus Java Modified UTF-8 (CESU-8) so supplementary-plane emojis in custom
// item names decode cleanly instead of turning into replacement characters.

import { gunzipSync, inflateSync } from "node:zlib";

export type NbtValue =
  | number
  | string
  | bigint
  | NbtValue[]
  | { [key: string]: NbtValue };

const MAX_DEPTH = 48;
const MAX_COLLECTION = 65_536;

/** Decode Java Modified UTF-8 (CESU-8) bytes into a standard JS string. */
function decodeModifiedUtf8(buf: Buffer, start: number, len: number): string {
  const end = start + len;
  // Fast path: pure ASCII or standard UTF-8 with no CESU-8 surrogate pair prefix (0xED 0xA0..0xBF)
  let needsCesu = false;
  for (let i = start; i < end; i++) {
    const b = buf[i];
    if (b === 0xc0 && i + 1 < end && buf[i + 1] === 0x80) {
      needsCesu = true;
      break;
    }
    if (b === 0xed && i + 1 < end && buf[i + 1] >= 0xa0 && buf[i + 1] <= 0xbf) {
      needsCesu = true;
      break;
    }
  }
  if (!needsCesu) {
    return buf.toString("utf8", start, end);
  }

  // Decode UTF-16 code units (CESU-8 encodes surrogate halves as two 3-byte sequences)
  const units: number[] = [];
  let i = start;
  while (i < end) {
    const b1 = buf[i++];
    if ((b1 & 0x80) === 0) {
      units.push(b1);
    } else if ((b1 & 0xe0) === 0xc0 && i < end) {
      const b2 = buf[i++];
      units.push(((b1 & 0x1f) << 6) | (b2 & 0x3f));
    } else if ((b1 & 0xf0) === 0xe0 && i + 1 < end) {
      const b2 = buf[i++];
      const b3 = buf[i++];
      units.push(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
    } else if ((b1 & 0xf8) === 0xf0 && i + 2 < end) {
      const b2 = buf[i++];
      const b3 = buf[i++];
      const b4 = buf[i++];
      const cp = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
      const adj = cp - 0x10000;
      units.push(0xd800 + (adj >> 10), 0xdc00 + (adj & 0x3ff));
    } else {
      units.push(0xfffd);
    }
  }
  let out = "";
  for (let c = 0; c < units.length; c += 4096) {
    out += String.fromCharCode(...units.slice(c, c + 4096));
  }
  return out;
}

export function decompressNbtBuffer(raw: Buffer): Buffer {
  if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
    return gunzipSync(raw);
  }
  if (raw.length >= 2 && raw[0] === 0x78 && (raw[1] === 0x01 || raw[1] === 0x9c || raw[1] === 0xda)) {
    return inflateSync(raw);
  }
  return raw;
}

export function parseNbt(raw: Buffer): Record<string, NbtValue> {
  const buf = decompressNbtBuffer(raw);
  let offset = 0;

  const ensure = (bytes: number) => {
    if (offset + bytes > buf.length) {
      throw new Error("Unexpected end of NBT buffer.");
    }
  };

  const readByte = () => {
    ensure(1);
    return buf.readInt8(offset++);
  };
  const readShort = () => {
    ensure(2);
    const v = buf.readInt16BE(offset);
    offset += 2;
    return v;
  };
  const readUShort = () => {
    ensure(2);
    const v = buf.readUInt16BE(offset);
    offset += 2;
    return v;
  };
  const readInt = () => {
    ensure(4);
    const v = buf.readInt32BE(offset);
    offset += 4;
    return v;
  };
  const readLong = () => {
    ensure(8);
    const v = buf.readBigInt64BE(offset);
    offset += 8;
    return v;
  };
  const readFloat = () => {
    ensure(4);
    const v = buf.readFloatBE(offset);
    offset += 4;
    return v;
  };
  const readDouble = () => {
    ensure(8);
    const v = buf.readDoubleBE(offset);
    offset += 8;
    return v;
  };
  const readString = () => {
    const len = readUShort();
    ensure(len);
    const str = decodeModifiedUtf8(buf, offset, len);
    offset += len;
    return str;
  };

  function readPayload(tagType: number, depth: number): NbtValue {
    if (depth > MAX_DEPTH) throw new Error("NBT nesting depth exceeded.");
    switch (tagType) {
      case 1:
        return readByte();
      case 2:
        return readShort();
      case 3:
        return readInt();
      case 4:
        return readLong();
      case 5:
        return readFloat();
      case 6:
        return readDouble();
      case 7: {
        const len = readInt();
        if (len < 0 || len > MAX_COLLECTION) throw new Error("Invalid NBT byte array length.");
        const arr: number[] = new Array(len);
        for (let i = 0; i < len; i++) arr[i] = readByte();
        return arr;
      }
      case 8:
        return readString();
      case 9: {
        const elemType = readByte();
        const len = readInt();
        if (len < 0 || len > MAX_COLLECTION) throw new Error("Invalid NBT list length.");
        const arr: NbtValue[] = new Array(len);
        for (let i = 0; i < len; i++) {
          arr[i] = readPayload(elemType, depth + 1);
        }
        return arr;
      }
      case 10: {
        const obj: Record<string, NbtValue> = {};
        while (true) {
          const childType = readByte();
          if (childType === 0) break;
          const name = readString();
          obj[name] = readPayload(childType, depth + 1);
        }
        return obj;
      }
      case 11: {
        const len = readInt();
        if (len < 0 || len > MAX_COLLECTION) throw new Error("Invalid NBT int array length.");
        const arr: number[] = new Array(len);
        for (let i = 0; i < len; i++) arr[i] = readInt();
        return arr;
      }
      case 12: {
        const len = readInt();
        if (len < 0 || len > MAX_COLLECTION) throw new Error("Invalid NBT long array length.");
        const arr: bigint[] = new Array(len);
        for (let i = 0; i < len; i++) arr[i] = readLong();
        return arr;
      }
      default:
        throw new Error(`Unsupported NBT tag type: ${tagType}`);
    }
  }

  const rootType = readByte();
  if (rootType !== 10) {
    throw new Error(`Expected root Compound tag (10), got ${rootType}.`);
  }
  readString(); // root name (usually empty)
  return readPayload(10, 0) as Record<string, NbtValue>;
}
