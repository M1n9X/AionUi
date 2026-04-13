/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const SOURCE_CODE_REQUEST_PATTERNS = [/代码/, /源码/, /source\s*code/i, /贴出来/, /发给我/, /配置文件/];

export const IMPLEMENTATION_DISCUSSION_PATTERNS = [/怎么实现/, /实现方式/, /底层逻辑/, /架构/, /内部操作过程/];

export const FILE_AND_SYMBOL_DISCLOSURE_PATTERNS = [/哪个文件/, /什么函数/, /什么类/, /什么模块/, /路径/];

export const CREDENTIAL_DISCLOSURE_PATTERNS = [
  /环境变量/,
  /\btoken\b/i,
  /\bsecret\b/i,
  /\bcredential/i,
  /\bapi[_ -]?key\b/i,
];
