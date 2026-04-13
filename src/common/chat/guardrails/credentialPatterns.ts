/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const ASSIGNMENT_STYLE_SECRET_PATTERNS = [
  /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)\b\s*=\s*([^\s'"]+)/g,
];

export const INLINE_SECRET_PATTERNS = [/\bsk-ant-[A-Za-z0-9-]+\b/g, /\bsk-[A-Za-z0-9-]{10,}\b/g];
