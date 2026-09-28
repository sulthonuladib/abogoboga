import * as fs from 'node:fs';

const GENERATED_MESSAGE = `
/**
 * Generated code (protobuf and other codegen output).
 *
 * Codegen targets write into this package. Re-export generated modules here so
 * the rest of the workspace imports them through \`@lister/generated\`.
 *
 * @module
 */
` as const;


console.log(__dirname);

// read all from this dir and then export all from ../src/mexc-websocket-proto/ file name into ../src/index.ts
// e.g we have ../src/mexc-websocket-proto/FileTest.ts 
// then we write on the ../src/index.ts file 
// `export * from './mexc-websocket-proto/FileTest';`

const files = fs.readdirSync(`${__dirname}/../src/mexc-websocket-proto/`);

let generatedCode = '';

files.forEach(file => {
  if (file.endsWith('.ts')) {
    const filename = file.replace('.ts', '');
    generatedCode += `export * from './mexc-websocket-proto/${filename}';\n`;
  }
});

fs.writeFileSync(`${__dirname}/../src/index.ts`, GENERATED_MESSAGE + generatedCode);
