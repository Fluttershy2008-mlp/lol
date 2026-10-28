// Private codecs for PNG dependency metadata helpers. Some Hermes hosts expose
// neither browser TextEncoder nor TextDecoder. Do not change host globals.
import { strToU8, strFromU8 } from 'fflate';
export class ImageTextEncoder {
  encode(value = '') { return strToU8(String(value)); }
}
export class ImageTextDecoder {
  constructor(label = 'utf-8') { this.latin1 = /^(latin1|iso-8859-1)$/i.test(label); }
  decode(value = new Uint8Array()) {
    const bytes = new Uint8Array(value.buffer ?? value, value.byteOffset ?? 0, value.byteLength);
    return strFromU8(bytes, this.latin1);
  }
}
