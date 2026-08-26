import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePencilShader,
  resolvePencilShaderUniforms,
  transpilePencilShaderWebGL1,
} from "./pencil-shader-runtime.mjs";

test("parses the full Pencil shader uniform directive contract", () => {
  const definition = parsePencilShader(`#version 100
/** @resolution */ uniform vec2 u_resolution;
/** @time */ uniform float u_time;
/** @mouse */ uniform vec2 u_mouse;
/** @sdf */ uniform sampler2D u_sdf;
/** @backdrop */ uniform sampler2D u_backdrop;
/**
 * @label Radius
 * @range 1, 20
 * @default 4
 */
uniform float u_radius;
/** @color\n * @default #ff0000 */ uniform vec3 u_color;
/** @default images/noise.png */ uniform sampler2D u_noise;
`);

  assert.deepEqual(definition.uniforms.map(({ name, automatic }) => [name, automatic]), [
    ["u_resolution", "resolution"], ["u_time", "time"], ["u_mouse", "mouse"],
    ["u_sdf", "sdf"], ["u_backdrop", "backdrop"], ["u_radius", null],
    ["u_color", null], ["u_noise", null],
  ]);
  assert.deepEqual(resolvePencilShaderUniforms(definition), {
    u_radius: 4,
    u_color: "#ff0000",
    u_noise: "images/noise.png",
  });
});

test("rejects invalid directives and unknown or automatic overrides", () => {
  assert.throws(() => parsePencilShader("/** @time */ uniform vec2 bad;"), /must have type float/u);
  const definition = parsePencilShader("/** @resolution */ uniform vec2 size;");
  assert.throws(() => resolvePencilShaderUniforms(definition, { size: [1, 2] }), /cannot be overridden/u);
  assert.throws(() => resolvePencilShaderUniforms(definition, { missing: 1 }), /not a declared uniform/u);
});

test("transpiles Pencil's textureSize extension without touching comments", () => {
  const definition = parsePencilShader(`#version 100
uniform sampler2D image;
// textureSize(image, 0) remains a comment
void main() { vec2 size = textureSize(image, 0); gl_FragColor = vec4(size, 0.0, 1.0); }
`);
  const source = transpilePencilShaderWebGL1(definition);
  assert.match(source, /uniform vec2 __pencil_texture_size_image;/u);
  assert.match(source, /vec2 size = __pencil_texture_size_image;/u);
  assert.match(source, /\/\/ textureSize\(image, 0\) remains a comment/u);
});
