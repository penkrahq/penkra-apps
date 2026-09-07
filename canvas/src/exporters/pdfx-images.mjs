import { PDFArray, PDFBool, PDFDict, PDFName, PDFNull, PDFNumber, PDFRawStream, decodePDFRawStream } from "pdf-lib";

const IMAGE_FILTERS = new Set(["FlateDecode", "DCTDecode"]);
const SAMPLE_DEPTHS = new Set([1, 2, 4, 8, 16]);
const MAX_DECODED_IMAGE_BYTES = 64 * 1024 * 1024;

function raw(dict, key) {
  return dict instanceof PDFDict ? dict.get(PDFName.of(key)) : undefined;
}

function present(dict, key) {
  return raw(dict, key) !== undefined;
}

function lookup(value, resolve) {
  try {
    const object = resolve(value);
    return { ok: object !== undefined && object !== null && object !== PDFNull, object };
  } catch {
    return { ok: false, object: undefined };
  }
}

function decodedName(value, resolve) {
  const result = lookup(value, resolve);
  return result.object instanceof PDFName ? result.object.decodeText() : undefined;
}

function addSoftMaskIssue(add, path) {
  add("IMAGE_SOFT_MASK_INVALID", "6.16", path);
}

function validInteger(value) {
  return value instanceof PDFNumber && Number.isSafeInteger(value.asNumber()) && value.asNumber() > 0;
}

function dimensions(dict, path, add) {
  const width = raw(dict, "Width");
  const height = raw(dict, "Height");
  let valid = true;
  for (const [key, value] of [["Width", width], ["Height", height]]) {
    if (!validInteger(value)) {
      add("IMAGE_DIMENSION_INVALID", "6.16", `${path}/${key}`);
      valid = false;
    }
  }
  if (!valid) return null;
  const widthValue = width.asNumber();
  const heightValue = height.asNumber();
  if (widthValue > MAX_DECODED_IMAGE_BYTES || heightValue > MAX_DECODED_IMAGE_BYTES) {
    add("IMAGE_DIMENSION_INVALID", "6.16", path);
    return null;
  }
  return { width: widthValue, height: heightValue };
}

function bitsPerComponent(dict, path, add, softMask) {
  const value = raw(dict, "BitsPerComponent");
  if (!(value instanceof PDFNumber) || !SAMPLE_DEPTHS.has(value.asNumber())) {
    add("IMAGE_BITS_INVALID", "6.16", `${path}/BitsPerComponent`);
    if (softMask) addSoftMaskIssue(add, `${path}/BitsPerComponent`);
    return null;
  }
  return value.asNumber();
}

function colorSpace(dict, path, resolve, add, softMask) {
  const value = raw(dict, "ColorSpace");
  const result = lookup(value, resolve);
  if (!result.ok) {
    if (softMask) addSoftMaskIssue(add, `${path}/ColorSpace`);
    else add("IMAGE_COLOR_SPACE_INVALID", "6.4", `${path}/ColorSpace`);
    return null;
  }
  if (result.object instanceof PDFName) {
    const color = result.object.decodeText();
    if (softMask) {
      if (color !== "DeviceGray") addSoftMaskIssue(add, `${path}/ColorSpace`);
      return color === "DeviceGray" ? 1 : null;
    }
    if (color === "DeviceRGB") return 3;
    if (color === "DeviceGray") return 1;
    add("IMAGE_COLOR_SPACE_OUTSIDE_SUBSET", "6.4", `${path}/ColorSpace`);
    return null;
  }
  if (result.object instanceof PDFArray && result.object.size() > 0) {
    if (softMask) addSoftMaskIssue(add, `${path}/ColorSpace`);
    else add("IMAGE_COLOR_SPACE_OUTSIDE_SUBSET", "6.4", `${path}/ColorSpace`);
    return null;
  }
  if (softMask) addSoftMaskIssue(add, `${path}/ColorSpace`);
  else add("IMAGE_COLOR_SPACE_INVALID", "6.4", `${path}/ColorSpace`);
  return null;
}

function filterKind(dict, path, resolve, add) {
  const value = raw(dict, "Filter");
  if (value === undefined) return "raw";
  const resolved = lookup(value, resolve).object;
  const values = resolved instanceof PDFArray ? resolved.asArray() : [resolved];
  if (values.length !== 1 || !values[0] || !IMAGE_FILTERS.has(decodedName(values[0], resolve))) {
    add("IMAGE_FILTER_OUTSIDE_SUBSET", "6.8", `${path}/Filter`);
    return "unsupported";
  }
  return decodedName(values[0], resolve) === "FlateDecode" ? "flate" : "dct";
}

