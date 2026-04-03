/**
 * Stealth anti-detection module.
 *
 * 移植自 opencli 并增强，包含：
 * 1. 基础反检测（navigator.webdriver 伪装等）
 * 2. 真人行为模拟（鼠标轨迹、随机延迟）
 * 3. 浏览器指纹伪装
 */

export { generateStealthJs } from './stealth-script.js';
export { HumanBehavior } from './human-behavior.js';
export { MouseTrajectory } from './mouse-trajectory.js';
export { RandomDelay } from './random-delay.js';
