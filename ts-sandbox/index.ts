import { glob } from "glob";
import path from "path";
import * as fsAsync from "node:fs/promises";
import * as fs from "node:fs";
import * as fflate from "fflate";
import JSZip from "jszip";
import crypto, { BinaryLike } from "node:crypto";
import UZIP from "uzip";

interface Args {
  name: string;
  globPattern: string[];
  targetDir: string;
  cwd: string;
  date: Date;
}

interface Ret {
  zipPath: string;
  buffer: BinaryLike;
}

async function calculateHash(binary: BinaryLike): Promise<string> {
  const hash = crypto.createHash("md5");
  hash.update(binary);
  return hash.digest("hex");
}

async function getFiles(globPattern: string[], cwd: string) {
  const jsfiles = await glob(globPattern, { cwd, absolute: false });
  const promises = jsfiles.sort().map(async (file) => {
    const fpath = path.join(cwd, file);
    const buffer = new Uint8Array(await fsAsync.readFile(fpath));
    return {
      path: file,
      buffer,
    };
  });

  const resolvedPathBuffer = await Promise.all(promises);
  return resolvedPathBuffer;
}

async function withFflate(args: Args): Promise<Ret> {
  const { name, globPattern, targetDir: fnDir, cwd, date } = args;

  const resolvedPathBuffer = await getFiles(globPattern, cwd);

  const filenamesAndContents = resolvedPathBuffer.reduce(
    (acc, { path, buffer }) => {
      return { ...acc, [path]: buffer };
    },
    {},
  );

  const fflateZipContent = fflate.zipSync(filenamesAndContents, {
    os: 3,
    mtime: date,
  });

  const zipName = `${name}.zip`;
  const zipPath = path.join(fnDir, zipName);
  return {
    zipPath,
    buffer: Buffer.from(fflateZipContent),
  };
}

async function withJSzip(args: Args): Promise<Ret> {
  const { name, globPattern, targetDir: fnDir, cwd, date } = args;

  const zipFile = new JSZip();
  // this date is set to a static value so that the hash of the zip archive is deterministic

  const resolvedPathBuffer = await getFiles(globPattern, cwd);
  // we need to preserve the order of files in the zip archive
  resolvedPathBuffer.forEach(({ path, buffer }) => {
    zipFile.file(path, buffer, { date: new Date(date), createFolders: false });
  });
  // this can be further improved by using streams
  const buff = await zipFile.generateAsync({
    type: "nodebuffer",
    streamFiles: false,
  });

  const zipName = `${name}.zip`;
  const zipPath = path.join(fnDir, zipName);
  return {
    zipPath,
    buffer: buff,
  };
}

async function withUzip(args: Args): Promise<Ret> {
  const { name, globPattern, targetDir: fnDir, cwd, date } = args;

  const resolvedPathBuffer = await getFiles(globPattern, cwd);

  const filenamesAndContents = resolvedPathBuffer.reduce(
    (acc, { path, buffer }) => {
      return { ...acc, [path]: buffer };
    },
    {},
  );
  // var obj = { "file.txt":new Uint8Array([72,69,76,76,79]),  "dir/photo.jpg":...,  "dir/pic.png":... };
  var zipFile = UZIP.encode(filenamesAndContents);

  const zipName = `${name}.zip`;
  const zipPath = path.join(fnDir, zipName);
  return {
    zipPath,
    buffer: Buffer.from(zipFile),
  };
}

async function withDate(args: Args) {
  const { name, globPattern, targetDir, cwd, date } = args;

  const resultFflate = await withFflate({
    name: `${name}_fflate`,
    globPattern,
    targetDir,
    cwd,
    date,
  });
  fs.writeFileSync(resultFflate.zipPath, resultFflate.buffer);

  const resultJsZip = await withJSzip({
    name: `${name}_jszip`,
    globPattern,
    targetDir,
    cwd,
    date,
  });
  fs.writeFileSync(resultJsZip.zipPath, resultJsZip.buffer);

  const resultUzip = await withUzip({
    name: `${name}_uzip`,
    globPattern,
    targetDir,
    cwd,
    date,
  });
  fs.writeFileSync(resultUzip.zipPath, resultUzip.buffer);

  console.log(resultFflate.zipPath, await calculateHash(resultFflate.buffer));
  console.log(resultJsZip.zipPath, await calculateHash(resultJsZip.buffer));
  console.log(resultUzip.zipPath, await calculateHash(resultUzip.buffer));
}

(async () => {
  const name = "result";
  const globPattern = ["index.ts"];
  const targetDir = "./res";
  const cwd = __dirname;
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);
  // const date = 504932400000; // 1986-01-01 03:00 UTC
  // const date = new Date("1986-01-01T03:00:00.000Z"); // Wednesday, 1 January 1986 03:00:00 in UTC

  await withDate({
    name: `${name}_1980`,
    globPattern,
    targetDir,
    cwd,
    date: new Date("1980-00-00T00:00:00.000Z"),
  });

  await withDate({
    name: `${name}_1986`,
    globPattern,
    targetDir,
    cwd,
    date: new Date("1986-01-01T03:00:00.000Z"),
  });

  // const date = new Date(1980, 0, 1); // January 1, 1980 at 00:00:00 in local time
  // const date = ; // January 1, 1986 at 03:00:00 in local time

  await withDate({
    name: `${name}_1980_num`,
    globPattern,
    targetDir,
    cwd,
    date: new Date(1980, 0, 1),
  });

  await withDate({
    name: `${name}_1986_num`,
    globPattern,
    targetDir,
    cwd,
    date: new Date(1986, 0, 1, 3),
  });
})();