function validateData(object, path, dict, dimensionsValue, channels, bits, filter, resolve, add, softMask) {
  if (!dimensionsValue || !channels || !bits || filter === "unsupported" || filter === "dct") return;
  if (present(dict, "DecodeParms")) {
    add("IMAGE_DECODE_PARAMS_OUTSIDE_SUBSET", "6.8", `${path}/DecodeParms`);
    return;
  }
  const rowBits = dimensionsValue.width * channels * bits;
  const rowBytes = Math.ceil(rowBits / 8);
  const expected = rowBytes * dimensionsValue.height;
  if (!Number.isSafeInteger(rowBits) || !Number.isSafeInteger(rowBytes) || !Number.isSafeInteger(expected) || expected > MAX_DECODED_IMAGE_BYTES) {
    add("IMAGE_DIMENSION_INVALID", "6.16", path);
    return;
  }
  let decoded;
  try {
    decoded = filter === "raw" ? object.contents : decodePDFRawStream(object).decode();
  } catch {
    add("IMAGE_DATA_INVALID", "6.16", path);
    if (softMask) addSoftMaskIssue(add, path);
    return;
  }
  if (decoded.length !== expected) {
    add("IMAGE_DATA_LENGTH_INVALID", "6.16", path);
    if (softMask) addSoftMaskIssue(add, path);
  }
}

function validateImage(object, path, context, state, options = {}) {
  const { resolve, add } = context;
  const softMask = Boolean(options.softMask);
  if (state.active.has(object)) {
    addSoftMaskIssue(add, path);
    return;
  }
  if (state.visited.has(object)) return;
  state.visited.add(object);
  state.active.add(object);
  try {
    const dict = object.dict;
    const dimensionsValue = dimensions(dict, path, add);
    if (softMask && !dimensionsValue) addSoftMaskIssue(add, path);
    const imageMaskRaw = raw(dict, "ImageMask");
    const imageMask = imageMaskRaw === undefined ? false : imageMaskRaw instanceof PDFBool ? imageMaskRaw.value : null;
    if (imageMask === null) add("IMAGE_MASK_INVALID", "6.16", `${path}/ImageMask`);
    else if (imageMask) add("IMAGE_MASK_OUTSIDE_SUBSET", "6.16", `${path}/ImageMask`);

    let channels = null;
    let bits = null;
    if (!imageMask) {
      bits = bitsPerComponent(dict, path, add, softMask);
      channels = colorSpace(dict, path, resolve, add, softMask);
    }

    if (softMask) {
      if (decodedName(raw(dict, "Type"), resolve) && decodedName(raw(dict, "Type"), resolve) !== "XObject") addSoftMaskIssue(add, `${path}/Type`);
      if (present(dict, "Mask")) addSoftMaskIssue(add, `${path}/Mask`);
      if (present(dict, "SMask")) addSoftMaskIssue(add, `${path}/SMask`);
      if (present(dict, "Matte")) add("IMAGE_MATTE_OUTSIDE_SUBSET", "7.4", `${path}/Matte`);
    } else {
      const maskRaw = raw(dict, "SMask");
      if (maskRaw !== undefined) {
        const maskPath = `${path}/SMask`;
        const mask = lookup(maskRaw, resolve);
        if (!mask.ok || !(mask.object instanceof PDFRawStream) || decodedName(raw(mask.object.dict, "Subtype"), resolve) !== "Image") addSoftMaskIssue(add, maskPath);
        else validateImage(mask.object, maskPath, context, state, { softMask: true });
      }
    }

    const filter = filterKind(dict, path, resolve, add);
    validateData(object, path, dict, dimensionsValue, channels, bits, filter, resolve, add, softMask);
  } finally {
    state.active.delete(object);
  }
}

export function inspectPageImages(page, path, context) {
  const { resolve, get, name, add } = context;
  let resources;
  try { resources = resolve(page.node.Resources()); } catch { return; }
  let xObjects;
  try { xObjects = get(resources, "XObject"); } catch { return; }
  if (!(xObjects instanceof PDFDict)) return;
  const state = { visited: new WeakSet(), active: new WeakSet() };
  for (const [key, value] of xObjects.entries()) {
    const objectPath = `${path}/Resources/XObject/${key.decodeText()}`;
    let object;
    try { object = resolve(value); } catch { add("XOBJECT_UNRESOLVED", "6.3", objectPath); continue; }
    if (!(object instanceof PDFRawStream)) { add("XOBJECT_UNRESOLVED", "6.3", objectPath); continue; }
    const subtype = name(get(object.dict, "Subtype"));
    if (subtype === "Form") { add("FORM_XOBJECT_OUTSIDE_SUBSET", "6.1", objectPath); continue; }
    if (subtype !== "Image") { add("XOBJECT_SUBTYPE_UNSUPPORTED", "6.1", objectPath); continue; }
    validateImage(object, objectPath, context, state);
  }
}
