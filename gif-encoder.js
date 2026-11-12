(function () {
  "use strict";

  function word(value) {
    return [value & 255, (value >> 8) & 255];
  }

  function ascii(value) {
    return Array.from(value, (char) => char.charCodeAt(0));
  }

  function colorTable() {
    const table = new Uint8Array(256 * 3);
    for (let index = 1; index <= 252; index += 1) {
      const value = index - 1;
      const red = Math.floor(value / 42);
      const green = Math.floor((value % 42) / 6);
      const blue = value % 6;
      table[index * 3] = red * 51;
      table[index * 3 + 1] = Math.round(green * 42.5);
      table[index * 3 + 2] = blue * 51;
    }
    return table;
  }

  function quantize(rgba) {
    const pixels = new Uint8Array(rgba.length / 4);
    for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
      if (rgba[source + 3] < 24) {
        pixels[target] = 0;
        continue;
      }
      const red = Math.min(5, Math.round(rgba[source] / 51));
      const green = Math.min(6, Math.round(rgba[source + 1] / 42.5));
      const blue = Math.min(5, Math.round(rgba[source + 2] / 51));
      pixels[target] = 1 + red * 42 + green * 6 + blue;
    }
    return pixels;
  }

  function lzw(indices) {
    const clearCode = 256;
    const endCode = 257;
    let codeSize = 9;
    let nextCode = 258;
    let dictionary = new Map();
    const bytes = [];
    let bitBuffer = 0;
    let bitCount = 0;

    function emit(code) {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        bytes.push(bitBuffer & 255);
        bitBuffer >>>= 8;
        bitCount -= 8;
      }
    }

    function reset() {
      dictionary = new Map();
      codeSize = 9;
      nextCode = 258;
    }

    emit(clearCode);
    let prefix = indices[0];
    for (let index = 1; index < indices.length; index += 1) {
      const value = indices[index];
      const key = prefix * 256 + value;
      const existing = dictionary.get(key);
      if (existing !== undefined) {
        prefix = existing;
        continue;
      }

      emit(prefix);
      if (nextCode < 4096) {
        dictionary.set(key, nextCode);
        nextCode += 1;
        // GIF decoders build the table one emitted code behind the encoder.
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize += 1;
      } else {
        emit(clearCode);
        reset();
      }
      prefix = value;
    }
    emit(prefix);
    emit(endCode);
    if (bitCount > 0) bytes.push(bitBuffer & 255);
    return new Uint8Array(bytes);
  }

  function blocks(data) {
    const output = [];
    for (let offset = 0; offset < data.length; offset += 255) {
      const length = Math.min(255, data.length - offset);
      output.push(length, ...data.subarray(offset, offset + length));
    }
    output.push(0);
    return output;
  }

  window.encodeGif = function encodeGif(width, height, frames, delayMs) {
    const output = [];
    output.push(...ascii("GIF89a"), ...word(width), ...word(height), 0xf7, 0, 0);
    output.push(...colorTable());
    output.push(0x21, 0xff, 0x0b, ...ascii("NETSCAPE2.0"), 3, 1, 0, 0, 0);

    const delay = Math.max(2, Math.round(delayMs / 10));
    for (const rgba of frames) {
      const compressed = lzw(quantize(rgba));
      output.push(0x21, 0xf9, 4, 0x09, ...word(delay), 0, 0);
      output.push(0x2c, 0, 0, 0, 0, ...word(width), ...word(height), 0);
      output.push(8, ...blocks(compressed));
    }
    output.push(0x3b);
    return new Blob([new Uint8Array(output)], { type: "image/gif" });
  };
})();
