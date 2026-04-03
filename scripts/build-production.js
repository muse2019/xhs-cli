#!/usr/bin/env node
/**
 * 生产环境构建脚本
 * - 移除 console.log
 * - 可选：混淆代码
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionDir = join(__dirname, '..', 'extension');

// 需要处理的文件
const files = ['background.js', 'content.js'];

/**
 * 移除 console.log 语句
 * 保留 console.error 和 console.warn（用于错误追踪）
 */
function removeConsoleLogs(code) {
  // 匹配 console.log(...) 语句
  // 处理多行调用
  let result = code;

  // 移除 console.log
  result = result.replace(/console\.log\s*\([^)]*\);?\n?/g, '');

  // 移除多行 console.log
  result = result.replace(/console\.log\s*\([\s\S]*?\);?\n?/g, '');

  // 移除空的 console.log
  result = result.replace(/console\.log\s*\(\s*\);?\n?/g, '');

  return result;
}

/**
 * 添加生产环境标记
 */
function addProductionFlag(code, filename) {
  const banner = `/* PRODUCTION BUILD - ${new Date().toISOString()} */\n`;
  return banner + code;
}

console.log('Building production extension...\n');

for (const file of files) {
  const filePath = join(extensionDir, file);
  let code = readFileSync(filePath, 'utf-8');

  const originalSize = code.length;

  // 移除 console.log
  code = removeConsoleLogs(code);

  // 添加生产标记
  code = addProductionFlag(code, file);

  // 写回文件
  writeFileSync(filePath, code, 'utf-8');

  const newSize = code.length;
  const reduction = ((originalSize - newSize) / originalSize * 100).toFixed(1);

  console.log(`✓ ${file}: ${originalSize} -> ${newSize} bytes (-${reduction}%)`);
}

console.log('\n✓ Production build complete');
console.log('Note: Original files have been modified. Run "git checkout extension/" to restore.');
